"use strict";

/*
 * Scanner karar eşiği burada tek bir kaynaktan yönetilir. Teknik kalite
 * puanı bir başarı olasılığı değildir; Fibonacci planı ayrıca ACTIVE ve
 * giriş aralığı bakımından geçerli olmalıdır.
 */
const BUY_SETUP_MIN_TECHNICAL_SCORE = 60;
const WATCH_MIN_TECHNICAL_SCORE = 60;

function numericScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? score : 0;
}

function scannerAction({ active = false, score } = {}) {
  const technicalScore = numericScore(score);

  if (active && technicalScore >= BUY_SETUP_MIN_TECHNICAL_SCORE) {
    return "BUY SETUP";
  }

  if (technicalScore >= WATCH_MIN_TECHNICAL_SCORE) {
    return "WATCH";
  }

  return "NO TRADE";
}

module.exports = {
  BUY_SETUP_MIN_TECHNICAL_SCORE,
  WATCH_MIN_TECHNICAL_SCORE,
  scannerAction,
};
