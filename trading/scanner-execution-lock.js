"use strict";

const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;

class ScannerExecutionRegistry {
  constructor({now = () => Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS} = {}) {
    this.now = now;
    this.maxAgeMs = Math.max(60_000, Number(maxAgeMs) || DEFAULT_MAX_AGE_MS);
    this.locks = new Map();
  }

  normalize(market) {
    return String(market || "").trim().toUpperCase();
  }

  acquire(market) {
    const normalized = this.normalize(market);
    if (!normalized) return null;
    const now = Number(this.now());
    const existing = this.locks.get(normalized);
    if (existing && now - existing.startedAt <= this.maxAgeMs) return null;
    if (existing) this.locks.delete(normalized);
    const token = Symbol(normalized);
    this.locks.set(normalized, {market:normalized, startedAt:now, token});
    return token;
  }

  release(market, token) {
    const normalized = this.normalize(market);
    const existing = this.locks.get(normalized);
    if (!existing || (token && existing.token !== token)) return false;
    this.locks.delete(normalized);
    return true;
  }

  activeMarkets() {
    const now = Number(this.now());
    for (const [market, lock] of this.locks) {
      if (now - lock.startedAt > this.maxAgeMs) this.locks.delete(market);
    }
    return [...this.locks.keys()];
  }

  isActive(market) {
    const normalized = this.normalize(market);
    this.activeMarkets();
    return this.locks.has(normalized);
  }
}

async function runWithScannerExecution(registry, market, worker) {
  const token = registry.acquire(market);
  if (!token) return {acquired:false};
  try {
    return {acquired:true, result:await worker()};
  } finally {
    registry.release(market, token);
  }
}

module.exports = {DEFAULT_MAX_AGE_MS, ScannerExecutionRegistry, runWithScannerExecution};

