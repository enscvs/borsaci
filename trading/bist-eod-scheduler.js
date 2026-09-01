"use strict";

/*
 * BIST kapanış taraması için küçük, saf zaman/karar katmanı. Asıl scanner
 * server.js'teki mevcut BIST scanner'dır; bu dosya ikinci bir analiz sistemi
 * oluşturmaz. Böylece hem timer hem restart recovery aynı kuralları kullanır.
 */

const EOD_RETRY_DELAY_MS = 5 * 60 * 1000;

function istanbulParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
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
    }).formatToParts(date)
      .filter((item) => item.type !== "literal")
      .map((item) => [item.type, item.value])
  );
  return {
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    sessionKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function isBistEndOfDayDue(value = new Date()) {
  const {weekday, hour, minute} = istanbulParts(value);
  if (weekday === "Sat" || weekday === "Sun") return false;
  return hour > 18 || (hour === 18 && minute >= 15);
}

function eodDecision({now = new Date(), eodState = null, dailySummary = null, scannerLocked = false} = {}) {
  const {sessionKey} = istanbulParts(now);
  if (!isBistEndOfDayDue(now)) return {action: "WAIT", sessionKey};
  if (dailySummary?.sessionKey === sessionKey) return {action: "COMPLETE", sessionKey};
  if (eodState?.sessionKey === sessionKey && eodState?.status === "SUCCESS") {
    return {action: "SEND_SUMMARY", sessionKey};
  }
  if (scannerLocked) return {action: "SCANNER_IN_FLIGHT", sessionKey};
  const retryAt = new Date(eodState?.retryAt || 0).getTime();
  if (eodState?.sessionKey === sessionKey && eodState?.status === "FAILED" && retryAt > new Date(now).getTime()) {
    return {action: "RETRY_WAIT", sessionKey};
  }
  return {action: "RUN_SCAN", sessionKey};
}

function failedEodState(sessionKey, error, now = new Date()) {
  return {
    sessionKey,
    status: "FAILED",
    failedAt: new Date(now).toISOString(),
    retryAt: new Date(new Date(now).getTime() + EOD_RETRY_DELAY_MS).toISOString(),
    error: String(error?.message || error || "BIST kapanış taraması başarısız.").slice(0, 500),
  };
}

module.exports = {
  EOD_RETRY_DELAY_MS,
  istanbulParts,
  isBistEndOfDayDue,
  eodDecision,
  failedEodState,
};
