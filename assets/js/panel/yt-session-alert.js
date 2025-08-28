(function() {
  let alertInitialized = false;
  let lastKnownSessions = new Set();
  let ytPlayers = new Map();
  let lastKnownPlayerState = 1; 
  let lastStateChangeTime = 0;
  
  document.addEventListener('youtube-player-state-changed', function(e) {
    if (e.detail && e.detail.state !== undefined) {
      lastKnownPlayerState = e.detail.state;
      lastStateChangeTime = Date.now();
    }
  });
  
  let sessionAlertPlayersInitialized = false;
  function initYouTubePlayers() {
    if (sessionAlertPlayersInitialized && ytPlayers.size > 0) return;
    
    if (!window.YT || !window.YT.Player) {
      console.log("yt-session-alert.js: YouTube API not ready. Players will not be initialized yet.");
      return;
    }
    console.log("yt-session-alert.js: YouTube API is ready. Initializing/checking players.");
    
    const iframes = document.querySelectorAll('iframe[src*="youtube"]');
    iframes.forEach(iframe => {
      if (ytPlayers.has(iframe)) {
        return;
      }
      
      try {
        const player = new YT.Player(iframe, {
          events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
          }
        });
        
        ytPlayers.set(iframe, player);
      } catch (e) {}
    });
  }
  
  function onPlayerReady(event) {}
  
  function onPlayerStateChange(event) {
    lastKnownPlayerState = event.data;
    lastStateChangeTime = Date.now();
    
    document.dispatchEvent(new CustomEvent('youtube-player-state-changed', {
      detail: { 
        state: event.data, 
        playerSource: 'yt-session-alert.js',
        timestamp: Date.now()
      }
    }));
  }
  
  function getStateName(stateCode) {
    const stateNames = {
      '-1': 'UNSTARTED',
      '0': 'ENDED',
      '1': 'PLAYING',
      '2': 'PAUSED',
      '3': 'BUFFERING',
      '5': 'CUED'
    };
    
    return stateNames[stateCode] || `UNKNOWN(${stateCode})`;
  }
  
  function isAnyYouTubePlayerPlaying() {
    if (ytPlayers.size === 0) {
      return false;
    }
    
    for (const [iframe, player] of ytPlayers.entries()) {
      const rect = iframe.getBoundingClientRect();
      const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight && 
                      rect.width > 100 && rect.height > 100;
      
      if (!isVisible) {
        continue;
      }
      
      try {
        if (player && typeof player.getPlayerState === 'function') {
          const state = player.getPlayerState();
          if (state === 1) {
            return true;
          }
        }
      } catch (e) {}
    }
    
    return false;
  }
  
  function isYouTubeIframePlaying(iframe) {
    if (iframe.src && iframe.src.includes('youtube-nocookie.com')) {
      const shortContainer = iframe.closest('.short');
      if (!shortContainer) return false;
      
      const shortDiv = iframe.closest('.short');
      
      const rect = iframe.getBoundingClientRect();
      const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight && 
                      rect.width > 100 && rect.height > 100;
      
      if (!isVisible) {
        return false; 
      }
      
      const shorts = document.querySelectorAll('.short');
      let activeShortIndex = -1;
      
      for (let i = 0; i < shorts.length; i++) {
        if (shorts[i] === shortDiv) {
          activeShortIndex = i;
          break;
        }
      }
      
      if (typeof window.currentIndex === 'number') {
        return activeShortIndex === window.currentIndex;
      }
      
      if (activeShortIndex !== -1) {
        let maxVisibleArea = 0;
        let mostVisibleIndex = -1;
        
        for (let i = 0; i < shorts.length; i++) {
          const rect = shorts[i].getBoundingClientRect();
          const visibleTop = Math.max(0, rect.top);
          const visibleBottom = Math.min(window.innerHeight, rect.bottom);
          if (visibleBottom > visibleTop) {
            const visibleArea = (visibleBottom - visibleTop) * rect.width;
            if (visibleArea > maxVisibleArea) {
              maxVisibleArea = visibleArea;
              mostVisibleIndex = i;
            }
          }
        }
        
        if (activeShortIndex === mostVisibleIndex) {
          return true;
        }
      }
      
      if (iframe.src.includes('autoplay=1')) {
        const possiblePauseButton = shortDiv.querySelector('.ytp-large-play-button');
        
        if (possiblePauseButton) {
          const style = window.getComputedStyle(possiblePauseButton);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return false;
          }
        }
        
        return true;
      }
      
      return false;
    }
    
    try {
      const player = ytPlayers.get(iframe);
      if (player && player.getPlayerState) {
        const state = player.getPlayerState();
        return state === YT.PlayerState.PLAYING;
      }
    } catch (e) {}
    
    return false;
  }
  
  function initSessionAlert() {
    if (alertInitialized) return;
    alertInitialized = true;
    
    initYouTubePlayers();
    
    document.addEventListener('youtubeApiGlobalReady', function handleApiReadyForAlerts() {
        console.log("yt-session-alert.js: Received youtubeApiGlobalReady event.");
        initYouTubePlayers();
    });
    
    setInterval(() => {
      initYouTubePlayers();
    }, 2000);
    
    function isWatchingYouTubeShorts() {
      const youtubeSection = document.getElementById('videoScrollerSection');
      if (!youtubeSection) return false;
      
      const isVisible = window.getComputedStyle(youtubeSection).display !== 'none' && 
                       youtubeSection.offsetParent !== null;
      if (!isVisible) return false;
      
      if (lastKnownPlayerState === 2 || lastKnownPlayerState === 0) {
        return false;
      }
      
      for (const [iframe, player] of ytPlayers.entries()) {
        try {
          if (player && typeof player.getPlayerState === 'function') {
            const state = player.getPlayerState();
            if (state === 2 || state === 0) {
              return false;
            }
          }
        } catch (e) {}
      }
      
      if (window.playerMap) {
        for (const [iframe, player] of window.playerMap.entries()) {
          try {
            if (player && typeof player.getPlayerState === 'function') {
              const state = player.getPlayerState();
              if (state === 2 || state === 0) {
                return false;
              }
            }
          } catch (e) {}
        }
      }
      
      if (window.player && typeof window.player.getPlayerState === 'function') {
        try {
          const state = window.player.getPlayerState();
          if (state === 2 || state === 0) {
            return false;
          }
        } catch (e) {}
      }
      
      const hasShorts = youtubeSection.querySelectorAll('.short').length > 0;
      return hasShorts;
    }
    
    function showNewSessionAlert(sessionData) {
      if (!isWatchingYouTubeShorts()) {
        return;
      }
      
      let overlayEl = document.getElementById('newSessionAlertOverlay');
      let alertEl = document.getElementById('newSessionAlert');
      
      if (overlayEl) overlayEl.remove();
      if (alertEl) alertEl.remove();
      
      overlayEl = document.createElement('div');
      overlayEl.id = 'newSessionAlertOverlay';
      document.body.appendChild(overlayEl);
      
      alertEl = document.createElement('div');
      alertEl.id = 'newSessionAlert';
      document.body.appendChild(alertEl);
      
      function cleanupAndRedirect(shouldRedirect) {
        if (shouldRedirect) {
          for (const [iframe, player] of ytPlayers.entries()) {
            try {
              if (player && typeof player.pauseVideo === 'function') {
                player.pauseVideo();
              }
            } catch (e) {}
          }
          
          if (window.player && typeof window.player.pauseVideo === 'function') {
            try {
              window.player.pauseVideo();
            } catch (e) {}
          }
          
          if (window.playerMap) {
            for (const [iframe, player] of window.playerMap.entries()) {
              try {
                if (player && typeof player.pauseVideo === 'function') {
                  player.pauseVideo();
                }
              } catch (e) {}
            }
          }
        }
        
        document.getElementById('newSessionAlertOverlay').remove();
        document.getElementById('newSessionAlert').remove();
        
        if (shouldRedirect) {
          const sessionsTab = document.getElementById('sessionsTab');
          if (sessionsTab) {
            sessionsTab.click();
          } else {
            window.location.href = '#sessions-tab';
          }
        }
      }
      
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
      
      let locationInfo = '';
      if (typeof sessionData === 'object') {
        if (sessionData.location && sessionData.country) {
          locationInfo = `${sessionData.location} (${sessionData.country})`;
        }
      }
      
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
      
      window.goToSessions = function() {
        cleanupAndRedirect(true);
      };
      
      window.cleanupAndRedirect = cleanupAndRedirect;
      
      if (window.state?.settings?.playSound) {
        try {
          window.playNotificationSound?.('new-session');
        } catch (e) {}
      }
    }
    
    function setupSocketListeners() {
      if (!window.socket) {
        setTimeout(setupSocketListeners, 1000);
        return;
      }
      
      window.socket.on('new_session_created', function(sessionData) {
        showNewSessionAlert(sessionData);
      });
      
      window.socket.on('session_updated', function(data) {
        if (data && typeof data === 'object' && data.message && data.message.includes('NEW SESSION:')) {
          try {
            const sessionInfo = JSON.parse(data.message.split('NEW SESSION:')[1].trim());
            showNewSessionAlert(sessionInfo);
          } catch (e) {}
        }
      });
      
      window.socket.emit('request_sessions');
      
      setInterval(() => {
        if (isWatchingYouTubeShorts()) {
          window.socket.emit('request_sessions');
        }
      }, 2000);
    }
    
    setupSocketListeners();

    document.addEventListener('ws:reconnected', () => {
      setupSocketListeners();
    });
  }
  
  if (window.socket) {
    initSessionAlert();
  } else {
    const checkSocket = setInterval(() => {
      if (window.socket) {
        clearInterval(checkSocket);
        initSessionAlert();
      }
    }, 1000);
    
    setTimeout(() => {
      clearInterval(checkSocket);
      if (window.socket) {
        initSessionAlert();
      }
    }, 5000);
  }
})(); 