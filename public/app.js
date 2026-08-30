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

  var legacy = !supportsModernSyntax();
  var script = document.createElement("script");
  var version = legacy ? "20260830-ios10-static" : "20260829-ui-memory-trim";

  window.BORSACI_LEGACY_MODE = legacy;
  script.async = false;
  script.src = legacy
    ? "/app-legacy.js?v=" + version
    : "/app-modern.js?v=" + version;

  script.onload = function () {
    window.BORSACI_APP_BUNDLE_LOADED = legacy ? "legacy" : "modern";
  };

  script.onerror = function () {
    window.BORSACI_APP_BUNDLE_LOADED = "error";
    if (window.console && console.error) {
      console.error("BORSACI: application bundle could not be loaded:", script.src);
    }
  };

  (document.head || document.documentElement).appendChild(script);
})();
