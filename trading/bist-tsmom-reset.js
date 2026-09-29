"use strict";

// Explicit, offline paper-account maintenance only. Never called by a scanner,
// HTTP GET, scheduler or production startup. Caller must persist with a current
// revision and archive the input before applying the returned container.
function resetBistPaper(container, {timestamp, confirmation} = {}) {
  if (confirmation !== "RESET_BIST_PAPER_100000") throw new Error("Explicit BIST paper reset confirmation required");
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error("Valid reset timestamp required");
  if (!container?.trading?.paper || !Array.isArray(container.trading.paper.positions)) throw new Error("BIST paper state missing");
  const output=structuredClone(container), state=output.trading;
  const archive={timestamp,reason:"USER_REQUESTED_BIST_PAPER_RESET",paper:structuredClone(state.paper),decisions:structuredClone(state.decisions || [])};
  state.bistPaperResetArchives=[...(state.bistPaperResetArchives || []),archive];
  state.paper={initialCapital:100000,cash:100000,equity:100000,pnl:0,pnlPercent:0,positions:[],resetAt:timestamp};
  state.decisions=[];
  // Keep historical BIST transactions, signals and ALL other markets intact.
  state.activity=[{timestamp,type:"BIST_PAPER_RESET",message:"Kullanıcı isteğiyle BIST paper hesabı 100.000 TL nakde sıfırlandı; önceki pozisyonlar ve bekleyen kararlar arşivlendi. Satış emri gönderilmedi."},...(state.activity || [])];
  return output;
}

module.exports={resetBistPaper};
