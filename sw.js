/* Network-first for SVGs only; limited, best-effort cache, no precaching. */
const CACHE = 'deckplan-graphics-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('deckplan-graphics-') && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !/^\/assets\/(db|sbb)-ic2-class-[12]-(side|deck-top|deck-bottom)\.svg$/.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        await cache.put(event.request, response.clone()).catch(() => {});
        const clients = await self.clients.matchAll();
        for (const client of clients) client.postMessage({type:'GRAPHICS_UPDATED'});
      }
      return response;
    } catch (error) {
      const cached = await cache.match(event.request, {ignoreSearch:true});
      if (cached) return cached;
      throw error;
    }
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'REFRESH_GRAPHICS') return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const keys = await cache.keys();
    await Promise.all(keys.map(async request => {
      try {const response = await fetch(request, {cache:'no-cache'}); if(response.ok) await cache.put(request,response);} catch {}
    }));
    const clients = await self.clients.matchAll();
    for (const client of clients) client.postMessage({type:'GRAPHICS_UPDATED'});
  })());
});
