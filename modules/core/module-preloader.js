/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MÓDULO: ModulePreloader - Sistema de Precarga Avanzada
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ¿QUÉ HACE ESTE ARCHIVO?
 * Este sistema "anticipa" qué módulos vas a usar y los carga en segundo plano
 * ANTES de que los necesites, para que cuando hagas clic, el contenido
 * aparezca casi instantáneamente.
 * 
 * MEJORAS IMPLEMENTADAS:
 * 
 * 1. PRECARGA COMPLETA (Antes solo HTML, ahora HTML + CSS + JS)
 *    - Antes: Solo guardaba el HTML del módulo
 *    - Ahora: Guarda HTML, precarga CSS y prepara JS
 *    - Beneficio: Al cambiar de módulo, todo ya está listo
 * 
 * 2. USO DE requestIdleCallback
 *    - ¿Qué es? Una función del navegador que ejecuta código solo cuando
 *      el navegador "no tiene nada que hacer"
 *    - Beneficio: La precarga no bloquea ni ralentiza tu interfaz
 * 
 * 3. PRECARGA PARALELA
 *    - Antes: Cargaba un módulo a la vez
 *    - Ahora: Puede cargar hasta 2 módulos simultáneamente
 *    - Beneficio: Preparación más rápida de múltiples módulos
 * 
 * 4. SISTEMA DE REINTENTOS
 *    - Si falla una carga (por ejemplo, internet lento), reintenta automáticamente
 *    - Beneficio: Mayor confiabilidad
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

class ModulePreloader {
    constructor() {
        this.cache = new Map();
        this.htmlCache = new Map();
        this.cssCache = new Map();
        this.jsCache = new Map();
        this.activeModules = new Set();
        this.preloadQueue = [];
        this.maxCachedModules = 6;
        this.isPreloading = false;
        this.activePreloads = 0;
        this.maxConcurrentPreloads = 2;

        this.moduleUsageStats = new Map();
        this.moduleAccessOrder = [];

        this.retryAttempts = new Map();
        this.maxRetries = 2;

        console.log('📦 ModulePreloader v2.0 inicializado (precarga completa: HTML + CSS + JS)');
    }

    /**
     * FUNCIÓN PRINCIPAL DE PRECARGA
     * Carga todos los recursos de un módulo en segundo plano
     */
    async preloadModule(moduleName) {
        if (this.cache.has(moduleName)) {
            console.log(`✅ Módulo ${moduleName} ya en cache completo`);
            return this.cache.get(moduleName);
        }

        if (this.activePreloads >= this.maxConcurrentPreloads) {
            console.log(`⏳ Pre-carga de ${moduleName} en cola (${this.activePreloads} activas)`);
            if (!this.preloadQueue.includes(moduleName)) {
                this.preloadQueue.push(moduleName);
            }
            return null;
        }

        this.activePreloads++;
        console.log(`🔄 Pre-cargando módulo completo: ${moduleName}`);

        try {
            const moduleData = await this.loadModuleAssets(moduleName);

            if (moduleData) {
                this.cache.set(moduleName, moduleData);
                console.log(`✅ Módulo ${moduleName} pre-cargado completamente`);
                this.manageCache();
            }

            return moduleData;

        } catch (error) {
            console.warn(`⚠️ Error pre-cargando ${moduleName}:`, error);
            await this.handleRetry(moduleName);
            return null;

        } finally {
            this.activePreloads--;
            this.processQueue();
        }
    }

    /**
     * CARGA TODOS LOS RECURSOS DEL MÓDULO
     * Usa Promise.all para cargar HTML, CSS y JS en paralelo (¡más rápido!)
     */
    async loadModuleAssets(moduleName) {
        const basePath = `./modules/${moduleName}/${moduleName}`;

        const [html, cssLoaded, jsChecked] = await Promise.all([
            this.fetchHTML(`${basePath}.html`),
            this.preloadCSS(`${basePath}.css`, moduleName),
            this.checkJS(`${basePath}.js`, moduleName)
        ]);

        if (!html) {
            return null;
        }

        return {
            html,
            cssPreloaded: cssLoaded,
            jsPath: jsChecked ? `${basePath}.js` : null,
            timestamp: Date.now(),
            accessCount: 0
        };
    }

    /**
     * OBTENER HTML
     * Descarga el contenido HTML del módulo
     */
    async fetchHTML(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`⚠️ HTML no encontrado: ${url}`);
                return null;
            }
            const html = await response.text();
            return html;
        } catch (error) {
            console.warn(`⚠️ Error cargando HTML: ${url}`, error);
            return null;
        }
    }

    /**
     * PRECARGAR CSS
     * Usa <link rel="preload"> para que el CSS esté listo cuando se necesite
     * 
     * ¿Por qué "preload"?
     * - El navegador descarga el archivo pero NO lo aplica todavía
     * - Cuando realmente lo necesites, ya está en memoria = instantáneo
     */
    async preloadCSS(url, moduleName) {
        return new Promise((resolve) => {
            const existingPreload = document.querySelector(`link[data-preload-css="${moduleName}"]`);
            if (existingPreload) {
                resolve(true);
                return;
            }

            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'style';
            link.href = url;
            link.setAttribute('data-preload-css', moduleName);

            link.onload = () => {
                console.log(`📄 CSS pre-cargado: ${moduleName}`);
                this.cssCache.set(moduleName, url);
                resolve(true);
            };

            link.onerror = () => {
                console.log(`📄 CSS no disponible para: ${moduleName}`);
                resolve(false);
            };

            document.head.appendChild(link);
        });
    }

    /**
     * VERIFICAR JS
     * Comprueba si el archivo JS existe (HEAD request = solo verificar, no descargar)
     * El JS se cargará cuando realmente se necesite, pero sabemos que existe
     */
    async checkJS(url, moduleName) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            if (response.ok) {
                this.jsCache.set(moduleName, url);
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * SISTEMA DE REINTENTOS
     * Si falla una carga, espera un poco y reintenta (hasta 2 veces)
     */
    async handleRetry(moduleName) {
        this.cache.delete(moduleName);
        this.htmlCache.delete(moduleName);
        this.cssCache.delete(moduleName);
        this.jsCache.delete(moduleName);

        const attempts = this.retryAttempts.get(moduleName) || 0;

        if (attempts < this.maxRetries) {
            this.retryAttempts.set(moduleName, attempts + 1);
            console.log(`🔄 Reintentando precarga de ${moduleName} (intento ${attempts + 1})`);

            await new Promise(resolve => setTimeout(resolve, 1000 * (attempts + 1)));

            this.scheduleIdlePreload(moduleName);
        } else {
            console.warn(`❌ Precarga de ${moduleName} fallida después de ${this.maxRetries} intentos`);
            this.retryAttempts.delete(moduleName);
        }
    }

    /**
     * PROCESAR COLA DE PRECARGA
     * Cuando termina una precarga, inicia la siguiente en la cola
     */
    processQueue() {
        if (this.preloadQueue.length > 0 && this.activePreloads < this.maxConcurrentPreloads) {
            const next = this.preloadQueue.shift();
            this.scheduleIdlePreload(next);
        }
    }

    /**
     * PROGRAMAR PRECARGA EN TIEMPO LIBRE
     * Usa requestIdleCallback para no interferir con la interfaz
     * 
     * ¿Qué es requestIdleCallback?
     * - Le dice al navegador: "Cuando no tengas nada importante que hacer, ejecuta esto"
     * - Así la precarga ocurre sin que el usuario note ninguna lentitud
     */
    scheduleIdlePreload(moduleName) {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => {
                this.preloadModule(moduleName);
            }, { timeout: 3000 });
        } else {
            setTimeout(() => {
                this.preloadModule(moduleName);
            }, 100);
        }
    }

    /**
     * OBTENER HTML DEL CACHE
     * Si el módulo está en cache, lo devuelve instantáneamente
     */
    async getModuleHTML(moduleName) {
        const cached = this.cache.get(moduleName);

        if (cached && cached.html) {
            console.log(`⚡ HTML de ${moduleName} servido desde cache`);
            this.updateUsageStats(moduleName);
            return cached.html;
        }

        console.log(`📥 Cargando HTML de ${moduleName} (no en cache)`);
        const result = await this.preloadModule(moduleName);
        return result ? result.html : null;
    }

    /**
     * VERIFICAR SI UN MÓDULO ESTÁ COMPLETAMENTE EN CACHE
     */
    isModuleReady(moduleName) {
        const cached = this.cache.get(moduleName);
        return cached && cached.html;
    }

    /**
     * OBTENER RUTA CSS PRECARGADA
     */
    getPreloadedCSS(moduleName) {
        return this.cssCache.get(moduleName);
    }

    /**
     * OBTENER RUTA JS VERIFICADA
     */
    getVerifiedJS(moduleName) {
        return this.jsCache.get(moduleName);
    }

    /**
     * ACTUALIZAR ESTADÍSTICAS DE USO
     * Para saber qué módulos son más populares
     */
    updateUsageStats(moduleName) {
        const current = this.moduleUsageStats.get(moduleName) || 0;
        this.moduleUsageStats.set(moduleName, current + 1);

        this.moduleAccessOrder = this.moduleAccessOrder.filter(m => m !== moduleName);
        this.moduleAccessOrder.push(moduleName);

        if (this.moduleAccessOrder.length > 10) {
            this.moduleAccessOrder.shift();
        }
    }

    /**
     * PREDICCIÓN INTELIGENTE
     * Basándose en patrones de uso, predice qué módulo usarás después
     * 
     * Ejemplo: Si estás en "caja", probablemente irás a "ventas" o "créditos"
     */
    predictNextModule() {
        if (this.moduleAccessOrder.length < 1) return null;

        const patterns = {
            'caja': ['ventas', 'creditos', 'pagos'],
            'ventas': ['caja', 'inventario', 'clientes'],
            'creditos': ['ventas', 'pagos', 'clientes'],
            'inventario': ['compras', 'ventas', 'proveedores'],
            'compras': ['inventario', 'proveedores', 'pagos'],
            'pagos': ['creditos', 'caja', 'proveedores'],
            'clientes': ['ventas', 'creditos'],
            'proveedores': ['compras', 'inventario', 'pagos'],
            'notas': ['ventas', 'caja', 'inventario'],
            'reportes': ['ventas', 'inventario', 'creditos'],
            'usuarios': ['configuracion'],
            'configuracion': ['usuarios']
        };

        const lastModule = this.moduleAccessOrder[this.moduleAccessOrder.length - 1];
        const predictions = patterns[lastModule] || ['notas', 'ventas'];

        for (const predicted of predictions) {
            if (!this.cache.has(predicted)) {
                return predicted;
            }
        }

        return null;
    }

    /**
     * PRECARGA AUTOMÁTICA
     * Predice y precarga el siguiente módulo probable
     */
    autoPreload() {
        const predictions = this.getMultiplePredictions();

        predictions.forEach((predicted, index) => {
            setTimeout(() => {
                this.scheduleIdlePreload(predicted);
            }, index * 500);
        });
    }

    /**
     * OBTENER MÚLTIPLES PREDICCIONES
     * Devuelve hasta 2 módulos que probablemente usarás
     */
    getMultiplePredictions() {
        const patterns = {
            'caja': ['ventas', 'creditos'],
            'ventas': ['caja', 'inventario'],
            'creditos': ['ventas', 'pagos'],
            'inventario': ['compras', 'ventas'],
            'compras': ['inventario', 'proveedores'],
            'pagos': ['creditos', 'caja'],
            'clientes': ['ventas', 'creditos'],
            'proveedores': ['compras', 'inventario'],
            'notas': ['ventas', 'caja']
        };

        const lastModule = this.moduleAccessOrder[this.moduleAccessOrder.length - 1];
        const predictions = patterns[lastModule] || [];

        return predictions.filter(p => !this.cache.has(p)).slice(0, 2);
    }

    /**
     * GESTIÓN DEL CACHE (LRU - Least Recently Used)
     * Cuando hay más de 6 módulos en cache, elimina el menos usado
     */
    manageCache() {
        if (this.cache.size <= this.maxCachedModules) {
            return;
        }

        const sortedByAccess = Array.from(this.cache.entries())
            .filter(([name]) => !this.activeModules.has(name))
            .map(([name, data]) => ({
                name,
                ...data,
                score: data.accessCount - ((Date.now() - data.timestamp) / 60000)
            }))
            .sort((a, b) => a.score - b.score);

        if (sortedByAccess.length > 0) {
            const toRemove = sortedByAccess[0].name;
            console.log(`🗑️ Eliminando ${toRemove} del cache (LRU)`);
            this.cache.delete(toRemove);

            const preloadLink = document.querySelector(`link[data-preload-css="${toRemove}"]`);
            if (preloadLink) {
                preloadLink.remove();
            }

            this.cssCache.delete(toRemove);
            this.jsCache.delete(toRemove);
        }
    }

    /**
     * MARCAR MÓDULO COMO ACTIVO
     * Indica que el usuario está usando este módulo
     */
    markModuleActive(moduleName) {
        this.activeModules.add(moduleName);
        this.updateUsageStats(moduleName);

        setTimeout(() => this.autoPreload(), 1000);
    }

    /**
     * MARCAR MÓDULO COMO INACTIVO
     */
    markModuleInactive(moduleName) {
        this.activeModules.delete(moduleName);
    }

    /**
     * LIMPIAR TODO EL CACHE
     */
    clearCache() {
        document.querySelectorAll('link[data-preload-css]').forEach(link => link.remove());

        this.cache.clear();
        this.htmlCache.clear();
        this.cssCache.clear();
        this.jsCache.clear();
        this.activeModules.clear();
        this.retryAttempts.clear();

        console.log('🧹 Cache de módulos limpiado completamente');
    }

    /**
     * OBTENER ESTADÍSTICAS DEL CACHE
     * Útil para debugging y monitoreo
     */
    getCacheStats() {
        return {
            cachedModules: Array.from(this.cache.keys()),
            cacheSize: this.cache.size,
            activeModules: Array.from(this.activeModules),
            recentAccess: this.moduleAccessOrder.slice(-5),
            usageStats: Object.fromEntries(this.moduleUsageStats),
            cssPreloaded: Array.from(this.cssCache.keys()),
            jsVerified: Array.from(this.jsCache.keys()),
            activePreloads: this.activePreloads,
            queueLength: this.preloadQueue.length
        };
    }
}

if (typeof window !== 'undefined') {
    window.ModulePreloader = ModulePreloader;
    window.modulePreloader = new ModulePreloader();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModulePreloader;
}
