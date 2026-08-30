"use strict";

(function () {
  var csrfToken = null;
  var authenticated = false;
  var nativeFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;
  var legacyControllerRequested = false;

  window.borsaciAuth = {};
  Object.defineProperty(window.borsaciAuth, "authenticated", {
    get: function () { return authenticated; }
  });
  Object.defineProperty(window.borsaciAuth, "csrfToken", {
    get: function () { return csrfToken; }
  });

  function isLegacyIPhone() {
    var ua = String(navigator.userAgent || "");
    return /iPhone|iPod/.test(ua) && /OS (?:8|9|10)_/.test(ua);
  }

  function loadLegacyController() {
    if (!isLegacyIPhone() || legacyControllerRequested) return;
    legacyControllerRequested = true;
    var script = document.createElement("script");
    script.src = "/legacy-controller.js?v=20260830-iphone5";
    script.async = false;
    document.head.appendChild(script);
  }

  function showLoginError(message) {
    var element = document.getElementById("authMessage");
    if (element) element.textContent = message;
  }

  function logoutButtons() {
    return Array.prototype.slice.call(
      document.querySelectorAll("#logoutButton, [data-logout-button]")
    );
  }

  function setSubmitting(submitting) {
    var button = document.getElementById("loginButton");
    if (button) {
      button.disabled = submitting;
      button.textContent = submitting
        ? "GİRİŞ KONTROL EDİLİYOR..."
        : "GİRİŞ YAP";
    }
  }

  function dispatchAuthReady() {
    var event;
    try {
      event = new Event("borsaci:auth-ready");
    } catch (error) {
      event = document.createEvent("Event");
      event.initEvent("borsaci:auth-ready", true, true);
    }
    window.dispatchEvent(event);
  }

  function activate(session) {
    authenticated = true;
    csrfToken = session && session.csrfToken ? session.csrfToken : null;

    var screen = document.getElementById("authScreen");
    var app = document.getElementById("appShell");

    if (screen) screen.hidden = true;
    if (app) app.hidden = false;

    logoutButtons().forEach(function (button) {
      button.hidden = false;
    });

    showLoginError("");
    loadLegacyController();
    dispatchAuthReady();
  }

  function deactivate(message) {
    authenticated = false;
    csrfToken = null;

    var screen = document.getElementById("authScreen");
    var app = document.getElementById("appShell");

    if (app) app.hidden = true;
    logoutButtons().forEach(function (button) {
      button.hidden = true;
    });
    if (screen) screen.hidden = false;

    showLoginError(message || "");
  }

  function xhrJson(method, url, body, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");

    if (body !== null && body !== undefined) {
      xhr.setRequestHeader("Content-Type", "application/json");
    }

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;

      var payload = {};
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch (error) {
        payload = {};
      }

      callback(null, xhr.status, payload);
    };

    xhr.onerror = function () {
      callback(new Error("Network error"), 0, {});
    };

    xhr.send(body !== null && body !== undefined ? JSON.stringify(body) : null);
  }

  if (nativeFetch) {
    window.fetch = function (input, init) {
      init = init || {};

      var inputUrl = typeof input === "string" ? input : input.url;
      var requestUrl = document.createElement("a");
      requestUrl.href = inputUrl;

      var method = String(
        init.method || (typeof input === "string" ? "GET" : input.method) || "GET"
      ).toUpperCase();

      var sameOrigin =
        requestUrl.protocol === window.location.protocol &&
        requestUrl.host === window.location.host;

      var headers = new Headers(
        init.headers || (typeof input === "string" ? undefined : input.headers)
      );

      if (
        sameOrigin &&
        method !== "GET" &&
        method !== "HEAD" &&
        method !== "OPTIONS" &&
        csrfToken
      ) {
        headers.set("X-CSRF-Token", csrfToken);
      }

      var nextInit = {};
      Object.keys(init).forEach(function (key) {
        nextInit[key] = init[key];
      });
      nextInit.headers = headers;
      nextInit.credentials = "same-origin";

      return nativeFetch(input, nextInit).then(function (response) {
        if (
          sameOrigin &&
          response.status === 401 &&
          requestUrl.pathname.indexOf("/api/") === 0 &&
          requestUrl.pathname.indexOf("/api/auth/") !== 0
        ) {
          deactivate("Oturum süresi doldu. Lütfen tekrar giriş yapın.");
        }
        return response;
      });
    };
  }

  function checkSession() {
    xhrJson("GET", "/api/auth/session", null, function (error, status, session) {
      if (error || status < 200 || status >= 300) {
        deactivate(error ? "Oturum kontrol edilemedi. Lütfen tekrar deneyin." : "");
        return;
      }

      if (session && session.authenticated) {
        activate(session);
      } else {
        deactivate();
      }
    });
  }

  function login(event) {
    event.preventDefault();

    var passwordInput = document.getElementById("loginPassword");
    var password = String(passwordInput && passwordInput.value ? passwordInput.value : "");

    if (!password) {
      showLoginError("Şifrenizi girin.");
      return;
    }

    setSubmitting(true);
    showLoginError("");

    xhrJson("POST", "/api/auth/login", { password: password }, function (error, status, payload) {
      setSubmitting(false);

      if (error || status < 200 || status >= 300 || !payload.authenticated) {
        showLoginError("Giriş bilgileri doğrulanamadı.");
        return;
      }

      if (passwordInput) passwordInput.value = "";

      xhrJson("GET", "/api/auth/session", null, function (verifyError, verifyStatus, session) {
        if (
          verifyError ||
          verifyStatus < 200 ||
          verifyStatus >= 300 ||
          !session ||
          !session.authenticated
        ) {
          deactivate("Giriş başarılı ancak oturum kaydedilemedi. Uygulamayı kapatıp tekrar deneyin.");
          return;
        }

        activate(session);
      });
    });
  }

  function logout() {
    xhrJson("POST", "/api/auth/logout", null, function () {
      deactivate("Çıkış yapıldı.");
    });
  }

  var form = document.getElementById("loginForm");
  var logoutButtonList = logoutButtons();

  if (form) {
    form.addEventListener("submit", login, false);
  }

  logoutButtonList.forEach(function (logoutButton) {
    logoutButton.addEventListener("click", logout, false);
  });

  checkSession();
})();
