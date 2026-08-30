"use strict";
(function () {
  function isLegacy() {
    try {
      new Function("var x={a:{b:1}}; return x?.a?.b ?? 0;");
      return false;
    } catch (error) {
      return true;
    }
  }

  if (!isLegacy()) return;

  function debug(message) {
    if (typeof window.borsaciLegacyDebug === "function") {
      window.borsaciLegacyDebug(message);
    }
  }

  function replaceWithCleanClone(element) {
    if (!element || !element.parentNode) return element;
    var clone = element.cloneNode(true);
    clone.removeAttribute("data-inline-legacy-bound");
    clone.removeAttribute("data-scanner-bound");
    clone.removeAttribute("data-crypto-bound");
    clone.removeAttribute("data-nasdaq-bound");
    element.parentNode.replaceChild(clone, element);
    return clone;
  }

  var selectors = [
    "#startScannerBtn",
    "#stopScannerBtn",
    "#startCryptoScannerBtn",
    "#stopCryptoScannerBtn"
  ];

  var i;
  var j;
  for (i = 0; i < selectors.length; i += 1) {
    var nodes = document.querySelectorAll(selectors[i]);
    for (j = nodes.length - 1; j >= 0; j -= 1) {
      replaceWithCleanClone(nodes[j]);
    }
  }

  debug("CACHED FALLBACK HANDLERS: REMOVED");
})();
