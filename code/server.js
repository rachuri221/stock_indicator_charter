import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const fallbackQuotes = [
  { symbol: "NVDA", shortName: "NVIDIA Corp.", regularMarketPrice: 179.4, regularMarketChangePercent: 2.6, regularMarketVolume: 213000000, marketCap: 4380000000000 },
  { symbol: "TSLA", shortName: "Tesla Inc.", regularMarketPrice: 327.2, regularMarketChangePercent: -3.1, regularMarketVolume: 151000000, marketCap: 1040000000000 },
  { symbol: "AMD", shortName: "Advanced Micro Devices", regularMarketPrice: 167.7, regularMarketChangePercent: 1.8, regularMarketVolume: 99000000, marketCap: 272000000000 },
  { symbol: "AAPL", shortName: "Apple Inc.", regularMarketPrice: 203.8, regularMarketChangePercent: -0.9, regularMarketVolume: 72000000, marketCap: 3050000000000 },
  { symbol: "PLTR", shortName: "Palantir Technologies", regularMarketPrice: 142.1, regularMarketChangePercent: 4.4, regularMarketVolume: 62000000, marketCap: 332000000000 },
  { symbol: "SOFI", shortName: "SoFi Technologies", regularMarketPrice: 18.3, regularMarketChangePercent: -2.2, regularMarketVolume: 58000000, marketCap: 20500000000 },
];

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

async function fetchJson(url) {
  const signal = AbortSignal.timeout(5000);
  const response = await fetch(url, {
    signal,
    headers: {
      "user-agent": "Mozilla/5.0 StockIndicatorCharter/1.0",
      "accept": "application/json,text/plain,*/*",
    },
  });
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.json();
}

async function marketMovers() {
  try {
    const url = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=50";
    const data = await fetchJson(url);
    const quotes = data?.finance?.result?.[0]?.quotes || [];
    if (!quotes.length) throw new Error("No quote results");
    return {
      source: "Yahoo Finance most active stocks",
      stale: false,
      asOf: new Date().toISOString(),
      quotes: quotes.map((q) => ({
        symbol: q.symbol,
        shortName: q.shortName || q.longName || q.symbol,
        regularMarketPrice: q.regularMarketPrice,
        regularMarketChangePercent: q.regularMarketChangePercent,
        regularMarketVolume: q.regularMarketVolume,
        marketCap: q.marketCap,
      })),
    };
  } catch (error) {
    return {
      source: "Fallback sample data",
      stale: true,
      asOf: new Date().toISOString(),
      error: error.message,
      quotes: fallbackQuotes,
    };
  }
}

function syntheticCandles(symbol) {
  const seed = [...symbol].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  let price = 80 + (seed % 180);
  const now = new Date();
  now.setSeconds(0, 0);
  const candles = [];
  for (let i = 90; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setMinutes(now.getMinutes() - i * 5);
    const drift = Math.sin((seed + i) / 9) * 0.55 + Math.cos(i / 6) * 0.28;
    const open = price;
    const close = Math.max(2, open + drift + ((seed * (i + 3)) % 17 - 8) / 35);
    const high = Math.max(open, close) + 0.25 + (i % 5) * 0.08;
    const low = Math.min(open, close) - 0.25 - (i % 4) * 0.07;
    const volume = 250000 + ((seed * (i + 11)) % 2200000);
    candles.push({ time: date.toISOString(), open, high, low, close, volume });
    price = close;
  }
  return candles;
}

async function chart(symbol) {
  try {
    const clean = encodeURIComponent(symbol.toUpperCase().replace(/[^A-Z0-9.-]/g, ""));
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${clean}?range=1d&interval=5m&includePrePost=true`;
    const data = await fetchJson(url);
    const result = data?.chart?.result?.[0];
    const timestamps = result?.timestamp || [];
    const quote = result?.indicators?.quote?.[0] || {};
    const candles = timestamps.map((stamp, i) => ({
      time: new Date(stamp * 1000).toISOString(),
      open: quote.open?.[i],
      high: quote.high?.[i],
      low: quote.low?.[i],
      close: quote.close?.[i],
      volume: quote.volume?.[i],
    })).filter((d) => Number.isFinite(d.open) && Number.isFinite(d.high) && Number.isFinite(d.low) && Number.isFinite(d.close));
    if (candles.length < 30) throw new Error("Not enough chart data");
    return { source: "Yahoo Finance 1D / 5m chart", stale: false, asOf: new Date().toISOString(), symbol: symbol.toUpperCase(), candles };
  } catch (error) {
    return {
      source: "Fallback generated chart",
      stale: true,
      asOf: new Date().toISOString(),
      error: error.message,
      symbol: symbol.toUpperCase(),
      candles: syntheticCandles(symbol),
    };
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const fullPath = join(root, safePath);
  if (!fullPath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const body = await readFile(fullPath);
    res.writeHead(200, { "content-type": contentTypes[extname(fullPath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/market") return json(res, 200, await marketMovers());
    if (url.pathname === "/api/chart") return json(res, 200, await chart(url.searchParams.get("symbol") || "NVDA"));
    return serveStatic(req, res);
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Stock Indicator Charter running on port ${port}`);
});