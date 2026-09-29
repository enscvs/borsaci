"use strict";
// Local UI QA fixture only; no production server, workers, env or broker calls.
const http=require("node:http"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"../..");
const {buildTsmomPortfolio}=require("../../trading/bist-tsmom-service");
const now=Date.UTC(2025,2,1,12);
const names=["ASELS","TUPRS",...Array.from({length:581},(_,i)=>`TEST${String(i).padStart(3,"0")}`),"NOHISTORY"];
const histories=Object.fromEntries(names.filter(s=>s!=="NOHISTORY").map((symbol,index)=>[symbol,Array.from({length:425},(_,i)=>{
  const t=Date.UTC(2024,0,1+i),close=50+index+(index%4===0?-1:1)*i/20;
  return {timestamp:new Date(t).toISOString(),open:close,high:close+1,low:close-1,close,volume:1000+i};
})]));
const model=buildTsmomPortfolio({universe:names,histories,now,currentCash:100000,source:"SYNTHETIC_UI_TEST_NOT_MARKET_DATA",universeSource:"584_TEST_SYMBOLS"});
model.summary.portfolioStatus="LOCAL_TEST_FIXTURE";model.history={};
const source=fs.readFileSync(path.join(root,"server.js"),"utf8");
const start=source.indexOf("// Feature-local BIST TSMOM assets."), end=source.indexOf("/*",start);
const a=source.indexOf("function serveFile("),b=source.indexOf("/*",a);
const serveFile=vm.runInNewContext(`${source.slice(a,b)};serveFile`,{fs,console,sendText:(res,status,text)=>{res.writeHead(status);res.end(text);}});
const route=new Function("req","res","pathname","serveFile","path","__dirname",`${source.slice(start,end)}\nres.writeHead(404);res.end('Not found');`);
const html=fs.readFileSync(path.join(root,"public/index.html"),"utf8");
const tags=[...html.matchAll(/<(?:link[^>]+href|script[^>]+src)="\/bist-tsmom\/[^>]+>(?:<\/script>)?/g)].map(m=>m[0]).join("\n");
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,"http://localhost").pathname;
  if(pathname==="/"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});return res.end(`<!doctype html><html lang="tr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>LOCAL BIST TEST — SENTETİK VERİ</title><link rel="stylesheet" href="/style.css">${tags}</head><body><p>LOCAL UI TEST — SENTETİK VERİ, EMİR GÖNDERİLMEZ</p><div id="tradingTab"></div><script>window.borsaciAuth={authenticated:true};</script></body></html>`);}
  if(pathname==="/api/bist/tsmom"){res.writeHead(200,{"Content-Type":"application/json"});return res.end(JSON.stringify(model));}
  if(pathname==="/style.css")return serveFile(res,path.join(root,"public/style.css"),"text/css");
  return route(req,res,pathname,serveFile,path,root);
});
server.listen(0,"127.0.0.1",()=>console.log(`BIST_UI_TEST_URL=http://127.0.0.1:${server.address().port}`));
