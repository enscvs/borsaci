"use strict";

(function () {
  var APP_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var elements = {};
  var configPromise = null;
  var sdkPromise = null;
  var currentSubscriptionId = "";

  function byId(id) {
    return document.getElementById(id);
  }

  function isAppleMobile() {
    return /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
  }

  function isStandalone() {
    return Boolean(
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true
    );
  }

  function setStatus(message, tone) {
    if (!elements.status) return;
    elements.status.textContent = message;
    elements.status.setAttribute("data-tone", tone || "neutral");
  }

  function requestJson(method, url) {
    return window.fetch(url, {
      method: method,
      credentials: "same-origin",
      cache: "no-store",
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? "{}" : undefined,
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok) throw new Error(payload.error || "İstek tamamlanamadı.");
        return payload;
      });
    });
  }

  function loadConfig() {
    if (!configPromise) {
      configPromise = requestJson("GET", "/api/push/onesignal/config");
    }
    return configPromise;
  }

  function initializeSdk(config) {
    if (sdkPromise) return sdkPromise;
    if (!config || !APP_ID_PATTERN.test(String(config.appId || ""))) {
      return Promise.reject(new Error("OneSignal App ID sunucuda yapılandırılmamış."));
    }

    sdkPromise = new Promise(function (resolve, reject) {
      var settled = false;
      var timer = window.setTimeout(function () {
        if (!settled) reject(new Error("OneSignal SDK yüklenemedi."));
      }, 15000);

      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async function (OneSignal) {
        try {
          await OneSignal.init({
            appId: config.appId,
            serviceWorkerPath: config.serviceWorkerPath,
            serviceWorkerParam: { scope: config.serviceWorkerScope },
            notifyButton: { enable: false },
            welcomeNotification: { disable: true },
            promptOptions: {
              slidedown: {
                prompts: [{ type: "push", autoPrompt: false }],
              },
            },
            autoResubscribe: true,
            notificationClickHandlerMatch: "origin",
            notificationClickHandlerAction: "navigate",
          });
          settled = true;
          window.clearTimeout(timer);
          resolve(OneSignal);
        } catch (error) {
          settled = true;
          window.clearTimeout(timer);
          reject(error);
        }
      });
    });

    return sdkPromise;
  }

  function showSubscriptionId(value) {
    currentSubscriptionId = String(value || "").trim();
    if (elements.registration) elements.registration.hidden = !currentSubscriptionId;
    if (elements.subscriptionId) elements.subscriptionId.value = currentSubscriptionId;
    if (elements.copy) elements.copy.hidden = !currentSubscriptionId;
  }

  function setSubscriptionButtons(OneSignal) {
    var optedIn = Boolean(
      OneSignal &&
      OneSignal.User &&
      OneSignal.User.PushSubscription &&
      OneSignal.User.PushSubscription.optedIn
    );
    if (elements.enable) elements.enable.hidden = optedIn;
    if (elements.disable) elements.disable.hidden = !optedIn;
  }

  function waitForSubscriptionId(OneSignal) {
    var immediate = String(OneSignal.User.PushSubscription.id || "").trim();
    if (immediate) return Promise.resolve(immediate);

    return new Promise(function (resolve, reject) {
      var timer;
      function cleanup() {
        window.clearTimeout(timer);
        OneSignal.User.PushSubscription.removeEventListener("change", onChange);
      }
      function onChange(event) {
        var value = String(event && event.current && event.current.id || "").trim();
        if (!value) return;
        cleanup();
        resolve(value);
      }
      OneSignal.User.PushSubscription.addEventListener("change", onChange);
      timer = window.setTimeout(function () {
        cleanup();
        reject(new Error("OneSignal cihaz kimliği henüz oluşmadı. Birkaç saniye sonra tekrar dene."));
      }, 15000);
    });
  }

  function refreshStatus() {
    if (!window.borsaciAuth || !window.borsaciAuth.authenticated) return Promise.resolve();

    return loadConfig()
      .then(function (config) {
        if (!config.sdkConfigured) {
          throw new Error("OneSignal App ID sunucuda yapılandırılmamış.");
        }
        if (elements.test) elements.test.hidden = !config.deliveryConfigured;
        return initializeSdk(config).then(function (OneSignal) {
          var id = String(OneSignal.User.PushSubscription.id || "").trim();
          var optedIn = Boolean(OneSignal.User.PushSubscription.optedIn);
          showSubscriptionId(id);
          setSubscriptionButtons(OneSignal);
          if (id && optedIn && config.deliveryConfigured) {
            setStatus("OneSignal cihaz kaydı hazır. Test bildirimi gönderebilirsin.", "success");
          } else if (id && optedIn) {
            setStatus("Cihaz ID hazır. Kopyalayıp Render Environment'a ONESIGNAL_ALLOWED_SUBSCRIPTION_ID olarak ekle.", "success");
          } else if (id) {
            setStatus("OneSignal bildirimleri bu cihazda kapalı.", "neutral");
          } else if (isAppleMobile() && !isStandalone()) {
            setStatus("OneSignal için PWA'yı Ana Ekrana ekleyip simgesinden aç.", "neutral");
          } else {
            setStatus("OneSignal cihaz kaydı bekliyor. İzin yalnız düğmeye dokununca istenecek.", "neutral");
          }
        });
      })
      .catch(function (error) {
        setStatus(error.message || "OneSignal durumu alınamadı.", "error");
      });
  }

  function enableOneSignal() {
    if (isAppleMobile() && !isStandalone()) {
      setStatus("Safari Paylaş menüsünden Ana Ekrana Ekle ve uygulamayı simgesinden aç.", "error");
      return;
    }

    elements.enable.disabled = true;
    setStatus("OneSignal bildirim izni bekleniyor…", "neutral");

    loadConfig()
      .then(initializeSdk)
      .then(async function (OneSignal) {
        if (!OneSignal.Notifications.isPushSupported()) {
          throw new Error("Bu cihaz OneSignal Web Push desteklemiyor.");
        }
        // Native permission prompt is triggered only inside this user click flow.
        await OneSignal.Notifications.requestPermission();
        if (!OneSignal.Notifications.permission) {
          throw new Error("Bildirim izni verilmedi.");
        }
        await OneSignal.User.PushSubscription.optIn();
        var id = await waitForSubscriptionId(OneSignal);
        showSubscriptionId(id);
        setSubscriptionButtons(OneSignal);
        return loadConfig();
      })
      .then(function (config) {
        if (elements.test) elements.test.hidden = !config.deliveryConfigured;
        setStatus(
          config.deliveryConfigured
            ? "OneSignal cihaz kaydı hazır. Test bildirimi gönderebilirsin."
            : "Cihaz ID hazır. Kopyalayıp Render Environment'a ONESIGNAL_ALLOWED_SUBSCRIPTION_ID olarak ekle.",
          "success"
        );
      })
      .catch(function (error) {
        setStatus(error.message || "OneSignal etkinleştirilemedi.", "error");
      })
      .finally(function () {
        elements.enable.disabled = false;
      });
  }

  function disableOneSignal() {
    elements.disable.disabled = true;
    setStatus("OneSignal bildirimleri kapatılıyor…", "neutral");

    loadConfig()
      .then(initializeSdk)
      .then(function (OneSignal) {
        return OneSignal.User.PushSubscription.optOut().then(function () {
          setSubscriptionButtons(OneSignal);
        });
      })
      .then(function () {
        setStatus("OneSignal bildirimleri bu cihazda kapatıldı.", "neutral");
      })
      .catch(function (error) {
        setStatus(error.message || "OneSignal bildirimleri kapatılamadı.", "error");
      })
      .finally(function () {
        elements.disable.disabled = false;
      });
  }

  function copySubscriptionId() {
    if (!currentSubscriptionId) return;
    var copyPromise = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(currentSubscriptionId)
      : Promise.reject(new Error("clipboard unavailable"));

    copyPromise.catch(function () {
      elements.subscriptionId.focus();
      elements.subscriptionId.select();
      document.execCommand("copy");
    }).then(function () {
      setStatus("OneSignal Subscription ID panoya kopyalandı.", "success");
    });
  }

  function sendTestNotification() {
    elements.test.disabled = true;
    setStatus("OneSignal test bildirimi gönderiliyor…", "neutral");
    requestJson("POST", "/api/push/onesignal/test")
      .then(function (result) {
        if (!result.delivered) throw new Error("OneSignal mesajı kabul etmedi.");
        setStatus("Test bildirimi OneSignal tarafından kabul edildi; iPhone teslimini kontrol et.", "success");
      })
      .catch(function (error) {
        setStatus(error.message || "Test bildirimi gönderilemedi.", "error");
      })
      .finally(function () {
        elements.test.disabled = false;
      });
  }

  function initialize() {
    elements.enable = byId("enableOneSignalNotifications");
    elements.disable = byId("disableOneSignalNotifications");
    elements.copy = byId("copyOneSignalSubscriptionId");
    elements.test = byId("sendOneSignalTestNotification");
    elements.status = byId("oneSignalNotificationStatus");
    elements.registration = byId("oneSignalRegistration");
    elements.subscriptionId = byId("oneSignalSubscriptionId");
    if (!elements.enable || !elements.status || !elements.subscriptionId) return;

    elements.enable.addEventListener("click", enableOneSignal);
    elements.disable.addEventListener("click", disableOneSignal);
    elements.copy.addEventListener("click", copySubscriptionId);
    elements.test.addEventListener("click", sendTestNotification);

    window.addEventListener("borsaci:auth-ready", refreshStatus);
    if (window.borsaciAuth && window.borsaciAuth.authenticated) refreshStatus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();

