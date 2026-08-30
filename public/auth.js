"use strict";

(function () {
  var csrfToken = null;
  var authenticated = false;
  var nativeFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;
  var legacyMode = false;
  var legacyTabsBound = false;
  var debugLines = [];

  window.borsaciAuth = {};
  Object.defineProperty(window.borsaciAuth, "authenticated", {
    get: function () { return authenticated; }
  });
  Object.defineProperty(window.borsaciAuth, "csrfToken", {
    get: function () { return csrfToken; }
  });

  function detectLegacy() {
    try {
      new Function("var x = {}; return x?.a;");
      return false;
    } catch (error) {
      return true;
    }
  }

  legacyMode = detectLegacy();

  function toArray(list) {
    return Array.prototype.slice.call(list || []);
  }

  function debugBox() {
    if (!legacyMode) return null;
    var box = document.getElementById("legacyDebugBox");
    if (box) return box;
    box = document.createElement("div");
    box.id = "legacyDebugBox";
    box.style.position = "fixed";
    box.style.left = "4px";
    box.style.right = "4px";
    box.style.bottom = "4px";
    box.style.zIndex = "2147483647";
    box.style.maxHeight = "42vh";
    box.style.overflow = "auto";
    box.style.padding = "8px";
    box.style.border = "1px solid #ff5555";
    box.style.background = "rgba(20,0,0,.96)";
    box.style.color = "#ffb0b0";
    box.style.font = "10px/1.35 monospace";
    box.style.whiteSpace = "pre-wrap";
    box.style.wordBreak = "break-word";
    if (document.body) document.body.appendChild(box);
    return box;
  }

  function debug(message) {
    if (!legacyMode) return;
    debugLines.push(String(message || ""));
    if (debugLines.length > 14) debugLines.shift();
    var box = debugBox();
    if (box) box.textContent = "LEGACY DEBUG\n" + debugLines.join("\n");
  }

  window.borsaciLegacyDebug = debug;

  if (legacyMode) {
    window.onerror = function (message, source, lineno, colno, error) {
      var details = "JS ERROR: " + String(message || (error && error.message) || "unknown");
      if (source) details += "\n" + source;
      if (lineno) details += ":" + lineno + (colno ? ":" + colno : "");
      debug(details);
      return false;
    };

    if (window.addEventListener) {
      window.addEventListener("unhandledrejection", function (event) {
        var reason = event && event.reason;
        debug("PROMISE ERROR: " + String(reason && reason.message ? reason.message : reason || "unknown"));
      }, false);
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        debug("AUTH LEGACY: OK");
      }, false);
    } else {
      debug("AUTH LEGACY: OK");
    }
  }

  function showLoginError(message) {
    var element = document.getElementById("authMessage");
    if (element) element.textContent = message;
  }

  function logoutButtons() {
    return toArray(document.querySelectorAll("#logoutButton, [data-logout-button]"));
  }

  function setSubmitting(submitting) {
    var button = document.getElementById("loginButton");
    if (!button) return;
    button.disabled = submitting;
    button.textContent = submitting ? "GİRİŞ KONTROL EDİLİYOR..." : "GİRİŞ YAP";
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
    debug("AUTH READY: DISPATCHED");
  }

  function setLegacyPanel(panel, visible) {
    if (!panel) return;
    if (visible) {
      panel.hidden = false;
      panel.removeAttribute("hidden");
      panel.style.setProperty("display", "block", "important");
      panel.style.setProperty("visibility", "visible", "important");
      panel.style.setProperty("pointer-events", "auto", "important");
    } else {
      panel.hidden = true;
      panel.setAttribute("hidden", "hidden");
      panel.style.setProperty("display", "none", "important");
      panel.style.setProperty("visibility", "hidden", "important");
      panel.style.setProperty("pointer-events", "none", "important");
    }
  }

  function activateLegacyTab(targetId) {
    var ids = ["controlTab", "tradingTab", "cryptoTab", "nasdaqTab", "terminalTab"];
    var buttons = toArray(document.querySelectorAll("#mainTabs [data-tab]"));
    var i;
    for (i = 0; i < ids.length; i += 1) {
      setLegacyPanel(document.getElementById(ids[i]), ids[i] === targetId);
    }
    for (i = 0; i < buttons.length; i += 1) {
      if (buttons[i].getAttribute("data-tab") === targetId) buttons[i].classList.add("active");
      else buttons[i].classList.remove("active");
    }
  }

  function bindLegacyTabs() {
    if (!legacyMode || legacyTabsBound) return;
    legacyTabsBound = true;
    var buttons = toArray(document.querySelectorAll("#mainTabs [data-tab]"));
    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        var targetId = button.getAttribute("data-tab");
        if (targetId) activateLegacyTab(targetId);
      }, false);
    });
    activateLegacyTab("tradingTab");
    debug("LEGACY TABS: BOUND");
  }

  function xhrJson(method, url, body, callback) {
    var xhr = new XMLHttpRequest();
    var upperMethod = String(method || "GET").toUpperCase();
    xhr.open(upperMethod, url, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    try { xhr.setRequestHeader("Cache-Control", "no-cache"); } catch (error) {}
    if (body !== null && body !== undefined) {
      xhr.setRequestHeader("Content-Type", "application/json");
    }
    if (csrfToken && upperMethod !== "GET" && upperMethod !== "HEAD" && upperMethod !== "OPTIONS") {
      xhr.setRequestHeader("X-CSRF-Token", csrfToken);
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var payload = {};
      try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch (error) { payload = {}; }
      callback(null, xhr.status, payload);
    };
    xhr.onerror = function () { callback(new Error("Network error"), 0, {}); };
    xhr.send(body !== null && body !== undefined ? JSON.stringify(body) : null);
  }

  function activate(session) {
    authenticated = true;
    csrfToken = session && session.csrfToken ? session.csrfToken : null;
    var screen = document.getElementById("authScreen");
    var app = document.getElementById("appShell");

    if (screen) {
      screen.hidden = true;
      screen.style.setProperty("display", "none", "important");
      screen.style.setProperty("visibility", "hidden", "important");
      screen.style.setProperty("pointer-events", "none", "important");
    }
    if (app) {
      app.hidden = false;
      app.removeAttribute("hidden");
      app.style.setProperty("display", "block", "important");
      app.style.setProperty("visibility", "visible", "important");
      app.style.setProperty("pointer-events", "auto", "important");
    }

    logoutButtons().forEach(function (button) { button.hidden = false; });
    showLoginError("");
    bindLegacyTabs();
    debug("SESSION: AUTHENTICATED");
    dispatchAuthReady();
  }

  function deactivate(message) {
    authenticated = false;
    csrfToken = null;
    var screen = document.getElementById("authScreen");
    var app = document.getElementById("appShell");

    if (app) {
      app.hidden = true;
      app.style.setProperty("display", "none", "important");
      app.style.setProperty("pointer-events", "none", "important");
    }
    logoutButtons().forEach(function (button) { button.hidden = true; });
    if (screen) {
      screen.hidden = false;
      screen.removeAttribute("hidden");
      screen.style.setProperty("display", "flex", "important");
      screen.style.setProperty("visibility", "visible", "important");
      screen.style.setProperty("pointer-events", "auto", "important");
    }
    showLoginError(message || "");
  }

  if (nativeFetch) {
    window.fetch = function (input, init) {
      init = init || {};
      var inputUrl = typeof input === "string" ? input : input.url;
      var requestUrl = document.createElement("a");
      requestUrl.href = inputUrl;
      var method = String(init.method || (typeof input === "string" ? "GET" : input.method) || "GET").toUpperCase();
      var sameOrigin = requestUrl.protocol === window.location.protocol && requestUrl.host === window.location.host;
      var headers = new Headers(init.headers || (typeof input === "string" ? undefined : input.headers));
      if (sameOrigin && method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && csrfToken) {
        headers.set("X-CSRF-Token", csrfToken);
      }
      var nextInit = {};
      Object.keys(init).forEach(function (key) { nextInit[key] = init[key]; });
      nextInit.headers = headers;
      nextInit.credentials = "same-origin";
      return nativeFetch(input, nextInit).then(function (response) {
        if (sameOrigin && response.status === 401 && requestUrl.pathname.indexOf("/api/") === 0 && requestUrl.pathname.indexOf("/api/auth/") !== 0) {
          deactivate("Oturum süresi doldu. Lütfen tekrar giriş yapın.");
        }
        return response;
      });
    };
  }

  function checkSession() {
    xhrJson("GET", "/api/auth/session?ts=" + new Date().getTime(), null, function (error, status, session) {
      if (error || status < 200 || status >= 300) {
        deactivate(error ? "Oturum kontrol edilemedi. Lütfen tekrar deneyin." : "");
        return;
      }
      if (session && session.authenticated) activate(session);
      else deactivate();
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
      xhrJson("GET", "/api/auth/session?ts=" + new Date().getTime(), null, function (verifyError, verifyStatus, session) {
        if (verifyError || verifyStatus < 200 || verifyStatus >= 300 || !session || !session.authenticated) {
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
  if (form) form.addEventListener("submit", login, false);
  logoutButtonList.forEach(function (logoutButton) {
    logoutButton.addEventListener("click", logout, false);
  });

  checkSession();
})();
