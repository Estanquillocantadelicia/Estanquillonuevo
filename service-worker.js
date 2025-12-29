// Service Worker para PWA - Sistema de Gestión Empresarial
const CACHE_NAME = 'sistema-gestion-v2';
const RUNTIME_CACHE = 'runtime-cache-v2';

// Lista de archivos críticos a cachear en instalación
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/bottom-tab-bar.css',
  '/bottom-tab-bar.js',
  '/auth-system.js',
  '/auth-styles.css',
  '/firebase-config.js',
  '/firebase-diagnostics.js',
  '/user-menu.js',
  '/user-menu.css',
  '/app-drawer.js',
  '/app-drawer.css',
  '/autorizaciones-widget.js',
  '/modules/core/icon-registry.js',
  '/modules/core/motion-utils.js',
  '/modules/core/module-preloader.js',
  '/modules/core/skeleton-screen.js',
  '/generated-icon.png'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Cacheando archivos críticos...');
      return cache.addAll(CRITICAL_ASSETS).catch((err) => {
        console.warn('⚠️ Algunos archivos no se pudieron cachear:', err);
        // No fallar la instalación si algunos archivos no se pueden cachear
      });
    }).then(() => {
      console.log('✅ Service Worker instalado correctamente');
      return self.skipWaiting();
    })
  );
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker activándose...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('🗑️ Eliminando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker activado');
      return self.clients.claim();
    })
  );
});

// Estrategia de fetch: Network First para APIs y HTML, Cache First para assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // No cachear requests de Firebase (necesita internet siempre)
  if (url.hostname.includes('firebasio.com') || 
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebaseapp.com')) {
    event.respondWith(
      fetch(request).catch(() => {
        // Si falla y es GET, intentar devolver algo del caché
        if (request.method === 'GET') {
          return caches.match(request);
        }
        return new Response('Sin conexión a Firebase', { status: 503 });
      })
    );
    return;
  }

  // NETWORK FIRST para index.html: Siempre intenta la red primero
  if (request.url.includes('index.html') || request.url.endsWith('/')) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      }).catch(() => {
        // Si falla la red, usa el caché
        return caches.match(request);
      })
    );
    return;
  }

  // Para otros archivos estáticos: Cache First, fallback Network
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Actualizar el caché en background
          fetch(request).then((response) => {
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
          }).catch(() => {
            // No hay conexión, usamos lo cacheado
          });
          return cachedResponse;
        }
        
        return fetch(request).then((response) => {
          // Cachear respuestas exitosas
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        }).catch(() => {
          // Sin conexión y sin caché
          return new Response('Contenido no disponible offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
    );
  } else {
    // Para requests no-GET (POST, PUT, DELETE), solo network
    event.respondWith(
      fetch(request).catch(() => {
        return new Response('Operación no disponible sin conexión', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
    );
  }
});

// Sincronización en background (cuando vuelva la conexión)
self.addEventListener('sync', (event) => {
  console.log('🔄 Evento de sincronización:', event.tag);
  if (event.tag === 'sync-ventas') {
    event.waitUntil(
      // Aquí podrías implementar lógica para sincronizar ventas pendientes
      Promise.resolve()
    );
  }
});

console.log('✅ Service Worker cargado correctamente');
