const STATIC_CACHE = 'attendance-static-v13';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/privacy',
    '/manifest.webmanifest',
    '/logo.png',
    '/assets/icons/icon-192.png',
    '/assets/icons/icon-512.png',
    '/shared/app-client.js',
    '/shared/ai-assistant.js',
    '/shared/pwa.js',
    '/renderer/login.js',
    '/renderer/forgot_password.html',
    '/renderer/forgot_password.js'
];
const NETWORK_ONLY_PATHS = new Set([
    '/login.html',
    '/shared/app-client.js',
    '/shared/pwa.js',
    '/renderer/login.js',
    '/shared/firebase.js',
    '/renderer/forgot_password.html',
    '/renderer/forgot_password.js'
]);

function shouldCache(requestUrl) {
    if (NETWORK_ONLY_PATHS.has(requestUrl.pathname)) {
        return false;
    }

    return STATIC_ASSETS.includes(requestUrl.pathname) || requestUrl.pathname.startsWith('/assets/icons/');
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys
                .filter((key) => key !== STATIC_CACHE)
                .map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    if (event.request.method !== 'GET' || requestUrl.pathname.startsWith('/api/') || !shouldCache(requestUrl)) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.ok) {
                    const cloned = response.clone();
                    caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, cloned));
                }

                return response;
            })
            .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
    );
});
