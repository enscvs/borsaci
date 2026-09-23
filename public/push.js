"use strict";

(function () {
  var ALLOWED_TABS = ["controlTab", "tradingTab", "cryptoTab", "nasdaqTab", "terminalTab"];
  var elements = {};
  var registrationPromise = null;
  var publicKey = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function isStandalone() {
    return Boolean(
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true
    );
  }

  function supported() {
    return Boolean(
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
  }

  function setStatus(message, tone) {
    if (!elements.status) return;
    elements.status.textContent = message;
    elements.status.setAttribute("data-tone", tone || "neutral");
  }

  function setButtons(subscription) {
    if (elements.enable) elements.enable.hidden = Boolean(subscription);
    if (elements.disable) elements.disable.hidden = !subscription;
  }

  function urlBase64ToUint8Array(value) {
    var padding = "=".repeat((4 - value.length % 4) % 4);
    var base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = window.atob(base64);
    return Uint8Array.from(raw, function (character) { return character.charCodeAt(0); });
  }

  function requestJson(method, url, body) {
    return window.fetch(url, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok) throw new Error(payload.error || "İstek tamamlanamadı.");
        return payload;
      });
    });
  }

  function registerWorker() {
    if (!supported()) return Promise.reject(new Error("Bu cihaz Web Push desteklemiyor."));
    if (!registrationPromise) {
      registrationPromise = navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then(function () { return navigator.serviceWorker.ready; });
    }
    return registrationPromise;
  }

  function applyPushRoute() {
    if (!window.borsaciAuth || !window.borsaciAuth.authenticated) return;

    var params = new URLSearchParams(window.location.search);
    var target = params.get("pushTab");
    if (ALLOWED_TABS.indexOf(target) < 0) return;

    var button = document.querySelector('.main-tab[data-tab="' + target + '"]');
    if (button) button.click();

    params.delete("pushTab");
    params.delete("pushEvent");
    var nextQuery = params.toString();
    window.history.replaceState({}, document.title, window.location.pathname + (nextQuery ? "?" + nextQuery : "") + window.location.hash);
  }

  function schedulePushRoute() {
    // index.html sekme bağlayıcısının aynı DOMContentLoaded turunu
    // tamamlamasına izin ver; ardından allowlist'teki hedefe tıkla.
    window.setTimeout(applyPushRoute, 0);
  }

  function refreshStatus() {
    if (!window.borsaciAuth || !window.borsaciAuth.authenticated) return Promise.resolve();

    if (!supported()) {
      setButtons(null);
      setStatus("Bu iPhone sürümü Web Push desteklemiyor. iOS 16.4 veya yenisi gerekir.", "error");
      return Promise.resolve();
    }

    return Promise.all([
      requestJson("GET", "/api/push/config", null),
      registerWorker().then(function (registration) { return registration.pushManager.getSubscription(); }),
    ]).then(function (values) {
      var config = values[0];
      var subscription = values[1];
      publicKey = config.publicKey;
      setButtons(subscription);

      if (!config.configured) {
        setStatus("Sunucuda Web Push yapılandırması tamamlanmamış.", "error");
      } else if (subscription && Notification.permission === "granted") {
        setStatus("Bildirimler bu cihazda etkin.", "success");
      } else if (!isStandalone() && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        setStatus("Önce Safari Paylaş menüsünden Ana Ekrana Ekle, sonra uygulama simgesinden aç.", "neutral");
      } else if (Notification.permission === "denied") {
        setStatus("Bildirim izni kapalı. iPhone Ayarlar bölümünden izin ver.", "error");
      } else {
        setStatus("Bildirimler kapalı.", "neutral");
      }
    }).catch(function (error) {
      setStatus(error.message || "Bildirim durumu alınamadı.", "error");
    });
  }

  function enableNotifications() {
    if (!supported()) {
      setStatus("Bu cihaz Web Push desteklemiyor.", "error");
      return;
    }

    if (!isStandalone() && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      setStatus("Safari Paylaş menüsünden Ana Ekrana Ekle ve uygulamayı simgesinden aç.", "error");
      return;
    }

    if (!publicKey) {
      setStatus("Sunucu bildirim anahtarı hazır değil.", "error");
      return;
    }

    elements.enable.disabled = true;
    setStatus("Bildirim izni bekleniyor…", "neutral");

    // İzin isteme yalnız bu kullanıcı tıklaması içinde yapılır.
    Promise.resolve(Notification.requestPermission())
      .then(function (permission) {
        if (permission !== "granted") throw new Error("Bildirim izni verilmedi.");
        return registerWorker();
      })
      .then(function (registration) {
        return registration.pushManager.getSubscription().then(function (existing) {
          if (existing) return existing;
          return registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        });
      })
      .then(function (subscription) {
        return requestJson("POST", "/api/push/subscribe", { subscription: subscription.toJSON() })
          .then(function () { return subscription; });
      })
      .then(function (subscription) {
        setButtons(subscription);
        setStatus("Bildirimler bu cihazda etkin.", "success");
      })
      .catch(function (error) {
        setStatus(error.message || "Bildirimler etkinleştirilemedi.", "error");
      })
      .finally(function () {
        elements.enable.disabled = false;
      });
  }

  function disableNotifications() {
    elements.disable.disabled = true;
    setStatus("Bildirim aboneliği kapatılıyor…", "neutral");

    registerWorker()
      .then(function (registration) { return registration.pushManager.getSubscription(); })
      .then(function (subscription) {
        if (!subscription) return null;
        return requestJson("POST", "/api/push/unsubscribe", { endpoint: subscription.endpoint })
          .then(function () { return subscription.unsubscribe(); });
      })
      .then(function () {
        setButtons(null);
        setStatus("Bildirimler kapatıldı.", "neutral");
      })
      .catch(function (error) {
        setStatus(error.message || "Bildirimler kapatılamadı.", "error");
      })
      .finally(function () {
        elements.disable.disabled = false;
      });
  }

  function initialize() {
    elements.status = byId("pushNotificationStatus");
    elements.enable = byId("enablePushNotifications");
    elements.disable = byId("disablePushNotifications");

    if (!elements.status || !elements.enable || !elements.disable) return;

    elements.enable.addEventListener("click", enableNotifications);
    elements.disable.addEventListener("click", disableNotifications);
    registerWorker().catch(function () {});

    window.addEventListener("borsaci:auth-ready", function () {
      schedulePushRoute();
      refreshStatus();
    });

    if (window.borsaciAuth && window.borsaciAuth.authenticated) {
      schedulePushRoute();
      refreshStatus();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();

