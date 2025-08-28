const defaults = {
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

  let currentTheme = {};
  
  function applyTheme(theme) {
    currentTheme = { ...defaults, ...theme };
    let css = ":root {";
    Object.keys(currentTheme).forEach(key => css += key + ": " + currentTheme[key] + ";");
    css += "}";
    let styleTag = document.getElementById("themeStyles");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "themeStyles";
      document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = css;
  }
  function loadTheme() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      try {
        const parsedTheme = JSON.parse(savedTheme);
        applyTheme(parsedTheme);
      } catch (e) {
        console.error("Error loading theme from localStorage", e);
      }
    } else {
      applyTheme(defaults);
    }
  
    Object.keys(defaults).forEach(key => {
      const input = document.querySelector(`[data-var="${key}"]`);
      if (input) input.value = currentTheme[key];
    });
  }
  function saveTheme() {
    try {
      const themeData = JSON.stringify(currentTheme);
      localStorage.setItem("theme", themeData);
    } catch (e) {
      console.error("Error saving theme to localStorage", e);
    }
  }


document.addEventListener('DOMContentLoaded', function() {
  document.getElementById("themeForm").addEventListener("input", e => {
    if (e.target.matches("input[data-var]")) {
      const key = e.target.getAttribute("data-var");
      currentTheme[key] = e.target.value;
      applyTheme(currentTheme);
    }
  });
  document.getElementById("themeForm").addEventListener("submit", e => {
    e.preventDefault();
    saveTheme();
  });
  loadTheme();
});