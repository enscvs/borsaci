"use strict";

const ALLOWED_TABS = new Set([
  "controlTab",
  "tradingTab",
  "cryptoTab",
  "nasdaqTab",
  "terminalTab",
]);

function safeNotificationData(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  const route = ALLOWED_TABS.has(value.route) ? value.route : "controlTab";
  const fallback = `/?pushTab=${encodeURIComponent(route)}`;

  try {
    const target = new URL(String(value.url || fallback), self.location.origin);
    if (target.origin !== self.location.origin) throw new Error("cross-origin");

    const requestedTab = target.searchParams.get("pushTab");
    if (!ALLOWED_TABS.has(requestedTab)) {
      target.searchParams.set("pushTab", route);
    }

    return {
      url: `${target.pathname}${target.search}${target.hash}`,
      route,
      eventId: String(value.eventId || "").slice(0, 128),
    };
  } catch {
    return { url: fallback, route, eventId: "" };
  }
}

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  // BorsaCI finansal/API yanıtlarını önbelleğe almaz. Eski bir worker cache'i
  // kaldıysa temizlenir; ağ istekleri doğrudan sunucuya gider.
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "Yeni BorsaCI bildirimi" };
  }

  const data = safeNotificationData(payload.data);
  const title = String(payload.title || "BorsaCI").slice(0, 80);

  event.waitUntil(self.registration.showNotification(title, {
    body: String(payload.body || "Yeni BorsaCI bildirimi").slice(0, 240),
    icon: payload.icon || "/borsaci-crescent-star.png?v=2",
    badge: payload.badge || "/borsaci-crescent-star.png?v=2",
    tag: String(payload.tag || `borsaci-${data.eventId || "notification"}`).slice(0, 128),
    renotify: Boolean(payload.renotify),
    data,
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const data = safeNotificationData(event.notification.data);
  const target = new URL(data.url, self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(async windows => {
        const existing = windows.find(client => {
          try {
            return new URL(client.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });

        if (existing) {
          if (typeof existing.navigate === "function") await existing.navigate(target.href);
          return existing.focus();
        }

        return self.clients.openWindow(target.href);
      })
  );
});

