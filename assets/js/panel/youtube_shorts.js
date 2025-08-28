const container = document.getElementById('videoScrollerSection');
const autoScrollToggle = document.getElementById('autoScrollToggle');
    
function showError(message, isRecoverable = true) {
  let errorDisplay = document.querySelector('.yt-error-display');
  
  if (!errorDisplay) {
    errorDisplay = document.createElement('div');
    errorDisplay.className = 'yt-error-display';
    errorDisplay.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      max-width: 80%;
      z-index: 1000;
    `;
    
    if (container) {
      container.appendChild(errorDisplay);
    } else {
      document.body.appendChild(errorDisplay);
    }
  }
  
  errorDisplay.innerHTML = `
    <div style="margin-bottom: 15px; font-size: 18px;">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: -5px; color: #f44336;">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span style="margin-left: 8px;">${message}</span>
    </div>
    ${isRecoverable ? `
      <button id="ytErrorRetryBtn" style="
        background-color: #2563eb;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      ">Try Again</button>
    ` : ''}
  `;
  
  if (isRecoverable) {
    const retryBtn = document.getElementById('ytErrorRetryBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        hideError();
        refreshAllVideos();
      });
    }
  }
  
  return errorDisplay;
}

function hideError() {
  const errorDisplay = document.querySelector('.yt-error-display');
  if (errorDisplay) {
    errorDisplay.remove();
  }
}

function createLoadingIndicator() {
  const existingLoader = document.querySelector('.yt-loading-indicator');
  if (existingLoader) existingLoader.remove();
  
  const loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'yt-loading-indicator';
  loadingIndicator.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 100; display: block;';
  
  const loadingImg = document.createElement('img');
  loadingImg.src = '/assets/gif/load.gif';
  loadingImg.alt = 'Loading...';
  loadingImg.style.cssText = 'width: 50px; height: 50px;';
  
  loadingIndicator.appendChild(loadingImg);
  
  if (container) {
    container.appendChild(loadingIndicator);
  }
  
  return loadingIndicator;
}

// Create auto-scroll toggle button
function createAutoScrollButton() {
  console.log('createAutoScrollButton() called');
  
  // Remove old button if it exists
  const oldAutoScrollButton = document.getElementById('ytAutoScrollButton');
  if (oldAutoScrollButton) {
    oldAutoScrollButton.remove();
  }
  
  // Create new button
  const autoScrollButton = document.createElement('button');
  
  autoScrollButton.id = 'ytAutoScrollButton';
  autoScrollButton.className = 'yt-auto-scroll-button';
  autoScrollButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bot-icon lucide-bot"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
    <span style="margin-left: 8px; font-weight: bold;">${autoScrollEnabled ? 'AUTO' : 'OFF'}</span>
  `;
  autoScrollButton.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 1000;
    background: ${autoScrollEnabled ? 'rgba(5, 173, 5, 0.7)' : 'rgba(0, 0, 0, 0.5)'};
    border: none;
    border-radius: 20px;
    padding: 0 12px;
    height: 40px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.3s;
    color: white;
    font-family: Arial, sans-serif;
    font-size: 12px;
  `;
  
  autoScrollButton.querySelector('svg').style.fill = 'white';
  
  autoScrollButton.addEventListener('mouseover', () => {
    autoScrollButton.style.background = autoScrollEnabled 
      ? 'rgba(0, 220, 0, 0.8)' 
      : 'rgba(0, 0, 0, 0.7)';
  });
  
  autoScrollButton.addEventListener('mouseout', () => {
    autoScrollButton.style.background = autoScrollEnabled 
      ? 'rgba(0, 200, 0, 0.7)' 
      : 'rgba(0, 0, 0, 0.5)';
  });
  
  // Toggle auto-scroll
  autoScrollButton.addEventListener('click', () => {
    autoScrollEnabled = !autoScrollEnabled;
    
    // Make global window property for other scripts
    window.autoScrollEnabled = autoScrollEnabled;
    
    // Force-check current video state to ensure accurate ended status
    const shorts = document.querySelectorAll('.short');
    if (shorts.length > 0 && currentIndex < shorts.length) {
      const currentShort = shorts[currentIndex];
      const iframe = currentShort.querySelector('iframe');
      if (iframe) {
        const player = playerMap.get(iframe);
        if (player && typeof player.getPlayerState === 'function') {
          try {
            const state = player.getPlayerState();
            if (state === YT.PlayerState.ENDED) {
              currentVideoEnded = true;
              window.currentVideoEnded = true;
              console.log(`Force-detected ENDED state (${state}) for current video`);
            }
          } catch (e) {
            console.error("Error checking player state:", e);
          }
        }
      }
    }
    
    console.log(`Auto-scroll: ${autoScrollEnabled ? 'ON' : 'OFF'}, Current video ended: ${currentVideoEnded}`);
    
    // Update button color and text to reflect state
    autoScrollButton.style.background = autoScrollEnabled 
      ? 'rgba(0, 200, 0, 0.7)' 
      : 'rgba(0, 0, 0, 0.5)';
    
    autoScrollButton.querySelector('span').textContent = autoScrollEnabled ? 'AUTO' : 'OFF';
    
    // If auto-scroll was just enabled and current video has ended, scroll to next immediately
    if (autoScrollEnabled && currentVideoEnded) {
      forceScrollToNextVideo();
    }
  });
  
  // Try multiple methods to append the button
  const phoneContainer = document.querySelector('.yt-phone-container');
  
  if (phoneContainer) {
    try {
      phoneContainer.appendChild(autoScrollButton);
    } catch (e) {
      console.error('ERROR appending to phoneContainer:', e);
    }
  } else {
    const videoFeed = document.querySelector('.yt-video-feed');
    
    if (videoFeed) {
      try {
        videoFeed.appendChild(autoScrollButton);
      } catch (e) {
        console.error('ERROR appending to videoFeed:', e);
      }
    } else if (container) {
      try {
        container.appendChild(autoScrollButton);
      } catch (e) {
        console.error('ERROR appending to container:', e);
      }
    } else {
      try {
        document.body.appendChild(autoScrollButton);
        autoScrollButton.style.position = 'fixed';
      } catch (e) {
        console.error('ERROR appending to body:', e);
      }
    }
  }
  
  return autoScrollButton;
}

// Create refresh button
function createRefreshButton() {
  console.log('createRefreshButton() called');
  console.log('container exists:', !!container);
  console.log('container value:', container);
  
  // Remove old button if it exists
  const oldRefreshButton = document.getElementById('ytRefreshButton');
  console.log('oldRefreshButton exists:', !!oldRefreshButton);
  if (oldRefreshButton) {
    console.log('Removing old refresh button');
    oldRefreshButton.remove();
  }
  
  // Create new refresh button
  console.log('Creating new refresh button');
  const refreshButton = document.createElement('button');
  console.log('refreshButton created:', !!refreshButton);
  
  refreshButton.id = 'ytRefreshButton';
  refreshButton.className = 'yt-refresh-button';
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
  
  console.log('Setting up refresh button styles and events');
  refreshButton.querySelector('svg').style.fill = 'white';
  
  refreshButton.addEventListener('mouseover', () => {
    refreshButton.style.background = 'rgba(0, 0, 0, 0.7)';
  });
  
  refreshButton.addEventListener('mouseout', () => {
    refreshButton.style.background = 'rgba(0, 0, 0, 0.5)';
  });
  
  // Set up our own event listener that won't conflict with phub shorts
  refreshButton.addEventListener('click', () => {
    console.log("YouTube Refresh button clicked");
    refreshAllVideos();
  });
  
  // Try multiple methods to append the button
  console.log('Attempting to append refresh button');
  
  // Try appending to parent containers first (most stable option)
  const phoneContainer = document.querySelector('.yt-phone-container');
  console.log('phoneContainer exists:', !!phoneContainer);
  
  if (phoneContainer) {
    try {
      phoneContainer.appendChild(refreshButton);
      console.log('SUCCESS: YouTube refresh button appended to .yt-phone-container');
    } catch (e) {
      console.error('ERROR appending to phoneContainer:', e);
    }
  } else {
    // Fallback to video feed container
    const videoFeed = document.querySelector('.yt-video-feed');
    console.log('videoFeed exists:', !!videoFeed);
    
    if (videoFeed) {
      try {
        videoFeed.appendChild(refreshButton);
        console.log('SUCCESS: YouTube refresh button appended to .yt-video-feed');
      } catch (e) {
        console.error('ERROR appending to videoFeed:', e);
      }
    } else if (container) {
      // Last resort - try the video scroller section
      try {
        container.appendChild(refreshButton);
        console.log('SUCCESS: YouTube refresh button appended to #videoScrollerSection');
      } catch (e) {
        console.error('ERROR appending to container:', e);
      }
    } else {
      console.error('Error: No suitable container found for refresh button');
      
      // Last resort - append to body
      try {
        document.body.appendChild(refreshButton);
        console.log('SUCCESS: Button appended to document.body as last resort');
        refreshButton.style.position = 'fixed'; // Make sure it's visible
      } catch (e) {
        console.error('ERROR appending to body:', e);
      }
    }
  }
  
  console.log('createRefreshButton() completed, returning button:', refreshButton);
  return refreshButton;
}

// Show/hide loading functions
function showLoading() {
  const loader = document.querySelector('.yt-loading-indicator') || createLoadingIndicator();
  loader.style.display = 'block';
}

function hideLoading() {
  const loader = document.querySelector('.yt-loading-indicator');
  if (loader) loader.style.display = 'none';
}

let currentIndex = 0;
let autoScrollEnabled = false;  // Default to disabled
let isScrolling = false;  // Prevent multiple scrolls
let currentVideoEnded = false;  // Track if current video has ended
let autoScrollCheckInterval = null;
const playerMap = new Map();
const MIN_VIDEOS_REQUIRED = 5; // Minimum number of videos we want available

// Initialize from window global if it exists (for cross-script compatibility)
if (typeof window.autoScrollEnabled !== 'undefined') {
  autoScrollEnabled = window.autoScrollEnabled;
  console.log(`Initialized autoScrollEnabled from window global: ${autoScrollEnabled}`);
} else {
  // Set the window global to our initial state
  window.autoScrollEnabled = autoScrollEnabled;
  console.log(`Set window.autoScrollEnabled to initial value: ${autoScrollEnabled}`);
}

// Listen for player state changes from other scripts
document.addEventListener('youtube-player-state-changed', function(e) {
  if (e.detail && e.detail.state === 0) { // 0 = ENDED
    console.log("Received external player ENDED state event");
    currentVideoEnded = true;
    window.currentVideoEnded = true;
    
    // Auto-scroll if enabled
    if (autoScrollEnabled) {
      console.log("Auto-scrolling due to external player ended event");
      forceScrollToNextVideo();
    }
  }
});

function initPlayer(iframe) {
  if (!iframe.dataset.src) return;
  iframe.src = iframe.dataset.src;
  console.log(`Setting iframe src: ${iframe.src}`);
  try {
    const player = new YT.Player(iframe, {
      events: {
        'onReady': onPlayerReady,
        'onStateChange': onPlayerStateChange,
        'onError': onPlayerError
      }
    });
    playerMap.set(iframe, player);
    console.log("Player initialized successfully.");
  } catch (error) {
    console.error("Error initializing YouTube player:", error);
  }
}

function onPlayerReady(event) {
  console.log('Player ready');
  // Don't autoplay here, let it autoplay on scroll
  
  // Hide loading when first player is ready
  if (currentIndex === 0) {
    hideLoading();
  }
  
  // Set up a one-time check near the end of the video
  setupEndTimeCheck(event.target);
}

function onPlayerStateChange(event) {
  // Get the actual player state
  const state = event.data;
  
  // Only log essential state changes
  console.log(`Video state: ${getStateName(state)} (${state})`);
  
  if (state === YT.PlayerState.ENDED) {
    currentVideoEnded = true;
    window.currentVideoEnded = true;
    
    console.log(`Video ended - Auto-scroll enabled: ${autoScrollEnabled}, Current video ended: ${currentVideoEnded}`);
    
    // Dispatch event for other scripts to know a video ended
    document.dispatchEvent(new CustomEvent('youtube-player-state-changed', {
      detail: { state: state, playerSource: 'youtube_shorts.js' }
    }));
    
    // Direct approach: if auto-scroll is enabled and video ended, scroll immediately
    if (autoScrollEnabled) {
      forceScrollToNextVideo();
    }
  } else if (state === YT.PlayerState.PLAYING) {
    // Reset the ended flag when video starts playing
    currentVideoEnded = false;
    window.currentVideoEnded = false;
    
    // Set up a one-time check near the end of the video
    setupEndTimeCheck(event.target);
    
    // Dispatch event for other scripts
    document.dispatchEvent(new CustomEvent('youtube-player-state-changed', {
      detail: { state: state, playerSource: 'youtube_shorts.js' }
    }));
  }
}

// Add this new function to check the video at specific points
function setupEndTimeCheck(player) {
  if (!player || typeof player.getDuration !== 'function') return;
  
  try {
    const duration = player.getDuration();
    if (isNaN(duration) || duration <= 0) {
      // If duration isn't available yet, try again in a second
      setTimeout(() => setupEndTimeCheck(player), 1000);
      return;
    }
    
    // Clear any existing timeout for this player
    if (player._endCheckTimeout) {
      clearTimeout(player._endCheckTimeout);
    }
    
    // Calculate time remaining (with a 1 second buffer)
    const currentTime = player.getCurrentTime();
    const timeRemaining = Math.max(0, duration - currentTime - 1);
    
    // Only set up check if there's time remaining and the player is playing
    if (timeRemaining > 0 && player.getPlayerState() === YT.PlayerState.PLAYING) {
      console.log(`Setting up end check in ${timeRemaining.toFixed(1)} seconds`);
      
      // Set a timeout to check the state just before the video should end
      player._endCheckTimeout = setTimeout(() => {
        // Check if the video has ended but the event was missed
        const state = player.getPlayerState();
        const currentTime = player.getCurrentTime();
        const duration = player.getDuration();
        
        console.log(`End check: state=${state}, time=${currentTime.toFixed(1)}/${duration.toFixed(1)}`);
        
        if (state === YT.PlayerState.ENDED || (duration - currentTime <= 0.3)) {
          // If video has ended or is very close to ending
          if (!currentVideoEnded) {
            console.log(`End check detected ENDED or near-end state`);
            currentVideoEnded = true;
            window.currentVideoEnded = true;
            
            // If auto-scroll enabled, scroll to next video
            if (autoScrollEnabled) {
              console.log("Auto-scrolling due to end check");
              forceScrollToNextVideo();
            }
          }
        } else if (state === YT.PlayerState.PLAYING) {
          // Video is still playing, but near the end, check again soon
          setupEndTimeCheck(player);
        }
      }, timeRemaining * 1000);
    }
  } catch (e) {
    console.error("Error setting up end time check:", e);
  }
}

function onPlayerError(event) {
  console.error('Error in YouTube player:', event.data);
  
  let errorMessage = 'An error occurred while playing the video.';
  
  // Translate YouTube error codes to human-readable messages
  switch(event.data) {
    case 2:
      errorMessage = 'Invalid video ID or URL.';
      break;
    case 5:
      errorMessage = 'The requested content cannot be played in an HTML5 player.';
      break;
    case 100:
      errorMessage = 'The video has been removed or is private.';
      break;
    case 101:
    case 150:
      errorMessage = 'The video owner does not allow it to be played in embedded players.';
      break;
  }
  
  // Only show error if it's the current video
  const iframe = event.target.getIframe();
  const shortDiv = iframe.closest('.short');
  const shorts = document.querySelectorAll('.short');
  const isCurrentVideo = Array.from(shorts).indexOf(shortDiv) === currentIndex;
  
  if (isCurrentVideo) {
    // Display a small error message in the video container instead of full-screen error
    const errorOverlay = document.createElement('div');
    errorOverlay.className = 'video-error-overlay';
    errorOverlay.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 10px;
      text-align: center;
      z-index: 5;
    `;
    errorOverlay.innerHTML = `
      <p>${errorMessage}</p>
      <button class="next-video-btn" style="
        background: #2563eb;
        border: none;
        color: white;
        padding: 5px 10px;
        border-radius: 4px;
        cursor: pointer;
      ">Next Video</button>
    `;
    
    shortDiv.appendChild(errorOverlay);
    
    // Add event listener to button
    errorOverlay.querySelector('.next-video-btn').addEventListener('click', () => {
      forceScrollToNextVideo();
      errorOverlay.remove();
    });
    
    // Auto-proceed to next video after 5 seconds
    setTimeout(() => {
      if (document.contains(errorOverlay)) {
        forceScrollToNextVideo();
        errorOverlay.remove();
      }
    }, 5000);
  }
}

// Create a separate function to add videos without clearing existing ones
function appendMoreVideos(videos) {
  console.log(`Appending ${videos.length} more videos)`);

  // Don't clear container, just add new videos
  videos.forEach((url) => {
    if (!url || url === "null") {
      console.log("Invalid URL detected, skipping");
      return;
    }

    const shortDiv = document.createElement('div');
    shortDiv.className = 'short';
    shortDiv.style.opacity = '0'; // Initially hide the video
    shortDiv.style.position = 'absolute'; // Position them off-screen until scrolled to

    const embedWrapper = document.createElement('div');
    embedWrapper.className = 'embed-wrapper';

    const iframe = document.createElement('iframe');
    iframe.setAttribute('data-src', url);  // Use data-src for lazy loading
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('referrerpolicy', 'origin');
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation');
    iframe.style.border = '2px solid var(--border-color)'; 
    
    // Prevent scrolling from affecting page
    iframe.onload = function() {
      try {
        iframe.contentWindow.addEventListener('wheel', function(e) {
        e.preventDefault();
        e.stopPropagation();
        }, { passive: false });
      } catch (e) {
        // Ignore cross-origin errors
      }
    };

    embedWrapper.appendChild(iframe);
    shortDiv.appendChild(embedWrapper);
    container.appendChild(shortDiv);
  });

  // Update lazy loader for new videos
  registerLazyLoader();
}

// Modify appendVideos to handle empty video list visually
function appendVideos(videos) {
  console.log(`Appending ${videos.length} videos)`);

  // Clear the container before appending new videos
  container.innerHTML = "";
  
  // Recreate loading indicator (since we cleared the container)
  createLoadingIndicator();
  
  // Hide loading after videos are appended
  hideLoading();

  // Display visual error if no videos are available
  if (!videos || videos.length === 0) {
    showError('No videos available. Please try again later.');
    return;
  }

  videos.forEach((url) => {
    if (!url || url === "null") {
      console.log("Invalid URL detected, skipping");
      return;
    }

    const shortDiv = document.createElement('div');
    shortDiv.className = 'short';
    shortDiv.style.opacity = '0'; // Initially hide the video
    shortDiv.style.position = 'absolute'; // Position them off-screen until scrolled to

    const embedWrapper = document.createElement('div');
    embedWrapper.className = 'embed-wrapper';

    const iframe = document.createElement('iframe');
    iframe.setAttribute('data-src', url);  // Use data-src for lazy loading
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('referrerpolicy', 'origin');
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation');
    iframe.style.border = '2px solid var(--border-color)'; 
    
    // Prevent scrolling from affecting page
    iframe.onload = function() {
                        try {
                            iframe.contentWindow.addEventListener('wheel', function(e) {
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });
      } catch (e) {
        // Ignore cross-origin errors
      }
    };

    embedWrapper.appendChild(iframe);
    shortDiv.appendChild(embedWrapper);
    container.appendChild(shortDiv);
  });

  registerLazyLoader(); // Initialize lazy loading
  
  // Reset current index when appending fresh videos
  currentIndex = 0;
  
  // Hide any displayed errors
  hideError();
}

// Add function to collect queries from the UI
function collectAndSendQueries() {
  const queryDisplay = document.getElementById('ytQueryDisplay');
  if (!queryDisplay) return;
  
  // Get all the queries from the display
  const queryElements = Array.from(queryDisplay.querySelectorAll('span'))
    .filter(el => !el.textContent.includes('x')) // Filter out the delete buttons
    .map(el => el.textContent.trim());
  
  console.log('Collected queries:', queryElements);
  
  // Send to server via socket
  socket.emit('update_youtube_queries', {
    queries: queryElements,
    refresh: false // Don't refresh yet, we'll do it separately
  });
  
  return queryElements;
}

// Function to handle complete refresh
function refreshAllVideos() {
  console.log("Refreshing all videos");
  
  // Collect and send queries before refreshing
  const queries = collectAndSendQueries();
  console.log('Updated queries before refresh:', queries);
  
  // Clear all existing videos first
  if (container) {
    // Reset player map
    playerMap.clear();
    
    // Reset current index
    currentIndex = 0;
    
    // Show loading indicator
    showLoading();
    
    // Clear container
    container.innerHTML = "";
    
    // Create fresh loading indicator
    createLoadingIndicator();
    
    // Request new videos from server
    socket.emit('refresh_short_videos');
  }
}

// Add a new function that forces scroll regardless of autoScrollEnabled flag
function forceScrollToNextVideo() {
  const shorts = document.querySelectorAll('.short');
  const nextIndex = currentIndex + 1;

  // First ensure currentVideoEnded is updated globally
  if (currentVideoEnded) {
    window.currentVideoEnded = true;
  }

  if (nextIndex < shorts.length) {
    isScrolling = true;
    currentIndex = nextIndex;
    const nextShort = shorts[nextIndex];
    nextShort.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const iframe = nextShort.querySelector('iframe');
    const player = playerMap.get(iframe);
    if (player && typeof player.playVideo === 'function') {
      try {
        player.playVideo();
        // Reset currentVideoEnded since we're on a new video
        currentVideoEnded = false;
        window.currentVideoEnded = false;
        console.log("Reset currentVideoEnded to false after scrolling to new video");
      } catch (error) {
        console.error("Error playing video:", error);
      }
    }

    setTimeout(() => isScrolling = false, 1000);  // Allow 1s for scroll transition to complete
    
    // Check if we're getting low on videos, request more immediately
    const remainingVideos = shorts.length - nextIndex - 1;
    if (remainingVideos < MIN_VIDEOS_REQUIRED) {
      requestMoreVideos();
    }
  } else {
    // No next video, request more
    requestMoreVideos();
    showLoading();
  }
}

// Simple scroll function - just use autoScrollEnabled as a gate
function scrollToNextVideo() {
  // Only scroll when auto-scroll is enabled, page is visible, and we're not already scrolling
  if (!autoScrollEnabled || document.hidden || isScrolling) {
    return;
  }

  // Directly use force scroll
  forceScrollToNextVideo();
}

// Simplify video request function
function requestMoreVideos() {
  // Collect and send queries
  const queries = collectAndSendQueries();
  
  // Show loading indicator
  showLoading();
  
  // Send the request
  socket.emit('request_more_short_videos');
}

function registerLazyLoader() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const iframe = entry.target.querySelector('iframe');
        if (iframe && !iframe.src) {
          iframe.src = iframe.dataset.src;
          initPlayer(iframe);
          entry.target.style.opacity = '1'; // Fade in the video as it becomes visible
          entry.target.style.position = 'relative'; // Reset position
          // Autoplay the video once it comes into view
          const player = playerMap.get(iframe);
          if (player && typeof player.playVideo === 'function') {
            player.playVideo();
          }
        }
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('.short').forEach(short => {
    observer.observe(short);
  });
}

// Add this function to create a play button
function createPlayButton() {
  console.log('Creating play button');
  
  // Remove any existing play button
  const existingButton = document.querySelector('.yt-play-button');
  if (existingButton) existingButton.remove();
  
  // Create play button using CSS styles from styles.css
  const playButton = document.createElement('div');
  playButton.className = 'yt-play-button';
  
  // Add click event to start loading videos
  playButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Play button clicked - starting video load');
    playButton.style.display = 'none';
    
    // Use the same logic as refreshAllVideos
    console.log("Loading videos after play button click");
    
    // Collect and send queries before refreshing
    const queries = collectAndSendQueries();
    console.log('Updated queries for video load:', queries);
    
    // Reset player map
    playerMap.clear();
    
    // Reset current index
    currentIndex = 0;
    
    // Show loading indicator
    showLoading();
    
    // Clear container
    if (container) {
      container.innerHTML = "";
      
      // Create fresh loading indicator
      createLoadingIndicator();
      
      // Request new videos from server
      socket.emit('refresh_short_videos');
    }
  });
  
  // Add to container directly
  if (container) {
    container.appendChild(playButton);
  } else {
    const phoneContainer = document.querySelector('.yt-phone-container');
    if (phoneContainer) {
      phoneContainer.appendChild(playButton);
    } else {
      document.body.appendChild(playButton);
    }
  }
  
  console.log('Play button created and added to DOM');
  return playButton;
}

// Modify the DOMContentLoaded event listener to show play button instead of loading videos automatically
document.addEventListener('DOMContentLoaded', function() {
    createRefreshButton();
    createAutoScrollButton();

    // Function to initialize YouTube players for this script
    let shortsPlayersInitialized = false;
    function initYouTubeShortsPlayers() {
        if (shortsPlayersInitialized) return; // Prevent multiple initializations
        console.log("youtube_shorts.js: Attempting to init players.");
        if (window.YT && window.YT.Player) {
            console.log("youtube_shorts.js: API is ready, initializing players.");
            // Ensure we are targeting iframes specific to this component, e.g., within #videoScrollerSection
            document.querySelectorAll('#videoScrollerSection iframe[data-src]').forEach(initPlayer);
            shortsPlayersInitialized = true;
        } else {
            console.log("youtube_shorts.js: API not ready yet, will wait for youtubeApiGlobalReady event.");
        }
    }

    // Check if API is already ready when DOM content is loaded
    if (window.YT && window.YT.Player) {
        console.log("youtube_shorts.js: API was already ready on DOMContentLoaded.");
        initYouTubeShortsPlayers();
    }

    // Listen for the global API ready event
    document.addEventListener('youtubeApiGlobalReady', function handleApiReady() {
        console.log("youtube_shorts.js: Received youtubeApiGlobalReady event.");
        initYouTubeShortsPlayers();
        // If players are dynamically added/removed, you might not want to remove this listener.
        // For now, assume one-time initialization is sufficient after API is ready.
        // document.removeEventListener('youtubeApiGlobalReady', handleApiReady); 
    });
    
    const activeTab = localStorage.getItem('activeTab');
    const isMiscTab = activeTab === 'misc';
    
    if (isMiscTab) {
        setTimeout(() => {
            refreshAllVideos();
        }, 500);
    } else {
        createPlayButton();
    }
    
    window.addEventListener('storage', (e) => {
        if (e.key === 'activeTab' && e.newValue === 'misc') {
            refreshAllVideos();
        }
    });
    
    window.currentVideoEnded = currentVideoEnded;
});

// The loadVideos function remains unchanged, but it will now be called by the play button

socket.on('connect', () => {});
socket.on('placeholder_updated', (data) => {
    try {
        showToast('Placeholder updated successfully', 'success');
    } catch (error) {}
});

socket.on('short_videoList', (data) => {
    hideLoading();
    
    if (data && data.used_fallback) {
        const hasUserQueries = collectAndSendQueries().length > 0;
        if (hasUserQueries) {
            try {
                showToast('Using default queries due to insufficient results', 'info');
            } catch (error) {}
        }
    }
    
    if (data && data.videos && data.videos.length > 0) {
        appendVideos(data.videos);
    } else {
        showError('No videos found. Please try different search terms or try again later.');
        
        setTimeout(() => {
            if (document.querySelectorAll('.short').length === 0) {
                requestMoreVideos();
            }
        }, 500);
    }
});

socket.on('short_moreVideos', (data) => {
    hideLoading();
    
    if (data && data.used_fallback) {
        const hasUserQueries = collectAndSendQueries().length > 0;
        if (hasUserQueries) {
            try {
                showToast('Using default queries due to insufficient results', 'info');
            } catch (error) {}
        }
    }
    
    if (data && data.videos && data.videos.length > 0) {
        appendMoreVideos(data.videos);
        hideError();
    } else {
        if (document.querySelectorAll('.short').length === 0) {
            showError('Unable to load videos. Please try different search terms or try again later.');
        }
        
        const currentCount = document.querySelectorAll('.short').length;
        if (currentCount < MIN_VIDEOS_REQUIRED) {
            setTimeout(requestMoreVideos, 500);
        }
    }
});

socket.on('connect_error', (error) => {
    showError(`Connection error: ${error.message || 'Could not connect to server.'}`, true);
});

socket.on('connect_timeout', () => {
    showError('Connection timeout. Please check your internet connection and try again.', true);
});

socket.on('error', (error) => {
    showError(`Error: ${error.message || 'An unknown error occurred.'}`, true);
});

// Prevent page scrolling when interacting with the container
document.addEventListener('DOMContentLoaded', function() {
  // Apply to the container itself
  if (container) {
    container.addEventListener('wheel', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Use our own scroll logic
      if (e.deltaY > 0) {
        scrollToNextVideo();
      } else if (e.deltaY < 0 && currentIndex > 0) {
        // Add scroll up functionality
        const shorts = document.querySelectorAll('.short');
        if (currentIndex > 0) {
          isScrolling = true;
          currentIndex--;
          const prevShort = shorts[currentIndex];
          prevShort.scrollIntoView({ behavior: 'smooth', block: 'start' });
          
          const iframe = prevShort.querySelector('iframe');
          const player = playerMap.get(iframe);
          if (player && typeof player.playVideo === 'function') {
            try {
              player.playVideo();
            } catch (error) {
              console.error("Error playing video:", error);
            }
          }
          
          setTimeout(() => isScrolling = false, 1000);
        }
      }
    }, { passive: false, capture: true });
    
    // Prevent scrolling but allow control interaction
    function preventIframeScroll() {
      // Create a global wheel event handler
        document.addEventListener('wheel', function(e) {
        // Check if the wheel event is happening over an iframe
        const element = document.elementFromPoint(e.clientX, e.clientY);
        if (element && (element.tagName === 'IFRAME' || element.closest('iframe'))) {
          // If we're over an iframe, prevent default scrolling and handle with our logic
                e.preventDefault();
                e.stopPropagation();
                
          // Apply our own scrolling logic
          if (e.deltaY > 0) {
            scrollToNextVideo();
          } else if (e.deltaY < 0 && currentIndex > 0) {
            // Scroll to previous
            const shorts = document.querySelectorAll('.short');
            if (currentIndex > 0) {
              isScrolling = true;
              currentIndex--;
              const prevShort = shorts[currentIndex];
              prevShort.scrollIntoView({ behavior: 'smooth', block: 'start' });
              
              const iframe = prevShort.querySelector('iframe');
              const player = playerMap.get(iframe);
              if (player && typeof player.playVideo === 'function') {
                try {
                  player.playVideo();
                } catch (error) {
                  console.error("Error playing video:", error);
                }
              }
              
              setTimeout(() => isScrolling = false, 1000);
            }
          }
                return false;
            }
        }, { passive: false, capture: true });
      
      // Don't add overlays or disable pointer events
    }
    
    preventIframeScroll();
  }
  
  const ytRefreshButton = document.getElementById('ytRefreshButton');
  if (ytRefreshButton) {
    ytRefreshButton.addEventListener('click', () => {
      console.log("Refresh button clicked");
      refreshAllVideos();
    });
  }
});

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

async function guardedRequestMoreVideos() {
  await getAdminRoute();
  const isMiscTab = localStorage.getItem('activeTab') === 'miscellaneous';
  if (isOnAdminRoute() && !isMiscTab) {
    console.log('[YouTube Shorts] Skipping video request: on admin route and not on Miscellaneous tab');
    return;
  }
  requestMoreVideos();
}
async function guardedLoadVideos() {
  await getAdminRoute();
  const isMiscTab = localStorage.getItem('activeTab') === 'miscellaneous';
  if (isOnAdminRoute() && !isMiscTab) {
    console.log('[YouTube Shorts] Skipping video load: on admin route and not on Miscellaneous tab');
    return;
  }
  loadVideos();
}

document.addEventListener('ws:reconnected', () => {
    console.log('[YouTube Shorts] WebSocket reconnected. Requesting more videos if needed.');
  guardedRequestMoreVideos();
});