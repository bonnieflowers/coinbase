class ConfigManager {
    constructor() {
        this.config = null;
        this.lastFetch = 0;
        this.refreshInterval = 5 * 60 * 1000; // 5 minutes
        this.isLoading = false;
        this.loadPromise = null;
        
        this.init();
    }

    async init() {
        await this.loadConfig();
        this.startPeriodicUpdate();
    }

    async loadConfig(force = false) {
        const now = Date.now();
        
        if (!force && this.config && (now - this.lastFetch) < this.refreshInterval) {
            return this.config;
        }

        if (this.isLoading) {
            return this.loadPromise;
        }

        this.isLoading = true;
        this.loadPromise = this.fetchConfigFromServer();

        try {
            this.config = await this.loadPromise;
            this.lastFetch = now;
            window.config = this.config;
            
            if (window.appConfig) {
                window.appConfig = {...window.appConfig, ...this.config};
            } else {
                window.appConfig = this.config;
            }
            
            document.dispatchEvent(new CustomEvent('config:updated', { detail: this.config }));
            
        } catch (error) {
            console.error('[ConfigManager] Failed to load config:', error);
            if (!this.config) {
                this.config = { pages: {} };
                window.config = this.config;
            }
        } finally {
            this.isLoading = false;
            this.loadPromise = null;
        }

        return this.config;
    }

    async fetchConfigFromServer() {
        const response = await fetch('/api/v1/config');
        if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
        }
        return await response.json();
    }

    getConfig() {
        if (this.config) {
            return this.config;
        }
        
        this.loadConfig();
        return this.config || { pages: {} };
    }

    async getConfigAsync() {
        return await this.loadConfig();
    }

    getAdminRoute() {
        const config = this.getConfig();
        return config?.admin?.route || '/admin';
    }

    startPeriodicUpdate() {
        setInterval(() => {
            this.loadConfig(true);
        }, this.refreshInterval);
    }

    forceRefresh() {
        return this.loadConfig(true);
    }
}

window.configManager = new ConfigManager();

window.getConfig = () => window.configManager.getConfig();
window.getConfigAsync = () => window.configManager.getConfigAsync();
window.getAdminRoute = () => window.configManager.getAdminRoute();

console.log('[ConfigManager] Successfully initialized and started'); 