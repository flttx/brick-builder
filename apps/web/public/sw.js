/* global self, caches, URL, fetch */
const SHELL_CACHE = "brick-builder-shell-v3";
const ASSET_CACHE = "brick-builder-assets-v3";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.svg", "/icon-512.svg"];
const ASSET_PREFIX = "/assets/asset-pack/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname === "/assets/current.json" || url.pathname === "/assets/asset-pack/parts-index.json") {
    event.respondWith(networkFirst(request, ASSET_CACHE));
    return;
  }
  if (url.pathname.startsWith(ASSET_PREFIX) || url.pathname.startsWith("/assets/packs/") || isShellAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, url.pathname.startsWith(ASSET_PREFIX) || url.pathname.startsWith("/assets/packs/") ? ASSET_CACHE : SHELL_CACHE));
  }
});

const cacheFirst = async (request, cacheName) => {
  const cached = await caches.match(request);
  if (cached !== undefined) return cached;
  const response = await fetch(request);
  cacheResponse(request, response, cacheName);
  return response;
};

const networkFirst = async (request, cacheName) => {
  try {
    const response = await fetch(request);
    cacheResponse(request, response, cacheName);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? caches.match("./");
  }
};

const cacheResponse = (request, response, cacheName) => {
  if (!response.ok) return;
  const responseForCache = response.clone();
  void caches.open(cacheName).then((cache) => cache.put(request, responseForCache)).catch(() => undefined);
};

const isShellAsset = (pathname) => pathname.endsWith(".js") || pathname.endsWith(".css") || pathname.endsWith(".webmanifest") || pathname.endsWith(".svg");
