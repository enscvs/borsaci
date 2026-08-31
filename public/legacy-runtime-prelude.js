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

  if (window.Element && !Element.prototype.append) {
    Element.prototype.append = function () {
      for (var i = 0; i < arguments.length; i += 1) {
        var node = arguments[i];
        if (!(node && node.nodeType)) node = document.createTextNode(String(node));
        this.appendChild(node);
      }
    };
  }

  if (window.Element && !Element.prototype.remove) {
    Element.prototype.remove = function () {
      if (this.parentNode) this.parentNode.removeChild(this);
    };
  }

  if (window.Node && !Node.prototype.closest) {
    Node.prototype.closest = function (selector) {
      var node = this;
      if (node.nodeType !== 1) node = node.parentElement || node.parentNode;
      while (node && node.nodeType === 1) {
        if (node.matches && node.matches(selector)) return node;
        node = node.parentElement || node.parentNode;
      }
      return null;
    };
  }

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
