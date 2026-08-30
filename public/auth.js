"use strict";

(function () {
  var csrfToken = null;
  var authenticated = false;
  var nativeFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;
  var legacyMode = false;
  var legacyBound = false;

  window.borsaciAuth = {};
  Object.defineProperty(window.borsaciAuth, "authenticated", { get: function () { return authenticated; } });
  Object.defineProperty(window.borsaciAuth, "csrfToken", { get: function () { return csrfToken; } });

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

  function showLoginError(message) {
    var element = document.getElementById("authMessage");
    if (element) element.textContent = message;
  }

  function logoutButtons() {
    return toArray(document.querySelectorAll("#logoutButton, [data-logout-button]"));
  }

  function setSubmitting(submitting) {
    var button = document.getElementById("loginButton");
    if (button) {
      button.disabled = submitting;
      button.textContent = submitting ? "GİRİŞ KONTROL EDİLİYOR..." : "GİRİŞ YAP";
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

  function findParentTab(element) {
    var node = element;
    while (node && node !== document.body) {
      if (
        node.id === "controlTab" ||
        node.id === "tradingTab" ||
        node.id === "cryptoTab" ||
        node.id === "nasdaqTab" ||
        node.id === "terminalTab"
      ) return node;
      node = node.parentNode;
    }
    return null;
  }

  function setPanel(panel, visible) {
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

  function setLegacyTab(targetId) {
    var ids = ["controlTab", "tradingTab", "cryptoTab", "nasdaqTab", "terminalTab"];
    var buttons = toArray(document.querySelectorAll("#mainTabs [data-tab]"));
    var i;
    for (i = 0; i < ids.length; i += 1) {
      setPanel(document.getElementById(ids[i]), ids[i] === targetId);
    }
    for (i = 0; i < buttons.length; i += 1) {
      if (buttons[i].getAttribute("data-tab") === targetId) buttons[i].classList.add("active");
      else buttons[i].classList.remove("active");
    }
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function xhrJson(method, url, body, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    try { xhr.setRequestHeader("Cache-Control", "no-cache"); } catch (error) {}
    if (body !== null && body !== undefined) {
      xhr.setRequestHeader("Content-Type", "application/json");
      if (csrfToken && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
        xhr.setRequestHeader("X-CSRF-Token", csrfToken);
      }
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

  function renderLegacyScanner(container, data, label) {
    if (!container) return;
    var rows = data && data.results && data.results.length ? data.results : [];
    if (!rows.length) {
      container.innerHTML = "<div class=\"trading-empty\">" + escapeHtml(label) + " tamamlandı ancak sonuç dönmedi.</div>";
      return;
    }
    var html = "";
    var limit = Math.min(rows.length, 20);
    var i;
    for (i = 0; i < limit; i += 1) {
      var row = rows[i] || {};
      var symbol = row.symbol || row.ticker || row.code || "--";
      var score = row.score !== undefined ? row.score : (row.totalScore !== undefined ? row.totalScore : "--");
      var price = row.price !== undefined ? row.price : (row.lastPrice !== undefined ? row.lastPrice : "--");
      var decision = row.decision || row.signal || row.grade || "";
      html += "<div class=\"scanner-compact\"><div class=\"scanner-head\"><strong>" + escapeHtml(symbol) + "</strong><span>Skor: " + escapeHtml(score) + "</span><span>Fiyat: " + escapeHtml(price) + "</span><span>" + escapeHtml(decision) + "</span></div></div>";
    }
    container.innerHTML = html;
  }

  function bindLegacyTap(element, handler) {
    if (!element || element.getAttribute("data-inline-legacy-bound") === "true") return;
    element.setAttribute("data-inline-legacy-bound", "true");
    var lastTouch = 0;
    element.addEventListener("touchend", function (event) {
      lastTouch = new Date().getTime();
      event.preventDefault();
      event.stopPropagation();
      handler.call(element, event);
    }, true);
    element.addEventListener("click", function (event) {
      if (new Date().getTime() - lastTouch < 700) return;
      event.preventDefault();
      event.stopPropagation();
      handler.call(element, event);
    }, true);
  }

  function bindLegacyUi() {
    if (!legacyMode || legacyBound) return;
    legacyBound = true;
    document.documentElement.setAttribute("data-borsaci-legacy-inline", "true");

    var buttons = toArray(document.querySelectorAll("#mainTabs [data-tab]"));
    buttons.forEach(function (button) {
      bindLegacyTap(button, function () {
        var targetId = button.getAttribute("data-tab");
        if (targetId) setLegacyTab(targetId);
      });
    });

    var scannerButtons = toArray(document.querySelectorAll("#startScannerBtn, #startCryptoScannerBtn"));
    scannerButtons.forEach(function (button) {
      bindLegacyTap(button, function () {
        if (button.disabled) return;
        var tab = findParentTab(button);
        var tabId = tab ? tab.id : "tradingTab";
        var endpoint = "/api/trading/scanner?jobId=legacy-bist-" + new Date().getTime();
        var resultsSelector = "#scannerResults";
        var statusSelector = "#scannerStatus";
        var label = "BIST100 taraması";

        if (tabId === "cryptoTab") {
          endpoint = "/api/crypto/scanner?jobId=legacy-crypto-" + new Date().getTime();
          resultsSelector = "#cryptoScannerResults";
          statusSelector = "#cryptoScannerStatus";
          label = "Kripto taraması";
        } else if (tabId === "nasdaqTab") {
          endpoint = "/api/nasdaq/scanner?jobId=legacy-nasdaq-" + new Date().getTime();
          label = "NASDAQ taraması";
        }

        var results = tab && tab.querySelector ? tab.querySelector(resultsSelector) : document.querySelector(resultsSelector);
        var status = tab && tab.querySelector ? tab.querySelector(statusSelector) : document.querySelector(statusSelector);

        button.disabled = true;
        button.textContent = "TARANIYOR...";
        if (status) status.textContent = "TARANIYOR";
        if (results) results.innerHTML = "<div class=\"trading-empty\">" + escapeHtml(label) + " çalışıyor...</div>";

        xhrJson("GET", endpoint, null, function (error, httpStatus, data) {
          button.disabled = false;
          button.textContent = "TARAMAYI BAŞLAT";
          if (error || httpStatus < 200 || httpStatus >= 300 || (data && data.success === false)) {
            if (status) status.textContent = "HATA";
            if (results) results.innerHTML = "<div class=\"trading-empty\">Tarama hatası: " + escapeHtml(data && data.error ? data.error : "Sunucu isteği başarısız") + "</div>";
            return;
          }
          if (status) status.textContent = "TAMAMLANDI";
          renderLegacyScanner(results, data, label);
        });
      });
    });

    setLegacyTab("tradingTab");
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
    bindLegacyUi();
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
      if (sameOrigin && method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && csrfToken) headers.set("X-CSRF-Token", csrfToken);
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
  logoutButtonList.forEach(function (logoutButton) { logoutButton.addEventListener("click", logout, false); });

  checkSession();
})();