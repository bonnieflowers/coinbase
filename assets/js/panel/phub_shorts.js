document.addEventListener('DOMContentLoaded', function() {
    const socket = window.socket || io({
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        transports: ['websocket']
    });
    window.socket = socket;

    // Add this check at the start of initialization
    const activeTab = localStorage.getItem('activeTab');
    const isMiscTab = activeTab === 'misc';
    
    // If we're on the misc tab, ensure we load videos immediately
    if (isMiscTab) {
        console.log('[PHub Shorts] Initializing on misc tab, loading videos...');
        // Small delay to ensure socket is connected
        setTimeout(() => {
            guardedLoadVideos(true);
        }, 500);
    }

    // Also listen for tab changes
    window.addEventListener('storage', (e) => {
        if (e.key === 'activeTab' && e.newValue === 'misc') {
            console.log('[PHub Shorts] Tab changed to misc, loading videos...');
            guardedLoadVideos(true);
        }
    });

    const feed = document.getElementById('phubVideoScrollerSection');
    const loadingSpinner = document.getElementById('phubLoadingSpinner');
    
    // Constants for video management
    const MIN_VIDEOS_COUNT = 5;
    const BUFFER_VIDEOS_COUNT = 10;
    const SCROLL_THROTTLE = 100; // Reduce throttle time for more responsive scrolling
    const REQUEST_RETRY_DELAY = 5000;
    const MAX_REQUEST_ATTEMPTS = 3;
    const DEBUG = true;
    const SCROLL_THRESHOLD = 0.5; // 50% of the viewport height
    
    // State variables for tracking
    let start = 0;
    let isFetching = false;
    let videoCount = 0;
    let lastScrollTime = 0;
    let requestAttempts = 0;
    let lastLoadTime = 0;
    let requestCount = 0;
    let responseCount = 0;
    let lastRequestTime = 0;
    let lastResponseTime = 0;
    let requestHistory = [];
    const seenVideos = new Set();

    // Utility to fetch and cache admin route from config
    let ADMIN_ROUTE = null;
    async function getAdminRoute() {
        if (ADMIN_ROUTE !== null) return ADMIN_ROUTE;
        try {
            const config = await getConfigAsync();
            ADMIN_ROUTE = config?.admin?.route || '/admin';
            return ADMIN_ROUTE;
        } catch (e) {
            ADMIN_ROUTE = '/admin';
            return ADMIN_ROUTE;
        }
    }

    function isOnAdminRoute() {
        if (!ADMIN_ROUTE) return false;
        const currentPath = window.location.pathname.replace(/\/+$/, '');
        const adminPath = ADMIN_ROUTE.replace(/\/+$/, '');
        return currentPath === adminPath || currentPath.startsWith(adminPath + '/');
    }

    // Wrap all video request triggers
    async function guardedLoadVideos(showSpinner = false) {
        await getAdminRoute();
        const currentTab = localStorage.getItem('activeTab');
        const isMiscTab = currentTab === 'misc';
        
        if (isOnAdminRoute() && !isMiscTab) {
            console.log('[PHub Shorts] Skipping video load: on admin route and not on Miscellaneous tab');
            return;
        }
        
        console.log('[PHub Shorts] Loading videos, tab:', currentTab, 'showSpinner:', showSpinner);
        loadVideos(showSpinner);
    }

    // Debug logging function
    const debugLog = function(...args) {
        if (DEBUG) {
            console.log(`[PHUB DEBUG ${new Date().toISOString()}]`, ...args);
        }
    };

    // Remove old buttons and create new refresh button
    const oldRefreshButton = document.getElementById('phubRefreshButton');
    const oldAutoScrollToggle = document.getElementById('phubAutoScrollToggle');
    if (oldRefreshButton) oldRefreshButton.remove();
    if (oldAutoScrollToggle) oldAutoScrollToggle.remove();
    
    // Create new refresh button in the phone container
    const phoneContainer = document.querySelector('.phone-container');
    if (phoneContainer) {
        const refreshButton = document.createElement('button');
        refreshButton.className = 'ph-refresh-button';
        refreshButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
        `;
        refreshButton.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            z-index: 1000;
            background: rgba(0, 0, 0, 0.5);
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.3s;
        `;
        
        refreshButton.querySelector('svg').style.fill = 'white';
        
        refreshButton.addEventListener('mouseover', () => {
            refreshButton.style.background = 'rgba(0, 0, 0, 0.7)';
        });
        
        refreshButton.addEventListener('mouseout', () => {
            refreshButton.style.background = 'rgba(0, 0, 0, 0.5)';
        });
        
        refreshButton.addEventListener('click', refreshVideos);
        phoneContainer.appendChild(refreshButton);
        
        // Prevent scrolling on the main page when scrolling inside the phone container
        phoneContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, { passive: false });
        
        // Direct wheel event handler for phone container with logging
        phoneContainer.addEventListener('wheel', (e) => {
            console.log('Scroll detected in phone container!', e.deltaY);
            
            // Always prevent default to stop page scrolling
            e.preventDefault();
            e.stopPropagation();
            
            // Get scroll direction
            const direction = e.deltaY > 0 ? 'down' : 'up';
            console.log('Scroll direction:', direction);
            
            // Stop any active videos
            const activeVideos = document.querySelectorAll('.active-video');
            if (activeVideos.length > 0) {
                console.log('Stopping active videos');
                stopAllVideos();
            }
            
            // Scroll to next video
            console.log('Scrolling to next video');
            scrollToNextVideo(direction);
            
            return false;
        }, { capture: true, passive: false });
    }
    
    // Add consistent blur overlay styles at the top level
    if (!document.getElementById('blur-overlay-styles')) {
        const styles = document.createElement('style');
        styles.id = 'blur-overlay-styles';
        styles.textContent = `
            .content-blur-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(25px);
                -webkit-backdrop-filter: blur(25px);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 5;
                cursor: pointer;
            }
            
            .content-blur-overlay.hidden {
                display: none;
            }
            
            .eye-icon {
                width: 40px;
                height: 40px;
                margin-bottom: 10px;
            }
            
            .eye-icon svg {
                width: 100%;
                height: 100%;
                fill: white;
            }
            
            .blur-text {
                color: white;
                font-size: 16px;
                text-align: center;
                margin: 5px 0;
            }
            
            .video-card {
                position: relative;
                overflow: hidden;
            }
            
            .video-overlay {
                pointer-events: none !important;
            }
            
            .video-card.blurred img,
            .video-card.blurred iframe {
                opacity: 0.3;
            }
            
            .video-card.blurred::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(25px);
                -webkit-backdrop-filter: blur(25px);
                z-index: 4;
            }
            
            .wheel-event-catcher {
                pointer-events: none !important;
            }
            
            .active-wheel-catcher {
                pointer-events: none !important;
            }
            
            .scroll-capture-layer {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 9999;
                background: transparent;
                pointer-events: auto !important;
            }
        `;
        document.head.appendChild(styles);
    }
    
    document.addEventListener('ws:reconnected', () => {
        debugLog('WebSocket reconnected. Requesting initial/more videos if needed.');
        guardedLoadVideos(true);

    });

    const createSensitiveContentOverlay = () => {
        const phoneContainer = document.querySelector('.phone-container');
        if (!phoneContainer) return;
        
        // Create the blur overlay
        const blurOverlay = document.createElement('div');
        blurOverlay.className = 'content-blur-overlay';
        
        // Create the eye icon
        const eyeIcon = document.createElement('div');
        eyeIcon.className = 'eye-icon';
        eyeIcon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
        `;
        
        // Create the blur text
        const blurText = document.createElement('div');
        blurText.className = 'blur-text';
        blurText.textContent = 'Sensitive Content';
        
        // Add a paragraph explaining what to do
        const blurInstructions = document.createElement('div');
        blurInstructions.className = 'blur-text';
        blurInstructions.textContent = 'Click to view';
        blurInstructions.style.fontSize = '12px';
        blurInstructions.style.marginTop = '5px';
        blurInstructions.style.opacity = '0.8';
        
        // Add elements to the overlay
        blurOverlay.appendChild(eyeIcon);
        blurOverlay.appendChild(blurText);
        blurOverlay.appendChild(blurInstructions);
        
        // Add the overlay to the phone container
        phoneContainer.appendChild(blurOverlay);
        
        // Add click event to remove the blur
        blurOverlay.addEventListener('click', () => {
            blurOverlay.classList.add('hidden');
            
            // Store in localStorage that the user has acknowledged the sensitive content
            localStorage.setItem('phub_content_acknowledged', 'true');
            
            // Update all video cards
            updateAllVideoBlurState(true);
        });
        
        // Initialize blur state based on localStorage
        if (localStorage.getItem('phub_content_acknowledged') === 'true') {
            blurOverlay.classList.add('hidden');
            updateAllVideoBlurState(true);
        }
    };
    
    // Call the function to create the blur overlay
    createSensitiveContentOverlay();
    
    // Set loading spinner to use the GIF
    loadingSpinner.innerHTML = '<img src="/assets/gif/load.gif" style="width: 50px; height: 50px;">';
    loadingSpinner.style.display = 'none';
    loadingSpinner.className = ''; // Remove any existing classes

    // Add feed styling
    feed.style.cssText = `
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        scroll-snap-type: y mandatory;
        -webkit-overflow-scrolling: touch;
    `;

    function checkScrollPosition() {
        const { scrollTop, scrollHeight, clientHeight } = feed;
        const scrollThreshold = SCROLL_THRESHOLD * clientHeight;
        const remainingVideos = feed.querySelectorAll('.video-card').length;
        const currentIndex = getCurrentVideoIndex();
        const totalVideos = feed.querySelectorAll('.video-card').length;

        // Load more videos if:
        // 1. Near the end of scroll
        // 2. Have fewer than minimum videos
        // 3. Current video is among the last few
        if (scrollHeight - scrollTop - clientHeight < scrollThreshold || 
            remainingVideos < MIN_VIDEOS_COUNT ||
            (currentIndex !== -1 && totalVideos - currentIndex <= 3)) {
            
            guardedLoadVideos(remainingVideos === 0);
        }
    }

    // Add this function at the top level, before createVideoCard
    function updateAllVideoBlurState(isAcknowledged) {
        const videoCards = document.querySelectorAll('.video-card');
        videoCards.forEach(card => {
            const blurOverlay = card.querySelector('.content-blur-overlay');
            const title = card.querySelector('.video-title');
            const playButton = card.querySelector('.play-button');
            
            if (isAcknowledged) {
                if (blurOverlay) blurOverlay.style.display = 'none';
                if (title) title.style.display = 'block';
                if (playButton) playButton.style.display = 'flex';
            } else {
                if (blurOverlay) blurOverlay.style.display = 'flex';
                if (title) title.style.display = 'none';
                if (playButton) playButton.style.display = 'none';
            }
        });
    }

    // Add initialization of blur state
    function initializeBlurState() {
        const isAcknowledged = localStorage.getItem('phub_content_acknowledged') === 'true';
        updateAllVideoBlurState(isAcknowledged);
    }

    // Call initializeBlurState when the page loads
    document.addEventListener('DOMContentLoaded', initializeBlurState);

    // Listen for storage changes to update blur state
    window.addEventListener('storage', (e) => {
        if (e.key === 'phub_content_acknowledged') {
            const isAcknowledged = e.newValue === 'true';
            updateAllVideoBlurState(isAcknowledged);
        }
    });

    function createVideoCard(video) {
        if (!video || !video.vkey) {
            debugLog("Invalid video data", video);
            return null;
        }

        const card = document.createElement('div');
        card.className = 'video-card';
        card.dataset.vkey = video.vkey;
        card.dataset.url = video.url;
        card.dataset.thumbnail = video.thumbnail;
        card.dataset.title = video.title;
        card.style.cssText = `
            position: relative;
            width: 100%;
            scroll-snap-align: start;
            scroll-snap-stop: always;
            margin: 0;
            overflow: hidden;
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
            aspect-ratio: 9/16;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const img = document.createElement('img');
        img.className = 'thumbnail';
        img.src = video.thumbnail;
        img.alt = video.title;
        img.loading = 'lazy';
        img.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: cover;
            aspect-ratio: 9/16;
        `;

        const title = document.createElement('div');
        title.className = 'video-title';
        title.textContent = video.title;
        title.style.cssText = `
            position: absolute;
            bottom: 50px;
            left: 0;
            right: 0;
            padding: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            font-size: 16px;
            z-index: 100;
            font-weight: 500;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
            display: none;
        `;

        const playButton = document.createElement('div');
        playButton.className = 'play-button';
        playButton.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 60px;
            height: 60px;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100;
        `;
        playButton.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z"/>
            </svg>
        `;

        // Create refresh button for this card
        const cardRefreshButton = document.createElement('button');
        cardRefreshButton.className = 'ph-refresh-button';
        cardRefreshButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
        `;
        cardRefreshButton.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            z-index: 1000;
            background: rgba(0, 0, 0, 0.5);
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.3s;
        `;
        cardRefreshButton.querySelector('svg').style.fill = 'white';
        cardRefreshButton.addEventListener('click', refreshVideos);

        // Create blur button for this card
        const blurButton = document.createElement('button');
        blurButton.className = 'ph-blur-button';
        blurButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
        `;
        blurButton.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 1000;
            background: rgba(0, 0, 0, 0.5);
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.3s;
        `;
        blurButton.querySelector('svg').style.fill = 'white';
        blurButton.addEventListener('click', () => {
            const isAcknowledged = localStorage.getItem('phub_content_acknowledged') === 'true';
            localStorage.setItem('phub_content_acknowledged', !isAcknowledged);
            updateAllVideoBlurState(!isAcknowledged);
        });

        // Create a separate wheel event catcher that won't block clicks initially
        const wheelCatcher = document.createElement('div');
        wheelCatcher.className = 'wheel-event-catcher'; // No active class initially
        wheelCatcher.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 999;
            background: transparent;
            pointer-events: none !important; // Start with no pointer events
        `;

        // Add the handlers but they won't capture anything until we add the active class
        const wheelHandler = (e) => {
            console.log('Wheel event on catcher detected', e.deltaY);
            // Always prevent default and stop propagation
            e.preventDefault();
            e.stopPropagation();
            
            // Always stop the video
            stopAllVideos();
            
            // Handle scroll direction
            const direction = e.deltaY > 0 ? 'down' : 'up';
            scrollToNextVideo(direction);
            
            return false;
        };

        // Add all possible scroll event types with capture
        wheelCatcher.addEventListener('wheel', wheelHandler, { capture: true, passive: false });
        wheelCatcher.addEventListener('mousewheel', wheelHandler, { capture: true, passive: false });
        wheelCatcher.addEventListener('DOMMouseScroll', (e) => {
            console.log('DOMMouseScroll event detected');
            e.preventDefault();
            e.stopPropagation();
            stopAllVideos();
            const direction = e.detail > 0 ? 'down' : 'up';
            scrollToNextVideo(direction);
            return false;
        }, { capture: true, passive: false });

        // Add touch events for mobile
        let touchStartY = 0;
        wheelCatcher.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        }, { passive: false });

        wheelCatcher.addEventListener('touchmove', (e) => {
            const touchY = e.touches[0].clientY;
            const diff = touchStartY - touchY;
            
            if (Math.abs(diff) > 20) { // Lower threshold for better responsiveness
                console.log('Touch move detected, diff:', diff);
                e.preventDefault();
                stopAllVideos();
                const direction = diff > 0 ? 'down' : 'up';
                scrollToNextVideo(direction);
            }
        }, { passive: false });

        // Add the wheel catcher behind the overlay
        card.appendChild(wheelCatcher);

        // Create blur overlay
        const blurOverlay = document.createElement('div');
        blurOverlay.className = 'content-blur-overlay';
        blurOverlay.innerHTML = `
            <div class="eye-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                </svg>
            </div>
            <div class="blur-text">Sensitive Content</div>
            <div class="blur-text" style="font-size: 12px; margin-top: 5px; opacity: 0.8;">Click to view</div>
        `;
        
        // Add click handler for blur overlay
        blurOverlay.addEventListener('click', () => {
            const isAcknowledged = localStorage.getItem('phub_content_acknowledged') === 'true';
            if (!isAcknowledged) {
                localStorage.setItem('phub_content_acknowledged', 'true');
                updateAllVideoBlurState(true);
            }
        });

        card.appendChild(img);
        card.appendChild(title);
        card.appendChild(playButton);
        card.appendChild(cardRefreshButton);
        card.appendChild(blurButton);
        card.appendChild(blurOverlay);

        // Initialize blur state for this card
        const isAcknowledged = localStorage.getItem('phub_content_acknowledged') === 'true';
        if (isAcknowledged) {
            blurOverlay.style.display = 'none';
            title.style.display = 'block';
            playButton.style.display = 'flex';
        }

        // Add wheel event listener with the most aggressive settings
        card.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const direction = e.deltaY > 0 ? 'down' : 'up';
            
            // Stop any active video
            const activeVideo = card.querySelector('iframe');
            if (activeVideo) {
                stopAllVideos();
            }
            
            scrollToNextVideo(direction);
            return false;
        }, { capture: true, passive: false });

        // Update the playButton click handler to only make the current card's refresh button green
        playButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Stop any currently playing videos
            stopAllVideos(card);
            
            // Mark this card as active
            card.classList.add('active-video');
            
            // Get video data
            const videoUrl = card.dataset.url;
            
            // Create iframe for video
            const iframe = document.createElement('iframe');
            iframe.src = `${videoUrl}?autoplay=1&mute=1`;
            iframe.allowFullscreen = true;
            iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
            iframe.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                border: none;
                z-index: 5;
            `;
            
            // Replace thumbnail with iframe
            const thumbnail = card.querySelector('.thumbnail');
            if (thumbnail) {
                card.replaceChild(iframe, thumbnail);
            } else {
                card.appendChild(iframe);
            }
            
            // Hide title when video starts playing
            const title = card.querySelector('.video-title');
            if (title) title.style.display = 'none';
            
            // Remove play button
            playButton.remove();
            
            // Make ONLY THIS CARD'S refresh button green
            const cardRefreshButton = card.querySelector('.ph-refresh-button');
            if (cardRefreshButton) {
                makeRefreshButtonGreen(cardRefreshButton);
            }
        });

        // Fade in animation
        setTimeout(() => {
            card.style.opacity = '1';
        }, 50);

        return card;
    }

    function stopAllVideos(exceptCard = null) {
        const activeVideos = document.querySelectorAll('.active-video');
        
        activeVideos.forEach(card => {
            // Skip the card that's about to play a new video (if any)
            if (exceptCard === card) return;
            
            // Remove active class
            card.classList.remove('active-video');
            
            // Reset refresh button
            const refreshButton = card.querySelector('.ph-refresh-button');
            if (refreshButton) {
                refreshButton.classList.remove('next-video-button');
                // Only restore the refresh functionality if the button is not green
                if (!refreshButton.classList.contains('next-video-button')) {
                    refreshButton.onclick = refreshVideos;
                }
            }
            
            // Get current iframe
            const iframe = card.querySelector('iframe');
            
            // Create a new thumbnail
            const newThumb = document.createElement('img');
            newThumb.className = 'thumbnail';
            newThumb.src = card.dataset.thumbnail;
            newThumb.alt = card.dataset.title || '';
            newThumb.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: cover;
            `;
            
            // Replace iframe with thumbnail
            if (iframe) {
                card.replaceChild(newThumb, iframe);
            }
            
            // Create and add a new play button
            const newPlayBtn = document.createElement('div');
            newPlayBtn.className = 'play-button';
            newPlayBtn.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 60px;
                height: 60px;
                background: rgba(0, 0, 0, 0.7);
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 100;
            `;
            newPlayBtn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <path d="M8 5v14l11-7z"/>
                </svg>
            `;
            
            // Add click handler to new play button
            newPlayBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // Create iframe directly without going through playVideo
                const videoUrl = card.dataset.url;
                const iframe = document.createElement('iframe');
                iframe.src = `${videoUrl}?autoplay=1&mute=1`;
                iframe.allowFullscreen = true;
                iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
                iframe.style.cssText = `
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    border: none;
                    z-index: 5;
                `;
                
                // Replace thumbnail with iframe
                const thumbnail = card.querySelector('.thumbnail');
                if (thumbnail) {
                    card.replaceChild(iframe, thumbnail);
                }
                
                // Remove play button and hide title
                newPlayBtn.remove();
                const title = card.querySelector('.video-title');
                if (title) title.style.display = 'none';
                
                // Mark as active
                card.classList.add('active-video');
                
                // Make this card's refresh button green
                const cardRefreshButton = card.querySelector('.ph-refresh-button');
                if (cardRefreshButton) {
                    makeRefreshButtonGreen(cardRefreshButton);
                }
            });
            
            card.appendChild(newPlayBtn);
            
            // Show title again
            const title = card.querySelector('.video-title');
            if (title) title.style.display = 'block';
        });
    }

    function getCurrentVideoIndex() {
        const cards = Array.from(feed.querySelectorAll('.video-card'));
        let centerY = window.innerHeight / 2;
        
        // Find the card closest to the center of the viewport
        let closestCard = null;
        let closestDistance = Infinity;
        
        cards.forEach((card, index) => {
            const rect = card.getBoundingClientRect();
            const cardCenter = rect.top + (rect.height / 2);
            const distance = Math.abs(cardCenter - centerY);
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestCard = {card, index};
            }
        });
        
        return closestCard ? closestCard.index : -1;
    }

    function scrollToNextVideo(direction) {
        const cards = Array.from(feed.querySelectorAll('.video-card:not(.loading-card)'));
        if (!cards.length) return;
        
        const currentIndex = getCurrentVideoIndex();
        if (currentIndex === -1) return;
        
        let targetIndex;
        if (direction === 'down') {
            targetIndex = Math.min(currentIndex + 1, cards.length - 1);
            
            // Only add loading card if we're at the last video and there are no more videos
            if (currentIndex === cards.length - 1 && !isFetching) {
                const loadingCard = createLoadingCard();
                feed.appendChild(loadingCard);
                loadingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Force a new video request when showing loading card
                start = 0; // Reset start position to get fresh videos
                guardedLoadVideos(true);
                return;
            }
        } else {
            targetIndex = Math.max(currentIndex - 1, 0);
        }
        
        const targetCard = cards[targetIndex];
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Stop video playback when scrolling
        stopAllVideos();
    }

    function handleScroll(e) {
        // Always prevent default and stop propagation to prevent page scrolling
        e.preventDefault();
        e.stopPropagation();
        
        const now = Date.now();
        if (now - lastScrollTime < SCROLL_THROTTLE) return;
        lastScrollTime = now;
        
        const direction = e.deltaY > 0 ? 'down' : 'up';
        
        // Find the current active video and stop it
        const activeVideo = feed.querySelector('.active-video');
        if (activeVideo) {
            stopAllVideos();
        }
        
        // Scroll to next video with immediate response
        scrollToNextVideo(direction);
        
        return false;
    }

    // Simplified scroll setup
    function setupScrollHandlers() {
        feed.querySelectorAll('.video-card').forEach(card => {
            card.removeEventListener('wheel', handleScroll);
            card.addEventListener('wheel', handleScroll, { passive: false });
            
            const overlay = card.querySelector('.video-overlay');
            if (overlay) {
                overlay.removeEventListener('wheel', handleScroll);
                overlay.addEventListener('wheel', handleScroll, { passive: false });
            }
            
            const iframe = card.querySelector('iframe');
            if (iframe) {
                iframe.removeEventListener('wheel', handleScroll);
                iframe.addEventListener('wheel', handleScroll, { passive: false });
            }
        });
    }

    feed.addEventListener('wheel', handleScroll, { passive: false });
    
    let touchStartY = 0;
    let touchStartTime = 0;
    
    feed.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
    }, { passive: true });
    
    feed.addEventListener('touchmove', (e) => {
        const touchY = e.touches[0].clientY;
        const diff = touchStartY - touchY;
        const timeDiff = Date.now() - touchStartTime;
        
        if (Math.abs(diff) > 50 && timeDiff < 300) {
            e.preventDefault();
            const direction = diff > 0 ? 'down' : 'up';
            scrollToNextVideo(direction);
            touchStartY = touchY;
        }
    }, { passive: false });

    // Improve the loadVideos function to prevent excessive requests
    function loadVideos(showSpinner = false) {
        const now = Date.now();
        const timeSinceLastLoad = now - lastLoadTime;
        const remainingVideos = feed.querySelectorAll('.video-card:not(.loading-card)').length;
        
        // Always allow loading if we have a loading card
        const hasLoadingCard = feed.querySelector('.loading-card') !== null;
        if (!hasLoadingCard && timeSinceLastLoad < REQUEST_RETRY_DELAY && remainingVideos >= MIN_VIDEOS_COUNT) {
            return;
        }

        if (isFetching) {
            return;
        }
        
        lastLoadTime = now;
        isFetching = true;
        requestAttempts = 0;
        
        requestCount++;
        lastRequestTime = now;
        requestHistory.push(now);
        if (requestHistory.length > 20) {
            requestHistory.shift();
        }
        
        debugLog(`Requesting videos. Start: ${start}, Count: ${requestCount}`, {
            remainingVideos,
            requestAttempts,
            hasLoadingCard
        });
        
        requestVideos();
    }

    function requestVideos() {
        if (requestAttempts >= MAX_REQUEST_ATTEMPTS) {
            debugLog(`Max request attempts reached (${MAX_REQUEST_ATTEMPTS}), resetting start position`);
            start = 0;
            requestAttempts = 0;
        }
        
        requestAttempts++;
        debugLog(`Emitting ph_request_videos. Start: ${start}, Attempt: ${requestAttempts}`);
        socket.emit('ph_request_videos', { start });
    }

    function refreshVideos() {
        start = 0;
        feed.innerHTML = '';
        seenVideos.clear();
        requestAttempts = 0;
        // Always show spinner when refreshing
        guardedLoadVideos(true);
    }

    function clearRequestState() {
        debugLog("Clearing request state");
        isFetching = false;
        loadingSpinner.style.display = 'none';
        
        // Remove loading message if it exists
        const message = document.querySelector('.loading-message');
        if (message) {
            message.remove();
        }
    }

    function createLoadingCard() {
        const card = document.createElement('div');
        card.className = 'video-card loading-card';
        card.style.cssText = `
            position: relative;
            width: 100%;
            height: 81.9vh;
            scroll-snap-align: start;
            scroll-snap-stop: always;
            margin: 0;
            overflow: hidden;
            opacity: 1;
            transition: opacity 0.3s ease-in-out;
            aspect-ratio: 9/16;
            display: flex;
            align-items: center;
            justify-content: center;
            background: black;
        `;

        const loadingSpinner = document.createElement('img');
        loadingSpinner.src = '/assets/gif/load.gif';
        loadingSpinner.style.cssText = `
            width: 50px;
            height: 50px;
            z-index: 1000;
        `;

        card.appendChild(loadingSpinner);
        return card;
    }

    socket.on('ph_videos_response', (data) => {
        responseCount++;
        lastResponseTime = Date.now();
        const responseTime = lastResponseTime - lastRequestTime;
        
        debugLog(`Received ph_videos_response (${responseCount}). Response time: ${responseTime}ms`, {
            dataReceived: !!data,
            videoCount: data?.videos?.length || 0,
            start: data?.start,
            uniqueSeen: data?.unique_count || 0,
            requestAttempts
        });
        
        // Remove loading card immediately when we receive any response
        const loadingCard = feed.querySelector('.loading-card');
        if (loadingCard) {
            loadingCard.remove();
        }
        
        if (!data || !data.videos) {
            debugLog("Invalid response data", data);
            setTimeout(() => {
                clearRequestState();
                if (feed.querySelectorAll('.video-card:not(.loading-card)').length === 0) {
                    guardedLoadVideos(true);
                }
            }, REQUEST_RETRY_DELAY);
            return;
        }
        
        if (data.videos.length === 0) {
            if (requestAttempts < MAX_REQUEST_ATTEMPTS) {
                debugLog(`No videos received, retrying (attempt ${requestAttempts})`);
                setTimeout(requestVideos, REQUEST_RETRY_DELAY);
                return;
            }
            
            debugLog('No videos after multiple attempts, resetting start position');
            start = 0;
            requestAttempts = 0;
            setTimeout(requestVideos, REQUEST_RETRY_DELAY);
            return;
        }

        requestAttempts = 0;
        let videosAdded = 0;
        
        data.videos.forEach(video => {
            if (!video || !video.vkey) {
                debugLog("Invalid video object in response", video);
                return;
            }
            
            if (!seenVideos.has(video.vkey)) {
                seenVideos.add(video.vkey);
                const card = createVideoCard(video);
                if (card) {
                    feed.appendChild(card);
                    videosAdded++;
                }
            }
        });

        debugLog(`Added ${videosAdded} new videos out of ${data.videos.length} received`);
        
        // Update start position and clear request state
        start = data.start;
        clearRequestState();
        
        // Setup scroll handlers for new videos
        setupScrollHandlers();
        
        // If we had a loading card, scroll to the first new video
        if (loadingCard && videosAdded > 0) {
            const newVideos = Array.from(feed.querySelectorAll('.video-card:not(.loading-card)')).slice(-videosAdded);
            if (newVideos.length > 0) {
                newVideos[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
        
        // Check if we need more videos
        const remainingVideos = feed.querySelectorAll('.video-card:not(.loading-card)').length;
        if (remainingVideos < MIN_VIDEOS_COUNT && videosAdded < MIN_VIDEOS_COUNT) {
            debugLog(`Still need more videos (have ${remainingVideos}, need ${MIN_VIDEOS_COUNT})`);
            setTimeout(() => guardedLoadVideos(remainingVideos === 0), REQUEST_RETRY_DELAY);
        }
    });

    socket.on('ph_videos_error', (data) => {
        responseCount++;
        lastResponseTime = Date.now();
        const responseTime = lastResponseTime - lastRequestTime;
        
        debugLog(`Received ph_videos_error (${responseCount}). Response time: ${responseTime}ms`, {
            error: data?.error || 'Unknown error',
            requestAttempts
        });
        
        // If we've tried too many times, reset start position
        if (requestAttempts >= MAX_REQUEST_ATTEMPTS) {
            start = 0;
            requestAttempts = 0;
        }
        
        clearRequestState();
        
        const remainingVideos = feed.querySelectorAll('.video-card').length;
        // Only retry if we don't have enough videos or have none
        if (remainingVideos < MIN_VIDEOS_COUNT) {
            debugLog(`Will retry after error (have ${remainingVideos} videos)`);
            setTimeout(() => guardedLoadVideos(remainingVideos === 0), REQUEST_RETRY_DELAY * 2);
        }
    });
    
    socket.on('connect', () => {
        debugLog("Socket connected");
    });
    
    socket.on('disconnect', () => {
        debugLog("Socket disconnected");
        clearRequestState();
    });

    socket.on('ph_connection_established', () => {
        debugLog('Connection established, loading videos');
        guardedLoadVideos(true);
    });
    
    socket.on('error', (error) => {
        debugLog('Socket error', error);
        clearRequestState();
    });
    
    socket.on('connect_error', (error) => {
        debugLog('Connection error', error);
        clearRequestState();
    });

    // Initial load
    debugLog("Starting initial video load");
    guardedLoadVideos(true);

    // Add this immediate event capture function at the end of the DOMContentLoaded event
    // This ensures we're constantly monitoring for active videos and attaching events
    function captureIframeScrollEvents() {
        // Target active videos directly and make sure their parent elements capture events
        const activeVideos = document.querySelectorAll('.active-video');
        activeVideos.forEach(videoCard => {
            // Make sure the video card captures wheel events
            videoCard.style.pointerEvents = 'auto';
            
            // Clear previous wheel event if any
            if (videoCard._wheelHandler) {
                videoCard.removeEventListener('wheel', videoCard._wheelHandler);
            }
            
            // Add a wheel event handler that's extremely aggressive
            videoCard._wheelHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const now = Date.now();
                if (now - lastScrollTime < SCROLL_THROTTLE / 30) return; // Almost no throttle
                lastScrollTime = now;
                
                const direction = e.deltaY > 0 ? 'down' : 'up';
                stopAllVideos();
                scrollToNextVideo(direction);
                return false;
            };
            
            videoCard.addEventListener('wheel', videoCard._wheelHandler, { capture: true, passive: false });
            
            const iframe = videoCard.querySelector('iframe');
            if (iframe) {
                iframe.style.cssText += `
                    pointer-events: auto !important;
                    z-index: 5 !important;
                `;
                
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    if (iframeDoc) {
                        iframeDoc.body.style.pointerEvents = 'none';
                        iframeDoc.addEventListener('wheel', videoCard._wheelHandler, { capture: true, passive: false });
                    }
                } catch (e) {}
                
                const overlay = videoCard.querySelector('.video-overlay');
                if (overlay) {
                    overlay.style.cssText = `
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                        z-index: 9999 !important;
                        background: transparent !important;
                        pointer-events: auto !important;
                        cursor: pointer !important;
                    `;
                    
                    overlay.addEventListener('wheel', videoCard._wheelHandler, { capture: true, passive: false });
                    overlay.addEventListener('click', (e) => {
                        e.stopPropagation();
                    });
                    
                    overlay.addEventListener('mousewheel', videoCard._wheelHandler, { capture: true, passive: false });
                    overlay.addEventListener('DOMMouseScroll', videoCard._wheelHandler, { capture: true, passive: false });
                }
            }
        });
    }

    setInterval(captureIframeScrollEvents, 500);
    document.body.addEventListener('wheel', (e) => {
        const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
        if (!elementUnderMouse) return;
        
        let videoCard = elementUnderMouse.closest('.video-card');
        
        if (!videoCard) {
            const phoneContainer = elementUnderMouse.closest('.phone-container');
            if (phoneContainer) {
                const cards = Array.from(document.querySelectorAll('.video-card'));
                for (const card of cards) {
                    const rect = card.getBoundingClientRect();
                    if (e.clientX >= rect.left && e.clientX <= rect.right && 
                        e.clientY >= rect.top && e.clientY <= rect.bottom) {
                        videoCard = card;
                        break;
                    }
                }
            }
        }
        
        if (videoCard) {
            e.preventDefault();
            e.stopPropagation();
            
            const direction = e.deltaY > 0 ? 'down' : 'up';
            stopAllVideos();
            scrollToNextVideo(direction);
            return false;
        }
    }, { capture: true, passive: false });

    function addIframeMessageHandler() {
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'wheel') {
                const direction = event.data.deltaY > 0 ? 'down' : 'up';
                stopAllVideos();
                scrollToNextVideo(direction);
            }
        });
        
        document.querySelectorAll('iframe').forEach(iframe => {
            try {
                iframe.contentWindow.addEventListener('wheel', (e) => {
                    window.parent.postMessage({
                        type: 'wheel',
                        deltaY: e.deltaY
                    }, '*');
                    e.preventDefault();
                    e.stopPropagation();
                }, { capture: true, passive: false });
            } catch (e) {}
        });
    }

    addIframeMessageHandler();
    setInterval(addIframeMessageHandler, 500);

    document.addEventListener('keydown', (e) => {
        const phoneContainer = document.querySelector('.phone-container');
        if (!phoneContainer) return;
        
        const activeElement = document.activeElement;
        const isPhoneContainerActive = phoneContainer.contains(activeElement) || document.body === activeElement;
        
        if (isPhoneContainerActive) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const direction = e.key === 'ArrowDown' ? 'down' : 'up';
                stopAllVideos();
                scrollToNextVideo(direction);
                return false;
            }
        }
    });

    function addDirectWheelHandler(card) {
        card.addEventListener('wheel', (e) => {
            console.log('Scroll detected on video card!', e.deltaY);
            e.preventDefault();
            e.stopPropagation();
            
            const direction = e.deltaY > 0 ? 'down' : 'up';
            console.log('Scroll direction:', direction);
            
            stopAllVideos();
            scrollToNextVideo(direction);
            
            return false;
        }, { capture: true, passive: false });
    }

    // Modify the createVideoCard function to add our wheel handler
    const originalCreateVideoCard = window.createVideoCard || createVideoCard;
    window.createVideoCard = function(video) {
        const card = originalCreateVideoCard(video);
        if (card) {
            addDirectWheelHandler(card);
            console.log('Added direct wheel handler to video card', video.vkey);
        }
        return card;
    };

    // Add wheel handlers to existing cards
    function addWheelHandlersToExistingCards() {
        const existingCards = document.querySelectorAll('.video-card');
        existingCards.forEach(card => {
            addDirectWheelHandler(card);
        });
    }

    // Call immediately and periodically to ensure all cards have handlers
    addWheelHandlersToExistingCards();
    setInterval(addWheelHandlersToExistingCards, 2000);

    // Replace the addSpecialActiveVideoHandler function to completely remove the top-layer overlay
    function addSpecialActiveVideoHandler() {
        const activeVideos = document.querySelectorAll('.active-video');
        activeVideos.forEach(activeVideo => {
            // Check if we already added the special handler
            if (activeVideo.dataset.specialHandlerAdded === 'true') return;
            
            console.log('Adding special wheel handler to active video');
            
            // Mark that we've added the special handler
            activeVideo.dataset.specialHandlerAdded = 'true';
            
            // Remove any existing overlay that might block clicks
            const existingOverlay = activeVideo.querySelector('.video-overlay.top-layer');
            if (existingOverlay) {
                existingOverlay.remove();
            }
            
            // Also remove any other overlay that might interfere
            const otherOverlays = activeVideo.querySelectorAll('.video-overlay, .scroll-capture-layer');
            otherOverlays.forEach(overlay => overlay.remove());
            
            // Add wheel handlers directly to the document that only trigger when over this video
            const docWheelHandler = (e) => {
                // Get the element under the pointer
                const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
                
                // Check if we're over this active video
                if (elementUnderMouse && (
                    elementUnderMouse === activeVideo || 
                    activeVideo.contains(elementUnderMouse)
                )) {
                    // Only handle wheel events in the non-control area (top 85%)
                    const rect = activeVideo.getBoundingClientRect();
                    const controlAreaY = rect.top + (rect.height * 0.85);
                    
                    if (e.clientY < controlAreaY) {
                        console.log('Document wheel over active video content area');
                        e.preventDefault();
                        e.stopPropagation();
                        
                        stopAllVideos();
                        const direction = e.deltaY > 0 ? 'down' : 'up';
                        scrollToNextVideo(direction);
                        
                        return false;
                    }
                }
            };
            
            // Add docWheelHandler to document
            document.addEventListener('wheel', docWheelHandler, { capture: true, passive: false });
            activeVideo._docWheelHandler = docWheelHandler;
            
            // Make sure iframe is properly set to allow pointer events
            const iframe = activeVideo.querySelector('iframe');
            if (iframe) {
                iframe.style.cssText = `
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    border: none;
                    z-index: 5;
                    aspect-ratio: 9/16;
                    pointer-events: auto !important;
                `;
            }
        });
    }

    // Run the special handler more frequently to ensure active videos always have wheel handlers
    setInterval(addSpecialActiveVideoHandler, 200);

    // Ensure the animation style is defined correctly with !important flags
    const animationStyle = document.createElement('style');
    animationStyle.textContent = `
        @keyframes pulse-green {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.7); }
            70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(46, 204, 113, 0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(46, 204, 113, 0); }
        }
        
        .next-video-button {
            background: rgba(46, 204, 113, 0.8) !important;
            animation: pulse-green 1.5s infinite !important;
            box-shadow: 0 0 0 0 rgba(46, 204, 113, 1) !important;
            transform: scale(1.1) !important;
            transition: all 0.3s ease !important;
            border: 2px solid white !important;
        }
    `;
    document.head.appendChild(animationStyle);

    // Update the green refresh button click handler to be simpler
    function makeRefreshButtonGreen(refreshButton) {
        if (!refreshButton) return;
        
        // Apply green styling
        refreshButton.classList.add('next-video-button');
        
        // Completely override the click behavior to ONLY stop the current video
        refreshButton.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Green refresh button clicked - stopping current video');
            
            // Find the active video card
            const activeCard = document.querySelector('.active-video');
            if (activeCard) {
                // Stop the video and restore the thumbnail
                stopAllVideos();
            }
        };
    }
}); 