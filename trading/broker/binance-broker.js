"use strict";

const FILLED_STATUS = "FILLED";
const CANCELLED_STATUS = "CANCELED";

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeBinanceOrder(order = {}) {
  const executedQuantity = finitePositive(order.executedQty ?? order.executed_quantity) || 0;
  const cumulativeQuoteQuantity = finitePositive(order.cummulativeQuoteQty ?? order.cumulativeQuoteQty) || 0;
  const reportedPrice = finitePositive(order.price) || 0;
  // MARKET emirlerinde Binance "price" alanını çoğunlukla 0 döndürür. Bu
  // durumda gerçekleşen ortalama ancak toplam quote / gerçekleşen miktar ile
  // güvenilir biçimde hesaplanabilir; aksi halde takip bildirimi yanlış P&L
  // gösterebilir.
  const averagePrice = reportedPrice || (executedQuantity > 0 && cumulativeQuoteQuantity > 0
    ? cumulativeQuoteQuantity / executedQuantity
    : 0);
  return {
    orderId: String(order.orderId || order.id || ""),
    clientOrderId: String(order.clientOrderId || order.client_order_id || ""),
    symbol: String(order.symbol || "").toUpperCase(),
    status: String(order.status || "").toUpperCase(),
    executedQuantity,
    originalQuantity: finitePositive(order.origQty ?? order.quantity ?? order.orig_quantity) || 0,
    averagePrice,
    cumulativeQuoteQuantity,
    raw: order,
  };
}

function executionResult(order, requestedQuantity) {
  const normalized = normalizeBinanceOrder(order);
  const requested = finitePositive(requestedQuantity) || normalized.originalQuantity;
  const fulfilled = normalized.status === FILLED_STATUS && normalized.executedQuantity + 1e-12 >= requested;
  return {
    ok: fulfilled,
    confirmed: fulfilled,
    closed: fulfilled,
    code: fulfilled ? "FILLED" : "BROKER_NOT_FILLED",
    status: normalized.status || "UNKNOWN",
    requestedQuantity: requested,
    executedQuantity: normalized.executedQuantity,
    averagePrice: normalized.averagePrice,
    order: normalized,
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

/*
 * Network/credential kodu burada değil, server.js içinden dependency olarak
 * enjekte edilir. Böylece adapter emrin gerçekten FILLED olduğunu görmeden
 * state'in CLOSED olmasına izin vermez.
 */
function createBinanceBroker({submitOrder, fetchOrder, cancelOrder, placeOrderList} = {}) {
  const configured = typeof submitOrder === "function";

  async function resolveOrder(initialOrder, symbol) {
    const initial = normalizeBinanceOrder(initialOrder);
    if (initial.status === FILLED_STATUS || typeof fetchOrder !== "function" || !initial.orderId) return initial.raw;
    return fetchOrder({symbol: symbol || initial.symbol, orderId: initial.orderId});
  }

  return {
    market: "CRYPTO",
    broker: "BINANCE_SPOT",
    get configured() {
      return configured;
    },

    async executeExit({symbol, quantity, clientOrderId} = {}) {
      const requestedQuantity = finitePositive(quantity);
      if (!configured) return unavailable("EXECUTE_EXIT", "Binance Spot emir göndericisi yapılandırılmadı.");
      if (!String(symbol || "").trim() || !requestedQuantity) {
        return {ok: false, action: "EXECUTE_EXIT", confirmed: false, closed: false, code: "INVALID_EXIT", message: "Geçerli sembol ve miktar gerekli."};
      }
      try {
        const submitted = await submitOrder({
          symbol: String(symbol).trim().toUpperCase(), side: "SELL", type: "MARKET", quantity: requestedQuantity,
          newClientOrderId: clientOrderId,
        });
        const resolved = await resolveOrder(submitted, symbol);
        return {...executionResult(resolved, requestedQuantity), action: "EXECUTE_EXIT"};
      } catch (error) {
        return failed("EXECUTE_EXIT", error);
      }
    },

    async cancelOrder({symbol, orderId} = {}) {
      if (typeof cancelOrder !== "function") return unavailable("CANCEL_ORDER", "Binance Spot emir iptal edicisi yapılandırılmadı.");
      try {
        const response = await cancelOrder({symbol: String(symbol || "").trim().toUpperCase(), orderId: String(orderId || "")});
        const order = normalizeBinanceOrder(response);
        const cancelled = order.status === CANCELLED_STATUS;
        return {
          ok: cancelled,
          action: "CANCEL_ORDER",
          cancelled,
          confirmed: cancelled,
          closed: false,
          code: cancelled ? "CANCELED" : "BROKER_CANCEL_UNCONFIRMED",
          status: order.status || "UNKNOWN",
          order,
        };
      } catch (error) {
        return failed("CANCEL_ORDER", error);
      }
    },

    async placeProtection(protection = {}) {
      if (typeof placeOrderList !== "function") {
        return unavailable("PLACE_PROTECTION", "Binance native koruyucu emir göndericisi yapılandırılmadı.");
      }
      try {
        const response = await placeOrderList(protection);
        const status = String(response?.listStatusType || response?.status || "").toUpperCase();
        const accepted = ["EXEC_STARTED", "EXECUTING", "NEW", "ACCEPTED"].includes(status);
        return {
          ok: accepted,
          action: "PLACE_PROTECTION",
          accepted,
          confirmed: false,
          closed: false,
          code: accepted ? "PROTECTION_ACCEPTED" : "PROTECTION_UNCONFIRMED",
          status: status || "UNKNOWN",
          protection: response || null,
        };
      } catch (error) {
        return failed("PLACE_PROTECTION", error);
      }
    },

    async replaceStop({cancel, protection} = {}) {
      if (!cancel?.symbol || !cancel?.orderId) {
        return {ok: false, action: "REPLACE_STOP", confirmed: false, closed: false, code: "INVALID_REPLACE", message: "Eski koruyucu emir bilgisi gerekli."};
      }
      const cancelled = await this.cancelOrder(cancel);
      if (!cancelled.cancelled) return {...cancelled, action: "REPLACE_STOP", code: "OLD_PROTECTION_NOT_CANCELLED"};
      const placed = await this.placeProtection(protection);
      return {...placed, action: "REPLACE_STOP", previousProtectionCancelled: true};
    },
  };
}

module.exports = {
  createBinanceBroker,
  normalizeBinanceOrder,
  executionResult,
};
