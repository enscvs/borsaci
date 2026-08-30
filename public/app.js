"use strict";

(function () {
  function supportsModernSyntax() {
    try {
      new Function("var x={a:{b:1}}; return x?.a?.b ?? 0;");
      return true;
    } catch (error) {
      return false;
    }
  }

  function legacyDebug(message) {
    if (typeof window.borsaciLegacyDebug === "function") {
      window.borsaciLegacyDebug(message);
    }
  }

  var legacy = !supportsModernSyntax();
  var script = document.createElement("script");
  var version = legacy ? "20260830-ios10-static-v2" : "20260829-ui-memory-trim";

  window.BORSACI_LEGACY_MODE = legacy;
  script.async = false;
  script.src = legacy
    ? "/app-legacy.js?v=" + version
    : "/app-modern.js?v=" + version;

  script.onload = function () {
    window.BORSACI_APP_BUNDLE_LOADED = legacy ? "legacy" : "modern";
    if (legacy) {
      legacyDebug("APP BUNDLE: LEGACY LOADED");
      window.setTimeout(function () {
        if (typeof window.runTradingScanner === "function") {
          legacyDebug("MAIN APP CONTROLLER: READY");
        } else {
          legacyDebug("MAIN APP CONTROLLER: MISSING");
        }
      }, 50);
    }
  };

  script.onerror = function () {
    window.BORSACI_APP_BUNDLE_LOADED = "error";
    legacyDebug("APP BUNDLE: LOAD ERROR");
    if (window.console && console.error) {
      console.error("BORSACI: application bundle could not be loaded:", script.src);
    }
  };

  (document.head || document.documentElement).appendChild(script);
})();
