"use strict";

/*
 * Günlük Telegram özeti için saf yardımcılar. Bu modül piyasa verisi veya
 * Telegram'a erişmez; böylece zamanlama ve içerik test edilebilir kalır.
 */

function istanbulClock(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );

  return {
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    sessionKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function isWeekday(clock) {
  return clock.weekday !== "Sat" && clock.weekday !== "Sun";
}

function isDailySummaryDue(now = new Date()) {
  const clock = istanbulClock(now);
  return isWeekday(clock) && (
    clock.hour > 18 ||
    (clock.hour === 18 && clock.minute >= 15)
  );
}

function currency(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `₺${amount.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
    : "—";
}

function value(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("tr-TR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
    : "—";
}

function fibonacciLine(item) {
  const fib = item?.fibonacci || {};
  const point = pointName => value(fib[`point${point}`]?.price);
  const status = fib.status || "BİLİNMİYOR";
  return `${item.symbol} · ${status} · A ${point("A")} / B ${point("B")} / C ${point("C")} · Tetik ${currency(fib.entryTriggerPrice)}`;
}

function currentTopFiveLines(snapshot, sessionKey) {
  if (snapshot?.sessionKey !== sessionKey) {
    return ["Bugün için tamamlanmış scanner kaydı yok."];
  }

  const items = Array.isArray(snapshot?.results)
    ? snapshot.results.slice(0, 5)
    : [];

  if (!items.length) {
    return ["Bugün için tamamlanmış scanner kaydı yok."];
  }

  return items.map((item, index) => {
    const grade = item.grade || item.decision || "—";
    const score = Number.isFinite(Number(item.score))
      ? `Teknik ${Math.round(Number(item.score))}/100`
      : "Teknik skor —";
    const fibStatus = item.fibonacci?.status
      ? ` · Fib ${item.fibonacci.status}`
      : "";
    return `${index + 1}. ${item.symbol || "—"} · ${grade} · ${score}${fibStatus}`;
  });
}

function activeFibonacciLines(state) {
  const activeStatuses = new Set([
    "ACTIVE",
    "WAITING_CONFIRMATION",
    "ENTRY_TOO_FAR",
  ]);

  const rows = (Array.isArray(state?.decisions) ? state.decisions : [])
    .filter(item => item?.fibonacci?.valid && activeStatuses.has(item.fibonacci.status))
    .slice(0, 5)
    .map(fibonacciLine);

  return rows.length ? rows : ["Aktif Fibonacci yapısı yok."];
}

function pendingApprovalLines(state) {
  const rows = (Array.isArray(state?.decisions) ? state.decisions : [])
    .filter(item => item?.status === "PENDING_APPROVAL")
    .slice(0, 5)
    .map(item => {
      const order = item.pendingOrder || {};
      const entry = order.entryPrice ?? item.entry?.reference;
      const stop = order.stop ?? item.stop;
      const quantity = order.quantity ?? item.riskPlan?.quantity ?? 0;
      const orderType = order.orderType ? ` · ${order.orderType}` : "";
      const manual = item.manualOrder || item.source === "MANUAL"
        ? " · MANUEL PAPER"
        : "";

      return `${item.symbol} · Giriş ${currency(entry)} · SL ${currency(stop)} · ${quantity} lot${orderType}${manual}`;
    });

  return rows.length ? rows : ["Onay bekleyen paper işlem yok."];
}

function openPositionLines(state) {
  const rows = (Array.isArray(state?.paper?.positions) ? state.paper.positions : [])
    .filter(item => item?.status === "OPEN")
    .slice(0, 5)
    .map(item => {
      const pnl = Number(item.pnl || 0);
      const prefix = pnl >= 0 ? "+" : "";
      return `${item.symbol} · ${item.quantity || 0} lot · Güncel ${currency(item.current)} · P&L ${prefix}${currency(pnl)}${item.tp1Hit ? " · TP1 alındı" : ""}`;
    });

  return rows.length ? rows : ["Açık paper pozisyon yok."];
}

function buildDailySummaryMessage(state, sessionKey) {
  return [
    "📊 BORSACI · GÜNLÜK ÖZET",
    `Seans: ${sessionKey}`,
    "",
    "İLK 5 · BUGÜNÜN TARAMASI",
    ...currentTopFiveLines(state?.scannerSnapshot, sessionKey),
    "",
    "AKTİF FIBONACCI YAPILARI",
    ...activeFibonacciLines(state),
    "",
    "ONAY BEKLEYEN İŞLEMLER",
    ...pendingApprovalLines(state),
    "",
    "AÇIK PAPER POZİSYONLAR",
    ...openPositionLines(state),
  ].join("\n").slice(0, 4000);
}

module.exports = {
  istanbulClock,
  isDailySummaryDue,
  buildDailySummaryMessage,
};
