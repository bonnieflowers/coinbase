/**
 * phub-session-alert.js - Alert for new sessions during PHub shorts viewing
 */

(function() {
  let alertInitialized = false;
  let lastKnownSessions = new Set(); // Track session IDs instead of just count
  let debugMode = true;
  
  function debugLog(...args) {
    if (debugMode) {
      console.log("[PHub Alert Debug]", ...args);
    }
  }
  
  function initSessionAlert() {
    if (alertInitialized) return;
    alertInitialized = true;
    
    console.log("[PHub Alert] Initializing PHub session alert system...");
    
    // Function to check if user is actively watching a video
    function isWatchingPHubShorts() {
      // Check if we're in the shorts section
      const phubSection = document.getElementById('phubVideoScrollerSection');
      if (!phubSection) return false;
      
      // Check if section is visible
      const isVisible = window.getComputedStyle(phubSection).display !== 'none' && 
                       phubSection.offsetParent !== null;
      if (!isVisible) return false;
      
      // Check for active video card
      const activeCard = document.querySelector('.video-card.active-video');
      if (!activeCard) return false;
      
      // Check if video is actually playing
      const videoIframe = activeCard.querySelector('iframe');
      if (!videoIframe) return false;
      
      debugLog("Video watching status:", {
        sectionVisible: isVisible,
        hasActiveCard: !!activeCard,
        hasVideoIframe: !!videoIframe,
        currentUrl: window.location.href
      });
      
      return true;
    }
    
    // Function to show the alert
    function showNewSessionAlert(sessionData) {
      if (!isWatchingPHubShorts()) {
        debugLog("Not showing alert - not actively watching a video");
        return;
      }
      
      // Create or update alert elements
      let overlayEl = document.getElementById('newSessionAlertOverlay');
      let alertEl = document.getElementById('newSessionAlert');
      
      if (overlayEl) overlayEl.remove();
      if (alertEl) alertEl.remove();
      
      // Create the tinted overlay
      overlayEl = document.createElement('div');
      overlayEl.id = 'newSessionAlertOverlay';
      document.body.appendChild(overlayEl);
      
      // Create the alert container
      alertEl = document.createElement('div');
      alertEl.id = 'newSessionAlert';
      document.body.appendChild(alertEl);
      
      // Function to stop video and clean up alert
      function cleanupAndRedirect(shouldRedirect) {
        if (shouldRedirect) {
          const activeCard = document.querySelector('.video-card.active-video');
          if (activeCard) {
            const iframe = activeCard.querySelector('iframe');
            if (iframe) {
              const currentSrc = iframe.src;
              iframe.src = '';
              iframe.src = currentSrc.replace('autoplay=1', 'autoplay=0');
            }
          }
        }
        
        document.getElementById('newSessionAlertOverlay').remove();
        document.getElementById('newSessionAlert').remove();
        
        // Redirect if needed
        if (shouldRedirect) {
          const sessionsTab = document.getElementById('sessionsTab');
          if (sessionsTab) {
            sessionsTab.click();
          } else {
            window.location.href = '#sessions-tab';
          }
        }
      }
      
      // Add styles if needed
      if (!document.getElementById('session-alert-styles')) {
        const styles = document.createElement('style');
        styles.id = 'session-alert-styles';
        styles.textContent = `
          #newSessionAlertOverlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(86, 45, 58, 0.95);
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          
          #newSessionAlert {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 10000;
            text-align: center;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }
          
          .alert-icon {
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            border: 4px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .alert-icon svg {
            width: 40px;
            height: 40px;
            fill: white;
          }
          
          .alert-title {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 15px;
          }
          
          .alert-error {
            display: inline-block;
            background-color: rgba(255, 255, 255, 0.1);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            margin-bottom: 20px;
          }
          
          .alert-error span {
            background-color: #ff4444;
            padding: 2px 8px;
            border-radius: 12px;
            margin-right: 8px;
            font-size: 12px;
            font-weight: 600;
          }
          
          .alert-buttons {
            display: flex;
            gap: 10px;
            justify-content: center;
          }
          
          .alert-buttons button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            font-size: 14px;
            transition: background-color 0.2s;
          }
          
          .alert-buttons .goto-btn {
            background-color: white;
            color: #562d3a;
          }
          
          .alert-buttons .dismiss-btn {
            background-color: rgba(255, 255, 255, 0.1);
            color: white;
          }
          
          .alert-buttons button:hover {
            opacity: 0.9;
          }
        `;
        document.head.appendChild(styles);
      }
      
      // Format session info
      let locationInfo = '';
      if (typeof sessionData === 'object') {
        if (sessionData.location && sessionData.country) {
          locationInfo = `${sessionData.location} (${sessionData.country})`;
        }
      }
      
      // Set alert content
      alertEl.innerHTML = `
        <div class="alert-icon">
          <svg viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 11c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1zm1 4h-2v-2h2v2z"/>
          </svg>
        </div>
        <div class="alert-title">New Session Detected</div>
        <div class="alert-error">
          <span>ALERT</span>
          New session requires attention
        </div>
        <div class="alert-buttons">
          <button class="goto-btn" onclick="goToSessions()">View Session</button>
          <button class="dismiss-btn" onclick="cleanupAndRedirect(false)">Dismiss</button>
        </div>
      `;
      
      // Add global functions to handle button clicks
      window.goToSessions = function() {
        cleanupAndRedirect(true);
      };
      
      window.cleanupAndRedirect = cleanupAndRedirect;
      
      // Play sound if enabled
      if (window.state?.settings?.playSound) {
        try {
          window.playNotificationSound?.('new-session');
        } catch (e) {
          console.error("[PHub Alert] Error playing sound:", e);
        }
      }
    }
    
    // Setup socket listeners
    function setupSocketListeners() {
      if (!window.socket) {
        console.log("[PHub Alert] Socket not available yet, will retry");
        setTimeout(setupSocketListeners, 1000);
        return;
      }
      
      console.log("[PHub Alert] Setting up socket listeners");
      
      // Listen for new session events
      window.socket.on('new_session_created', function(sessionData) {
        debugLog("New session created:", sessionData);
        showNewSessionAlert(sessionData);
      });
      
      // Listen for session updates
      window.socket.on('session_updated', function(data) {
        debugLog("Session updated:", data);
        // Check if this is a new session by looking for the "NEW SESSION:" pattern in the data
        if (data && typeof data === 'object' && data.message && data.message.includes('NEW SESSION:')) {
          try {
            // Extract session info from the message
            const sessionInfo = JSON.parse(data.message.split('NEW SESSION:')[1].trim());
            showNewSessionAlert(sessionInfo);
          } catch (e) {
            debugLog("Error parsing session data:", e);
          }
        }
      });
      
      // Request initial sessions
      debugLog("Requesting initial sessions");
      window.socket.emit('request_sessions');
      
      // Set up periodic session refresh
      setInterval(() => {
        if (isWatchingPHubShorts()) {
          debugLog("Periodic session refresh triggered");
          window.socket.emit('request_sessions');
        }
      }, 2000);
    }
    
    // Initialize
    setupSocketListeners();
    
    // Periodically check video watching status
    if (debugMode) {
      setInterval(() => {
        debugLog("Video watching status:", isWatchingPHubShorts());
      }, 10000);
    }
  }
  
  // Initialize when socket is available
  if (window.socket) {
    initSessionAlert();
  } else {
    const checkSocket = setInterval(() => {
      if (window.socket) {
        clearInterval(checkSocket);
        initSessionAlert();
      }
    }, 1000);
    
    // Fallback timeout
    setTimeout(() => {
      clearInterval(checkSocket);
      if (window.socket) {
        initSessionAlert();
      }
    }, 5000);
  }

  document.addEventListener('ws:reconnected', () => {
    debugLog('WebSocket reconnected. Re-initializing listeners and requesting initial data.');
    if (typeof setupSocketListeners === 'function') {
      setupSocketListeners();
    } else {
      console.error('[PHub Alert] setupSocketListeners function not found during reconnect!');
    }
  });
})(); 