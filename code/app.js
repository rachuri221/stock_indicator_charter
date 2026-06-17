const state = {
  quotes: [],
  activeList: "bullish",
  symbol: "NVDA",
  candles: [],
  indicators: {},
};

const el = {
  symbolInput: document.querySelector("#symbolInput"),
  searchResults: document.querySelector("#searchResults"),
  loadSymbol: document.querySelector("#loadSymbol"),
  refreshMarket: document.querySelector("#refreshMarket"),
  watchlist: document.querySelector("#watchlist"),
  tabs: document.querySelectorAll(".tab"),
  activeSymbol: document.querySelector("#activeSymbol"),
  signalBadge: document.querySelector("#signalBadge"),
  signalScore: document.querySelector("#signalScore"),
  scoreRing: document.querySelector("#scoreRing"),
  signalTitle: document.querySelector("#signalTitle"),
  signalReason: document.querySelector("#signalReason"),
  rsiValue: document.querySelector("#rsiValue"),
  macdValue: document.querySelector("#macdValue"),
  trendValue: document.querySelector("#trendValue"),
  atrValue: document.querySelector("#atrValue"),
  chartTitle: document.querySelector("#chartTitle"),
  dataSource: document.querySelector("#dataSource"),
  refreshStatus: document.querySelector("#refreshStatus"),
  playbook: document.querySelector("#playbook"),
  priceChart: document.querySelector("#priceChart"),
  rsiChart: document.querySelector("#rsiChart"),
  macdChart: document.querySelector("#macdChart"),
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function last(values) {
  return values[values.length - 1];
}

function sma(values, period) {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const slice = values.slice(i - period + 1, i + 1);
    return slice.reduce((sum, value) => sum + value, 0) / period;
  });
}

function ema(values, period) {
  const multiplier = 2 / (period + 1);
  const output = [];
  let previous = values[0];
  values.forEach((value, i) => {
    previous = i === 0 ? value : value * multiplier + previous * (1 - multiplier);
    output.push(previous);
  });
  return output;
}

function rsi(values, period = 14) {
  const output = Array(period).fill(null);
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  output[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    output[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return output;
}

function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = [];
  const lower = [];
  values.forEach((_, i) => {
    if (i < period - 1) {
      upper.push(null);
      lower.push(null);
      return;
    }
    const slice = values.slice(i - period + 1, i + 1);
    const mean = mid[i];
    const variance = slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    const deviation = Math.sqrt(variance);
    upper.push(mean + deviation * mult);
    lower.push(mean - deviation * mult);
  });
  return { mid, upper, lower };
}

function macd(values) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const line = fast.map((value, i) => value - slow[i]);
  const signal = ema(line, 9);
  const hist = line.map((value, i) => value - signal[i]);
  return { line, signal, hist };
}

function atr(candles, period = 14) {
  const ranges = candles.map((candle, i) => {
    if (i === 0) return candle.high - candle.low;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - candles[i - 1].close), Math.abs(candle.low - candles[i - 1].close));
  });
  return sma(ranges, period);
}

function vwap(candles) {
  let volumeTotal = 0;
  let priceVolumeTotal = 0;
  return candles.map((candle) => {
    const typical = (candle.high + candle.low + candle.close) / 3;
    volumeTotal += candle.volume || 0;
    priceVolumeTotal += typical * (candle.volume || 0);
    return volumeTotal ? priceVolumeTotal / volumeTotal : typical;
  });
}

function computeIndicators(candles) {
  const closes = candles.map((candle) => candle.close);
  return {
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    rsi14: rsi(closes, 14),
    macd: macd(closes),
    bb: bollinger(closes, 20, 2),
    atr14: atr(candles, 14),
    vwap: vwap(candles),
  };
}

function signalScore(candles, indicators) {
  const close = last(candles).close;
  const previousClose = candles[candles.length - 6]?.close || candles[0].close;
  const ema20 = last(indicators.ema20);
  const ema50 = last(indicators.ema50);
  const rsiNow = last(indicators.rsi14);
  const macdHist = last(indicators.macd.hist);
  const vwapNow = last(indicators.vwap);
  const atrNow = last(indicators.atr14) || 0;
  let score = 48;
  if (close > ema20) score += 9;
  if (ema20 > ema50) score += 11;
  if (rsiNow > 52 && rsiNow < 72) score += 10;
  if (macdHist > 0) score += 9;
  if (close > vwapNow) score += 6;
  if (close > previousClose) score += 5;
  if (rsiNow > 78) score -= 14;
  if (close < ema20) score -= 10;
  if (atrNow / close > 0.07) score -= 8;
  score = Math.max(3, Math.min(94, Math.round(score)));
  const direction = score >= 66 ? "buy" : score <= 42 ? "sell" : "watch";
  return { score, direction, close, ema20, ema50, rsiNow, macdHist, vwapNow, atrNow };
}

function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (!canvas.dataset.logicalHeight) {
    canvas.dataset.logicalHeight = canvas.getAttribute("height") || "300";
  }
  const logicalHeight = Number(canvas.dataset.logicalHeight) || 300;
  canvas.style.height = `${logicalHeight}px`;
  canvas.width = Math.max(320, Math.floor(rect.width * dpr));
  canvas.height = Math.floor(logicalHeight * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: canvas.width / dpr, height: canvas.height / dpr };
}

function drawLine(ctx, points, color, width = 2) {
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    if (!Number.isFinite(y)) return;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawGrid(ctx, width, height, padding) {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + ((height - padding.top - padding.bottom) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }
}

function drawPrice() {
  const { ctx, width, height } = fitCanvas(el.priceChart);
  const padding = { left: 54, right: 18, top: 20, bottom: 32 };
  const candles = state.candles.slice(-100);
  const offset = state.candles.length - candles.length;
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const extra = [state.indicators.ema20, state.indicators.ema50, state.indicators.bb.upper, state.indicators.bb.lower]
    .flatMap((series) => series.slice(offset).filter(Number.isFinite));
  const max = Math.max(...highs, ...extra);
  const min = Math.min(...lows, ...extra);
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const x = (i) => padding.left + (i / Math.max(1, candles.length - 1)) * innerW;
  const y = (value) => padding.top + ((max - value) / Math.max(0.001, max - min)) * innerH;
  drawGrid(ctx, width, height, padding);
  ctx.font = "12px system-ui";
  ctx.fillStyle = "rgba(244,247,246,0.74)";
  [max, (max + min) / 2, min].forEach((value) => ctx.fillText(money.format(value), 8, y(value) + 4));
  const candleWidth = Math.max(4, Math.min(10, innerW / candles.length - 2));
  candles.forEach((candle, i) => {
    const isUp = candle.close >= candle.open;
    const cx = x(i);
    ctx.strokeStyle = isUp ? "#2af598" : "#ff4d6d";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(cx, y(candle.high));
    ctx.lineTo(cx, y(candle.low));
    ctx.stroke();
    const top = y(Math.max(candle.open, candle.close));
    const bottom = y(Math.min(candle.open, candle.close));
    ctx.fillRect(cx - candleWidth / 2, top, candleWidth, Math.max(2, bottom - top));
  });
  const seriesPoints = (series) => series.slice(offset).map((value, i) => [x(i), value == null ? NaN : y(value)]);
  drawLine(ctx, seriesPoints(state.indicators.bb.upper), "rgba(167,139,250,0.55)", 1.4);
  drawLine(ctx, seriesPoints(state.indicators.bb.lower), "rgba(167,139,250,0.55)", 1.4);
  drawLine(ctx, seriesPoints(state.indicators.ema20), "#50d5ff", 2);
  drawLine(ctx, seriesPoints(state.indicators.ema50), "#ffca3a", 2);
}

function drawOscillator(canvas, series, options = {}) {
  const { ctx, width, height } = fitCanvas(canvas);
  const padding = { left: 38, right: 14, top: 12, bottom: 20 };
  const data = series.slice(-100);
  const min = options.min ?? Math.min(...data.filter(Number.isFinite), 0);
  const max = options.max ?? Math.max(...data.filter(Number.isFinite), 1);
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const x = (i) => padding.left + (i / Math.max(1, data.length - 1)) * innerW;
  const y = (value) => padding.top + ((max - value) / Math.max(0.001, max - min)) * innerH;
  drawGrid(ctx, width, height, padding);
  if (options.levels) {
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    options.levels.forEach((level) => {
      ctx.beginPath();
      ctx.moveTo(padding.left, y(level));
      ctx.lineTo(width - padding.right, y(level));
      ctx.stroke();
    });
  }
  drawLine(ctx, data.map((value, i) => [x(i), value == null ? NaN : y(value)]), options.color || "#50d5ff", 2);
}

function drawMacd() {
  const { ctx, width, height } = fitCanvas(el.macdChart);
  const padding = { left: 38, right: 14, top: 12, bottom: 20 };
  const hist = state.indicators.macd.hist.slice(-100);
  const line = state.indicators.macd.line.slice(-100);
  const signal = state.indicators.macd.signal.slice(-100);
  const max = Math.max(...hist.map(Math.abs), ...line.map(Math.abs), 0.1);
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const x = (i) => padding.left + (i / Math.max(1, hist.length - 1)) * innerW;
  const y = (value) => padding.top + ((max - value) / (max * 2)) * innerH;
  drawGrid(ctx, width, height, padding);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.moveTo(padding.left, y(0));
  ctx.lineTo(width - padding.right, y(0));
  ctx.stroke();
  const barW = Math.max(2, innerW / hist.length - 2);
  hist.forEach((value, i) => {
    ctx.fillStyle = value >= 0 ? "rgba(42,245,152,0.78)" : "rgba(255,77,109,0.78)";
    ctx.fillRect(x(i) - barW / 2, Math.min(y(0), y(value)), barW, Math.max(1, Math.abs(y(value) - y(0))));
  });
  drawLine(ctx, line.map((value, i) => [x(i), y(value)]), "#50d5ff", 2);
  drawLine(ctx, signal.map((value, i) => [x(i), y(value)]), "#ffca3a", 2);
}

function renderWatchlist() {
  const sorted = [...state.quotes].sort((a, b) => (b.regularMarketVolume || 0) - (a.regularMarketVolume || 0));
  const filtered = sorted.filter((quote) => {
    if (state.activeList === "bullish") return quote.regularMarketChangePercent >= 0;
    if (state.activeList === "bearish") return quote.regularMarketChangePercent < 0;
    return true;
  }).slice(0, 10);
  el.watchlist.innerHTML = filtered.map((quote) => {
    const move = quote.regularMarketChangePercent || 0;
    return `
      <button class="stock-row ${quote.symbol === state.symbol ? "active" : ""}" type="button" data-symbol="${quote.symbol}">
        <span>
          <span class="ticker">${quote.symbol} <span class="company">${quote.shortName || quote.symbol}</span></span>
          <span class="company">Vol ${compact.format(quote.regularMarketVolume || 0)} | Cap ${quote.marketCap ? compact.format(quote.marketCap) : "n/a"}</span>
        </span>
        <span>
          <span class="quote-move ${move >= 0 ? "up" : "down"}">${move >= 0 ? "+" : ""}${move.toFixed(2)}%</span>
          <span class="company">${money.format(quote.regularMarketPrice || 0)}</span>
        </span>
      </button>`;
  }).join("");
}

function renderSignal() {
  const summary = signalScore(state.candles, state.indicators);
  const quote = state.quotes.find((item) => item.symbol === state.symbol);
  document.body.classList.remove("theme-bullish", "theme-bearish", "theme-confirm");
  document.body.classList.add(summary.direction === "sell" ? "theme-bearish" : summary.direction === "watch" ? "theme-confirm" : "theme-bullish");
  el.activeSymbol.textContent = `${state.symbol}${quote ? ` / ${quote.shortName}` : ""}`;
  el.chartTitle.textContent = `${state.symbol} Price Action`;
  el.signalScore.textContent = summary.score;
  el.scoreRing.style.background = `conic-gradient(${summary.direction === "sell" ? "var(--red)" : summary.direction === "watch" ? "var(--amber)" : "var(--green)"} ${summary.score * 3.6}deg, rgba(255,255,255,0.08) 0deg)`;
  el.signalBadge.className = `badge ${summary.direction}`;
  el.signalBadge.textContent = summary.direction === "buy" ? "Bullish setup" : summary.direction === "sell" ? "Bearish setup" : "Wait for confirmation";
  el.signalTitle.textContent = summary.direction === "buy" ? "Momentum favors the long side" : summary.direction === "sell" ? "Pressure favors the short side" : "Mixed signal, size down";
  el.signalReason.textContent = `Close ${money.format(summary.close)} vs EMA20 ${money.format(summary.ema20)} and EMA50 ${money.format(summary.ema50)}. The score blends trend, RSI, MACD, VWAP, and ATR risk.`;
  el.rsiValue.textContent = summary.rsiNow.toFixed(1);
  el.macdValue.textContent = summary.macdHist >= 0 ? "Bullish" : "Bearish";
  el.trendValue.textContent = summary.ema20 > summary.ema50 ? "Uptrend" : "Downtrend";
  el.atrValue.textContent = `${((summary.atrNow / summary.close) * 100).toFixed(1)}%`;
  const playbook = [
    summary.direction === "buy" ? "Prefer pullbacks that hold EMA 20 or reclaim VWAP with volume." : "Avoid chasing weakness; wait for failed bounces under EMA 20 or VWAP.",
    `Risk guide: ATR is ${money.format(summary.atrNow)}, so stops tighter than that may get shaken out.`,
    summary.rsiNow > 70 ? "RSI is hot. Let the first pullback prove buyers are still present." : summary.rsiNow < 35 ? "RSI is washed out. Shorts need confirmation because snapback risk is elevated." : "RSI is in a tradable middle zone, where trend confirmation matters most.",
    "No signal guarantees profit. Treat this as a decision aid, not financial advice.",
  ];
  el.playbook.innerHTML = playbook.map((item) => `<li>${item}</li>`).join("");
}

function renderCharts() {
  drawPrice();
  drawOscillator(el.rsiChart, state.indicators.rsi14, { min: 0, max: 100, levels: [30, 70], color: "#a78bfa" });
  drawMacd();
}

async function fetchQuotes() {
  const response = await fetch("/api/market");
  const data = await response.json();
  state.quotes = data.quotes || [];
  renderWatchlist();
}

async function loadMarket() {
  el.dataSource.textContent = "Loading movers";
  await fetchQuotes();
  const firstBull = state.quotes.find((quote) => quote.regularMarketChangePercent >= 0);
  await loadChart(firstBull?.symbol || state.quotes[0]?.symbol || state.symbol);
}

async function loadChart(symbol) {
  state.symbol = symbol.toUpperCase().trim();
  el.symbolInput.value = state.symbol;
  el.dataSource.textContent = "Loading chart";
  renderWatchlist();
  const response = await fetch(`/api/chart?symbol=${encodeURIComponent(state.symbol)}`);
  const data = await response.json();
  state.candles = data.candles;
  state.indicators = computeIndicators(state.candles);
  el.dataSource.textContent = data.stale ? `${data.source}` : `${data.source} live`;
  renderSignal();
  renderCharts();
  markUpdated();
}

el.watchlist.addEventListener("click", (event) => {
  const button = event.target.closest("[data-symbol]");
  if (button) loadChart(button.dataset.symbol);
});

el.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.activeList = tab.dataset.list;
    el.tabs.forEach((item) => item.classList.toggle("active", item === tab));
    renderWatchlist();
  });
});

let searchTimer = null;
let searchMatches = [];
let activeMatch = -1;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function hideSearchResults() {
  el.searchResults.hidden = true;
  el.searchResults.innerHTML = "";
  el.symbolInput.setAttribute("aria-expanded", "false");
  searchMatches = [];
  activeMatch = -1;
}

function renderSearchResults() {
  if (!searchMatches.length) {
    hideSearchResults();
    return;
  }
  el.searchResults.innerHTML = searchMatches.map((item, i) => `
    <li role="option">
      <button type="button" class="search-result" data-symbol="${escapeHtml(item.symbol)}" data-index="${i}">
        <span class="result-symbol">${escapeHtml(item.symbol)}</span>
        <span class="result-name">${escapeHtml(item.shortName)}</span>
        <span class="result-exch">${escapeHtml(item.exchange)}</span>
      </button>
    </li>`).join("");
  el.searchResults.hidden = false;
  el.symbolInput.setAttribute("aria-expanded", "true");
}

function moveActiveMatch(delta) {
  if (!searchMatches.length) return;
  activeMatch = (activeMatch + delta + searchMatches.length) % searchMatches.length;
  el.searchResults.querySelectorAll(".search-result").forEach((button, i) => {
    button.classList.toggle("active", i === activeMatch);
  });
}

async function runSearch(query) {
  const term = query.trim();
  if (!term) {
    hideSearchResults();
    return;
  }
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
    const data = await response.json();
    if (el.symbolInput.value.trim() !== term) return; // input moved on; ignore stale response
    searchMatches = data.quotes || [];
    activeMatch = -1;
    renderSearchResults();
  } catch {
    hideSearchResults();
  }
}

async function submitSearch() {
  const value = el.symbolInput.value.trim();
  if (!value) return;
  if (searchMatches.length) {
    const choice = searchMatches[activeMatch >= 0 ? activeMatch : 0];
    hideSearchResults();
    loadChart(choice.symbol);
    return;
  }
  // No live suggestions (e.g. typed fast then hit Enter): resolve once, else try the raw text.
  hideSearchResults();
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
    const data = await response.json();
    loadChart(data.quotes?.[0]?.symbol || value);
  } catch {
    loadChart(value);
  }
}

el.loadSymbol.addEventListener("click", submitSearch);
el.symbolInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(el.symbolInput.value), 180);
});
el.symbolInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitSearch();
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    moveActiveMatch(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveActiveMatch(-1);
  } else if (event.key === "Escape") {
    hideSearchResults();
  }
});
el.searchResults.addEventListener("click", (event) => {
  const button = event.target.closest("[data-symbol]");
  if (!button) return;
  hideSearchResults();
  loadChart(button.dataset.symbol);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-field")) hideSearchResults();
});
el.refreshMarket.addEventListener("click", loadMarket);
window.addEventListener("resize", () => {
  if (state.candles.length) renderCharts();
});

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const REFRESH_BUFFER_MS = 8 * 1000;
let refreshTimer = null;

function markUpdated() {
  if (!el.refreshStatus) return;
  const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  el.refreshStatus.textContent = `Auto-refresh every 5 min · updated ${time}`;
}

async function autoRefresh() {
  if (state.refreshing) return;
  state.refreshing = true;
  el.refreshStatus?.classList.add("refreshing");
  try {
    await fetchQuotes();
    if (state.symbol) await loadChart(state.symbol);
  } catch (error) {
    // Keep the current view; the next cycle will retry.
  } finally {
    state.refreshing = false;
    el.refreshStatus?.classList.remove("refreshing");
  }
}

// Fire just after each wall-clock 5-minute boundary so the freshly closed
// Yahoo candle is available before we re-fetch.
function scheduleAutoRefresh() {
  const now = Date.now();
  const nextBoundary = Math.ceil(now / REFRESH_INTERVAL_MS) * REFRESH_INTERVAL_MS + REFRESH_BUFFER_MS;
  const delay = Math.max(1000, nextBoundary - now);
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    await autoRefresh();
    scheduleAutoRefresh();
  }, delay);
}

// Catch up immediately when the user returns to a backgrounded tab.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    autoRefresh().then(scheduleAutoRefresh);
  }
});

const INDICATOR_INFO = {
  rsi: {
    name: "RSI · Relative Strength Index",
    what: "A momentum oscillator (0–100) that measures the speed and size of recent price moves.",
    how: "Above 70 is overbought (pullback risk); below 30 is oversold (bounce potential). The 40–60 band is neutral trend. RSI moving opposite to price (divergence) can warn of a reversal.",
  },
  macd: {
    name: "MACD · Moving Average Convergence Divergence",
    what: "A trend-momentum tool: the gap between the 12- and 26-period EMAs, smoothed by a 9-period signal line, plotted as a histogram.",
    how: "MACD line crossing above the signal line is bullish; crossing below is bearish. Histogram bars growing above zero show building upside momentum; below zero shows downside pressure.",
  },
  ema: {
    name: "EMA · Exponential Moving Average",
    what: "A moving average that weights recent prices more heavily, so it turns faster than a simple average.",
    how: "Price above a rising EMA signals an uptrend; below a falling EMA signals a downtrend. When the fast EMA (20) crosses above the slow EMA (50) it is a bullish 'golden cross'; the reverse is a bearish 'death cross'.",
  },
  bollinger: {
    name: "Bollinger Bands",
    what: "A volatility envelope: a 20-period average (middle band) with upper and lower bands set two standard deviations away.",
    how: "Bands widen as volatility rises and pinch ('squeeze') before big moves. Price hugging the upper band shows strength; riding the lower band shows weakness. Outer-band tags can mark stretched, snap-back-prone conditions.",
  },
  atr: {
    name: "ATR · Average True Range",
    what: "A volatility gauge that averages the true price range over 14 periods. It measures size of moves, not direction.",
    how: "Higher ATR means bigger swings. Use it to size stop-losses (e.g. place stops beyond 1–2× ATR) and judge risk. Rising ATR flags expanding volatility; falling ATR flags a calming market.",
  },
  trend: {
    name: "Trend · EMA 20 vs EMA 50",
    what: "Compares the fast EMA (20) against the slow EMA (50) to classify the prevailing direction.",
    how: "EMA 20 above EMA 50 reads as an uptrend (favor longs); EMA 20 below EMA 50 reads as a downtrend (favor caution or shorts). The wider the gap, the stronger the trend.",
  },
};

const infoTip = document.createElement("div");
infoTip.className = "indicator-tooltip";
infoTip.id = "indicatorTooltip";
infoTip.setAttribute("role", "tooltip");
infoTip.hidden = true;
document.body.appendChild(infoTip);
let infoTarget = null;

function positionTooltip(target) {
  const rect = target.getBoundingClientRect();
  const tip = infoTip.getBoundingClientRect();
  const margin = 10;
  let left = rect.left + rect.width / 2 - tip.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - tip.width - margin));
  let top = rect.top - tip.height - margin;
  if (top < margin) top = rect.bottom + margin;
  infoTip.style.left = `${left}px`;
  infoTip.style.top = `${top}px`;
}

function showInfo(target) {
  const info = INDICATOR_INFO[target.dataset.info];
  if (!info) return;
  infoTarget = target;
  infoTip.innerHTML = `
    <p class="tip-name">${info.name}</p>
    <p class="tip-what">${info.what}</p>
    <p class="tip-label">How to use it</p>
    <p class="tip-how">${info.how}</p>`;
  infoTip.hidden = false;
  target.setAttribute("aria-describedby", infoTip.id);
  positionTooltip(target);
}

function hideInfo() {
  if (!infoTarget) return;
  infoTarget.removeAttribute("aria-describedby");
  infoTarget = null;
  infoTip.hidden = true;
}

document.addEventListener("mouseover", (event) => {
  const target = event.target.closest("[data-info]");
  if (target) showInfo(target);
});
document.addEventListener("mouseout", (event) => {
  const target = event.target.closest("[data-info]");
  if (target && !target.contains(event.relatedTarget)) hideInfo();
});
document.addEventListener("focusin", (event) => {
  const target = event.target.closest("[data-info]");
  if (target) showInfo(target);
});
document.addEventListener("focusout", (event) => {
  if (event.target.closest("[data-info]")) hideInfo();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideInfo();
});
window.addEventListener("scroll", hideInfo, true);
window.addEventListener("resize", hideInfo);

loadMarket()
  .catch((error) => {
    el.signalTitle.textContent = "Could not load market data";
    el.signalReason.textContent = error.message;
  })
  .finally(scheduleAutoRefresh);
