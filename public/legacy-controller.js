"use strict";

(function () {
  var lastTouchAt = 0;

  function toArray(list) {
    return Array.prototype.slice.call(list || []);
  }

  function installLegacyCss() {
    if (document.getElementById("borsaciLegacyCss")) return;
    var style = document.createElement("style");
    style.id = "borsaciLegacyCss";
    style.type = "text/css";
    style.appendChild(document.createTextNode(
      "[hidden]{display:none!important;}" +
      "#authScreen[hidden]{display:none!important;pointer-events:none!important;}" +
      "html[data-borsaci-legacy='true'] #mainTabs .main-tab{cursor:pointer;-webkit-tap-highlight-color:rgba(72,255,104,.18);}" +
      "html[data-borsaci-legacy='true'] #mainTabs{position:relative;z-index:1001;}"
    ));
    document.head.appendChild(style);
  }

  function findParentTabElement(element) {
    var node = element;
    while (node && node !== document.body) {
      if (
        node.id === "tradingTab" ||
        node.id === "cryptoTab" ||
        node.id === "nasdaqTab" ||
        node.id === "controlTab" ||
        node.id === "terminalTab"
      ) return node;
      node = node.parentNode;
    }
    return null;
  }

  function setPanelVisible(panel, visible) {
    if (!panel) return;
    if (visible) {
      panel.removeAttribute("hidden");
      panel.style.setProperty("display", panel.id === "controlTab" ? "grid" : "block", "important");
      panel.style.setProperty("visibility", "visible", "important");
      panel.style.setProperty("pointer-events", "auto", "important");
    } else {
      panel.setAttribute("hidden", "hidden");
      panel.style.setProperty("display", "none", "important");
      panel.style.setProperty("visibility", "hidden", "important");
      panel.style.setProperty("pointer-events", "none", "important");
    }
  }

  function setTab(targetId) {
    var ids = ["controlTab", "tradingTab", "cryptoTab", "nasdaqTab", "terminalTab"];
    var i;
    for (i = 0; i < ids.length; i += 1) {
      setPanelVisible(document.getElementById(ids[i]), ids[i] === targetId);
    }

    var buttons = toArray(document.querySelectorAll("#mainTabs [data-tab]"));
    for (i = 0; i < buttons.length; i += 1) {
      if (buttons[i].getAttribute("data-tab") === targetId) buttons[i].classList.add("active");
      else buttons[i].classList.remove("active");
    }
  }

  function bindTap(element, handler, marker) {
    if (!element || element.getAttribute(marker) === "true") return;
    element.setAttribute(marker, "true");

    element.addEventListener("touchend", function (event) {
      lastTouchAt = new Date().getTime();
      if (event && event.preventDefault) event.preventDefault();
      if (event && event.stopPropagation) event.stopPropagation();
      handler.call(element, event);
    }, true);

    element.addEventListener("click", function (event) {
      if (new Date().getTime() - lastTouchAt < 700) return;
      if (event && event.preventDefault) event.preventDefault();
      if (event && event.stopPropagation) event.stopPropagation();
      handler.call(element, event);
    }, true);
  }

  function bindTabs() {
    var buttons = toArray(document.querySelectorAll("#mainTabs [data-tab]"));
    var i;
    for (i = 0; i < buttons.length; i += 1) {
      bindTap(buttons[i], function () {
        var targetId = this.getAttribute("data-tab");
        if (targetId) setTab(targetId);
      }, "data-legacy-bound-v3");
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

  function requestJson(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Cache-Control", "no-cache");
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var data = {};
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch (error) { data = {}; }
      callback(xhr.status, data);
    };
    xhr.onerror = function () { callback(0, {}); };
    xhr.send(null);
  }

  function renderScannerRows(container, data, label) {
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

  function scannerConfig(button) {
    var tab = findParentTabElement(button);
    var tabId = tab ? tab.id : "";
    if (tabId === "cryptoTab") return { tab: tab, endpoint: "/api/crypto/scanner?jobId=legacy-crypto-" + new Date().getTime(), resultsSelector: "#cryptoScannerResults", statusSelector: "#cryptoScannerStatus", label: "Kripto taraması" };
    if (tabId === "nasdaqTab") return { tab: tab, endpoint: "/api/nasdaq/scanner?jobId=legacy-nasdaq-" + new Date().getTime(), resultsSelector: "#scannerResults", statusSelector: "#scannerStatus", label: "NASDAQ taraması" };
    return { tab: tab, endpoint: "/api/trading/scanner?jobId=legacy-bist-" + new Date().getTime(), resultsSelector: "#scannerResults", statusSelector: "#scannerStatus", label: "BIST100 taraması" };
  }

  function queryInside(tab, selector) {
    if (tab && tab.querySelector) {
      var local = tab.querySelector(selector);
      if (local) return local;
    }
    return document.querySelector(selector);
  }

  function runScanner(button) {
    if (!button || button.disabled) return;
    var config = scannerConfig(button);
    var results = queryInside(config.tab, config.resultsSelector);
    var status = queryInside(config.tab, config.statusSelector);

    button.disabled = true;
    button.textContent = "TARANIYOR...";
    if (status) status.textContent = "TARANIYOR";
    if (results) results.innerHTML = "<div class=\"trading-empty\">" + escapeHtml(config.label) + " çalışıyor...</div>";

    requestJson(config.endpoint, function (httpStatus, data) {
      button.disabled = false;
      button.textContent = "TARAMAYI BAŞLAT";
      if (httpStatus < 200 || httpStatus >= 300 || (data && data.success === false)) {
        if (status) status.textContent = "HATA";
        if (results) results.innerHTML = "<div class=\"trading-empty\">Tarama hatası: " + escapeHtml(data && data.error ? data.error : "Sunucu isteği başarısız") + "</div>";
        return;
      }
      if (status) status.textContent = "TAMAMLANDI";
      renderScannerRows(results, data, config.label);
    });
  }

  function bindScanners() {
    var buttons = toArray(document.querySelectorAll("#startScannerBtn, #startCryptoScannerBtn"));
    var i;
    for (i = 0; i < buttons.length; i += 1) {
      bindTap(buttons[i], function () { runScanner(this); }, "data-legacy-scanner-bound-v3");
    }
  }

  function init() {
    document.documentElement.setAttribute("data-borsaci-legacy", "true");
    installLegacyCss();

    var authScreen = document.getElementById("authScreen");
    if (window.borsaciAuth && window.borsaciAuth.authenticated && authScreen) {
      authScreen.setAttribute("hidden", "hidden");
      authScreen.style.setProperty("display", "none", "important");
      authScreen.style.setProperty("pointer-events", "none", "important");
    }

    bindTabs();
    bindScanners();
    setTab("tradingTab");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, false);
  else init();

  window.addEventListener("borsaci:auth-ready", init, false);
})();
