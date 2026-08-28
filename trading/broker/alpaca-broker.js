"use strict";

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeAlpacaOrder(order = {}) {
  return {
    orderId: String(order.id || order.order_id || ""),
    clientOrderId: String(order.client_order_id || order.clientOrderId || ""),
    symbol: String(order.symbol || "").toUpperCase(),
    status: String(order.status || "").toLowerCase(),
    filledQuantity: finitePositive(order.filled_qty ?? order.filledQuantity) || 0,
    quantity: finitePositive(order.qty ?? order.quantity) || 0,
    filledAveragePrice: finitePositive(order.filled_avg_price ?? order.filledAveragePrice) || 0,
    raw: order,
  };
}

function failed(action, error) {
  return {
    ok: false,
    action,
    confirmed: false,
    closed: false,
    code: String(error?.code || "BROKER_REQUEST_FAILED"),
    message: String(error?.message || "Broker isteği tamamlanamadı."),
  };
}

function unavailable(action, message) {
  return {
    ok: false,
    configured: false,
    action,
    confirmed: false,
    closed: false,
    code: "BROKER_NOT_CONFIGURED",
    message,
  };
}

function createAlpacaBroker({enabled = false, submitOrder, fetchOrder, cancelOrder} = {}) {
  const configured = Boolean(enabled) && typeof submitOrder === "function";

  async function resolveOrder(initialOrder) {
    const initial = normalizeAlpacaOrder(initialOrder);
    if (initial.status === "filled" || typeof fetchOrder !== "function" || !initial.orderId) return initial.raw;
    return fetchOrder({orderId: initial.orderId, clientOrderId: initial.clientOrderId});
  }

  return {
    market: "NASDAQ",
    broker: "ALPACA",
    get configured() {
      return configured;
    },

    async executeExit({symbol, quantity, clientOrderId} = {}) {
      const requestedQuantity = finitePositive(quantity);
      if (!configured) return unavailable("EXECUTE_EXIT", "Alpaca canlı emir gönderimi kapalı veya yapılandırılmamış.");
      if (!String(symbol || "").trim() || !requestedQuantity) {
        return {ok: false, action: "EXECUTE_EXIT", confirmed: false, closed: false, code: "INVALID_EXIT", message: "Geçerli sembol ve miktar gerekli."};
      }
      try {
        const submitted = await submitOrder({
          symbol: String(symbol).trim().toUpperCase(), qty: String(requestedQuantity), side: "sell", type: "market",
          time_in_force: "day", client_order_id: clientOrderId,
        });
        const resolved = normalizeAlpacaOrder(await resolveOrder(submitted));
        const fulfilled = resolved.status === "filled" && resolved.filledQuantity + 1e-12 >= requestedQuantity;
        return {
          ok: fulfilled,
          action: "EXECUTE_EXIT",
          confirmed: fulfilled,
          closed: fulfilled,
          code: fulfilled ? "FILLED" : "BROKER_NOT_FILLED",
          status: resolved.status || "unknown",
          requestedQuantity,
          executedQuantity: resolved.filledQuantity,
          averagePrice: resolved.filledAveragePrice,
          order: resolved,
        };
      } catch (error) {
        return failed("EXECUTE_EXIT", error);
      }
    },

    async cancelOrder({orderId} = {}) {
      if (!configured || typeof cancelOrder !== "function") return unavailable("CANCEL_ORDER", "Alpaca emir iptal edicisi yapılandırılmadı.");
      try {
        const response = await cancelOrder({orderId: String(orderId || "")});
        // Alpaca DELETE çoğunlukla 204 döner; callback bu durumda {status:"canceled"}
        // veya açıkça {cancelled:true} normalleştirmelidir.
        const normalized = normalizeAlpacaOrder(response || {});
        const cancelled = response?.cancelled === true || normalized.status === "canceled";
        return {
          ok: cancelled,
          action: "CANCEL_ORDER",
          cancelled,
          confirmed: cancelled,
          closed: false,
          code: cancelled ? "CANCELED" : "BROKER_CANCEL_UNCONFIRMED",
          status: normalized.status || "unknown",
          order: normalized,
        };
      } catch (error) {
        return failed("CANCEL_ORDER", error);
      }
    },

    async placeProtection(order = {}) {
      if (!configured) return unavailable("PLACE_PROTECTION", "Alpaca canlı emir gönderimi kapalı veya yapılandırılmamış.");
      try {
        const response = await submitOrder(order);
        const normalized = normalizeAlpacaOrder(response);
        const accepted = ["new", "accepted", "pending_new", "held"].includes(normalized.status);
        return {
          ok: accepted,
          action: "PLACE_PROTECTION",
          accepted,
          confirmed: false,
          closed: false,
          code: accepted ? "PROTECTION_ACCEPTED" : "PROTECTION_UNCONFIRMED",
          status: normalized.status || "unknown",
          order: normalized,
        };
      } catch (error) {
        return failed("PLACE_PROTECTION", error);
      }
    },

    async replaceStop({cancelOrderId, protection} = {}) {
      if (!cancelOrderId) {
        return {ok: false, action: "REPLACE_STOP", confirmed: false, closed: false, code: "INVALID_REPLACE", message: "Eski koruyucu emir bilgisi gerekli."};
      }
      const cancelled = await this.cancelOrder({orderId: cancelOrderId});
      if (!cancelled.cancelled) return {...cancelled, action: "REPLACE_STOP", code: "OLD_PROTECTION_NOT_CANCELLED"};
      const placed = await this.placeProtection(protection);
      return {...placed, action: "REPLACE_STOP", previousProtectionCancelled: true};
    },
  };
}

module.exports = {
  createAlpacaBroker,
  normalizeAlpacaOrder,
};
