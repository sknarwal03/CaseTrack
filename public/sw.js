const CACHE_VERSION = "casetrack-shell-v1";
const APP_BASE = "/CaseTrack/";
const SHELL = [
  APP_BASE,
  `${APP_BASE}index.html`,
  `${APP_BASE}pages/login.html`,
  `${APP_BASE}manifest.webmanifest`,
  `${APP_BASE}icons/icon.svg`
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("casetrack-") && key !== CACHE_VERSION).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(APP_BASE)) return;
  // Keep authenticated pages and all application data out of persistent caches.
  if (url.pathname.includes("/pages/") && !url.pathname.endsWith("/login.html")) return;
  if (url.pathname.includes("/firestore/") || url.pathname.includes("/identitytoolkit/") || url.pathname.includes("/securetoken/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      if (response.ok && url.pathname.endsWith("/login.html")) {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match(`${APP_BASE}index.html`))));
    return;
  }

  if (url.pathname.includes("/assets/")) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
      }
      return response;
    })));
  }
});
