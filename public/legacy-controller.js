"use strict";

(function () {
  function toArray(list) {
    return Array.prototype.slice.call(list || []);
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
      ) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  function setPanelVisible(panel, visible) {
    if (!panel) return;
    if (visible) {
      panel.removeAttribute("hidden");
      panel.style.setProperty("display", "block", "important");
    } else {
      panel.setAttribute("hidden", "hidden");
      panel.style.setProperty("display", "none", "important");
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
      var active = buttons[i].getAttribute("data-tab") === targetId;
      if (active) buttons[i].classList.add("active");
      else buttons[i].classList.remove("active");
    }
  }

  function bindTabs() {
    var buttons = toArray(document.querySelectorAll("#mainTabs [data-tab]"));
    var i;

    for (i = 0; i < buttons.length; i += 1) {
      if (buttons[i].getAttribute("data-legacy-bound") === "true") continue;
      buttons[i].setAttribute("data-legacy-bound", "true");
      buttons[i].addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var targetId = this.getAttribute("data-tab");
        if (targetId) setTab(targetId);
      }, true);
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
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var data = {};
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch (error) {
        data = {};
      }
      callback(xhr.status, data);
    };
    xhr.onerror = function () {
      callback(0, {});
    };
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

      html += "<div class=\"scanner-compact\"><div class=\"scanner-head\"><strong>" +
        escapeHtml(symbol) + "</strong><span>Skor: " + escapeHtml(score) +
        "</span><span>Fiyat: " + escapeHtml(price) + "</span><span>" + escapeHtml(decision) +
        "</span></div></div>";
    }

    container.innerHTML = html;
  }

  function scannerConfig(button) {
    var tab = findParentTabElement(button);
    var tabId = tab ? tab.id : "";

    if (tabId === "cryptoTab") {
      return {
        tab: tab,
        endpoint: "/api/crypto/scanner?jobId=legacy-crypto-" + new Date().getTime(),
        resultsSelector: "#cryptoScannerResults",
        statusSelector: "#cryptoScannerStatus",
        label: "Kripto taraması"
      };
    }

    if (tabId === "nasdaqTab") {
      return {
        tab: tab,
        endpoint: "/api/nasdaq/scanner?jobId=legacy-nasdaq-" + new Date().getTime(),
        resultsSelector: "#scannerResults",
        statusSelector: "#scannerStatus",
        label: "NASDAQ taraması"
      };
    }

    return {
      tab: tab,
      endpoint: "/api/trading/scanner?jobId=legacy-bist-" + new Date().getTime(),
      resultsSelector: "#scannerResults",
      statusSelector: "#scannerStatus",
      label: "BIST100 taraması"
    };
  }

  function queryInside(tab, selector) {
    if (tab && tab.querySelector) {
      var local = tab.querySelector(selector);
      if (local) return local;
    }
    return document.querySelector(selector);
  }

  function bindScanners() {
    var buttons = toArray(document.querySelectorAll("#startScannerBtn, #startCryptoScannerBtn"));
    var i;

    for (i = 0; i < buttons.length; i += 1) {
      if (buttons[i].getAttribute("data-legacy-scanner-bound") === "true") continue;
      buttons[i].setAttribute("data-legacy-scanner-bound", "true");

      buttons[i].addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();

        var button = this;
        var config = scannerConfig(button);
        var results = queryInside(config.tab, config.resultsSelector);
        var status = queryInside(config.tab, config.statusSelector);

        button.disabled = true;
        button.textContent = "TARANIYOR...";
        if (status) status.textContent = "TARANIYOR";
        if (results) {
          results.innerHTML = "<div class=\"trading-empty\">" + escapeHtml(config.label) + " çalışıyor...</div>";
        }

        requestJson(config.endpoint, function (httpStatus, data) {
          button.disabled = false;
          button.textContent = "TARAMAYI BAŞLAT";

          if (httpStatus < 200 || httpStatus >= 300 || (data && data.success === false)) {
            if (status) status.textContent = "HATA";
            if (results) {
              results.innerHTML = "<div class=\"trading-empty\">Tarama hatası: " +
                escapeHtml(data && data.error ? data.error : "Sunucu isteği başarısız") + "</div>";
            }
            return;
          }

          if (status) status.textContent = "TAMAMLANDI";
          renderScannerRows(results, data, config.label);
        });
      }, true);
    }
  }

  function init() {
    bindTabs();
    bindScanners();

    var active = document.querySelector("#mainTabs .main-tab.active[data-tab]");
    var initialTab = active ? active.getAttribute("data-tab") : "tradingTab";
    setTab(initialTab || "tradingTab");

    document.documentElement.setAttribute("data-borsaci-legacy", "true");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, false);
  } else {
    init();
  }

  window.addEventListener("borsaci:auth-ready", init, false);
})();
