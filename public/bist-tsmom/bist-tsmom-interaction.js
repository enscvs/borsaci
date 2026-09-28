(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BistTsmomInteraction = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function symbolFromTarget(target) {
    if (target && typeof target.closest === "function") {
      const row = target.closest("tr[data-symbol]");
      if (row && row.dataset && row.dataset.symbol) return row.dataset.symbol;
    }
    let node = target;
    while (node) {
      if (node.dataset && node.dataset.symbol) return node.dataset.symbol;
      node = node.parentElement || node.parentNode || null;
    }
    return null;
  }

  function createRowSelectionController(onSelect, now) {
    let lastTouchAt = -Infinity;
    const clock = now || (() => Date.now());
    return {
      handle(event) {
        const isTouch = event && event.type === "pointerup" && event.pointerType === "touch";
        if (event && event.type === "pointerup" && !isTouch) return false;
        if (event && event.type === "click" && clock() - lastTouchAt < 450) return false;
        const symbol = symbolFromTarget(event && event.target);
        if (!symbol) return false;
        if (isTouch) lastTouchAt = clock();
        onSelect(symbol);
        return true;
      }
    };
  }

  return { symbolFromTarget, createRowSelectionController };
});
