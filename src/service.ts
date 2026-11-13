import { manifest, version } from '@parcel/service-worker';

declare const self: ServiceWorkerGlobalScope;

const install = async () => {
  const cache = await caches.open(version);
  await Promise.allSettled(manifest.map((url) => cache.add(url)));
  await self.skipWaiting();
};

self.addEventListener('install', (event) => {
  event.waitUntil(install());
});

const activate = async () => {
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => key !== version && caches.delete(key)));
  await self.clients.claim();
};

self.addEventListener('activate', (event) => {
  event.waitUntil(activate());
});

const respond = async (request: Request) => {
  const cache = await caches.open(version);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
};

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(respond(request));
});
