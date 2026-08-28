"use strict";

/*
 * BIST tarafında broker entegrasyonu henüz yok. Bu adapter bilinçli olarak
 * hiçbir emri "gerçekleşti" saymaz; ileride Matrix/Osmanlı vb. sağlayıcı
 * bağlandığında aynı arayüzün arkasına eklenebilir.
 */

function notConfigured(action) {
  return {
    ok: false,
    configured: false,
    action,
    code: "NOT_CONFIGURED",
    confirmed: false,
    closed: false,
    message: "BIST broker adapter'ı henüz yapılandırılmadı.",
  };
}

function createBistBroker() {
  return Object.freeze({
    market: "BIST",
    configured: false,
    async executeExit() {
      return notConfigured("EXECUTE_EXIT");
    },
    async cancelOrder() {
      return notConfigured("CANCEL_ORDER");
    },
    async placeProtection() {
      return notConfigured("PLACE_PROTECTION");
    },
    async replaceStop() {
      return notConfigured("REPLACE_STOP");
    },
  });
}

module.exports = {
  createBistBroker,
};
