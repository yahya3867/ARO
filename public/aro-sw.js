/* Application shell only. Operational API responses and mutations are never cached. */
const CACHE = "aro-offline-shell-v3";
const PAGES = ["/canvas", "/board", "/audit", "/", "/icon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await cache.addAll(PAGES);
    const assets = new Set();
    for (const page of PAGES.filter(page => page !== "/icon.svg")) {
      const html = await (await cache.match(page)).text();
      for (const match of html.matchAll(/(?:src|href)="([^" ]+)"/g))
        if (match[1].startsWith("/_next/static/")) assets.add(new URL(match[1], self.location.origin).href);
    }
    await Promise.all([...assets].map(async url => {
      const response = await fetch(url);
      if (!response.ok) throw Error("Offline asset installation failed");
      await cache.put(url, response.clone());
      if (url.endsWith(".css")) {
        const css = await response.text();
        await Promise.all([...css.matchAll(/url\(["']?([^)'" ]+)["']?\)/g)].map(async match => {
          const font = new URL(match[1], url);
          if (font.origin === self.location.origin && font.pathname.startsWith("/_next/static/")) await cache.add(font.href);
        }));
      }
    }));
  }).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("aro-offline-shell-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("message", event => {
  if (event.data === "ARO_SHELL_STATUS") event.waitUntil(caches.open(CACHE).then(async cache => {
    const ready = (await Promise.all(PAGES.map(page => cache.match(page)))).every(Boolean);
    event.ports[0]?.postMessage(ready ? "ARO_SHELL_READY" : "ARO_SHELL_MISSING");
  }));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate" && PAGES.includes(url.pathname) && url.pathname !== "/icon.svg") {
    event.respondWith(fetch(request).then(async response => {
      if (response.ok) { const cache = await caches.open(CACHE); await cache.put(url.pathname, response.clone()); }
      if (!response.ok) throw Error("Server unavailable");
      return response;
    }).catch(async () => (await caches.match(url.pathname)) || (url.pathname !== "/" && await caches.match("/canvas")) || Response.error()));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(async response => {
      if (response.ok) { const cache = await caches.open(CACHE); await cache.put(request, response.clone()); }
      return response;
    })));
  }
});
