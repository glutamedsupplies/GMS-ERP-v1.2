const STATIC_CACHE = 'attendance-static-v14';
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
    '/renderer/customer_portal.html',
    '/renderer/customer_portal.js',
    '/renderer/forgot_password.html',
    '/renderer/forgot_password.js'
];
const NETWORK_ONLY_PATHS = new Set([
    '/login.html',
    '/shared/app-client.js',
    '/shared/pwa.js',
    '/renderer/login.js',
    '/shared/firebase.js'
]);

const DOCUMENT_CACHE_FALLBACKS = new Map([
    ['/renderer/customer_portal.html', '/renderer/customer_portal.html'],
    ['/renderer/forgot_password.html', '/renderer/forgot_password.html'],
    ['/login.html', '/login.html'],
    ['/index.html', '/index.html'],
    ['/', '/index.html']
]);

function shouldCache(requestUrl) {
    if (NETWORK_ONLY_PATHS.has(requestUrl.pathname)) {
        return false;
    }

    return STATIC_ASSETS.includes(requestUrl.pathname) || requestUrl.pathname.startsWith('/assets/icons/');
}

function isDocumentRequest(request) {
    return request.mode === 'navigate' || request.destination === 'document';
}

async function findCachedResponse(request, requestUrl) {
    const directMatch = await caches.match(request, { ignoreSearch: true });
    if (directMatch) {
        return directMatch;
    }

    const pathMatch = await caches.match(requestUrl.pathname, { ignoreSearch: true });
    if (pathMatch) {
        return pathMatch;
    }

    const fallbackPath = DOCUMENT_CACHE_FALLBACKS.get(requestUrl.pathname);
    if (fallbackPath) {
        return caches.match(fallbackPath);
    }

    return null;
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
                    caches.open(STATIC_CACHE).then((cache) => cache.put(requestUrl.pathname, cloned));
                }

                return response;
            })
            .catch(async () => {
                const cached = await findCachedResponse(event.request, requestUrl);
                if (cached) {
                    return cached;
                }

                if (isDocumentRequest(event.request)) {
                    return caches.match('/login.html');
                }

                throw new Error(`No cached response for ${requestUrl.pathname}`);
            })
    );
});
