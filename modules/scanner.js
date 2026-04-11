// ============================================================
// HENRYDESK — Market Scanner
// Polls watchlist assets, checks Fibonacci levels, triggers alerts
// ============================================================

const { getLatestSwings, calcFiboLevels, checkFiboTouch, generateProposal } = require('./fibonacci');
const { sendTradeAlert } = require('./telegram');
const { captureCharts } = require('./chart');
const { saveData } = require('./watchlist');

let _S = null;
let _config = null;
let scanInterval = null;

// Track recently alerted levels to avoid spam
const alertedLevels = new Map(); // key: `${symbol}_${tf}_${level}` → timestamp

function startScanner(S, config) {
  _S = S;
  _config = config;

  console.log(`🔍 Scanner started — interval: ${config.scanIntervalMs / 1000}s`);

  // Initial scan after 10s
  setTimeout(() => runScan(), 10_000);

  // Regular scan loop
  scanInterval = setInterval(() => runScan(), config.scanIntervalMs);
}

async function runScan() {
  if (_S.watchlist.length === 0) return;

  for (const item of _S.watchlist) {
    try {
      await scanSymbol(item.symbol);
    } catch (err) {
      console.error(`⚠️  Scan error for ${item.symbol}:`, err.message);
    }
  }
}

async function scanSymbol(symbol) {
  for (const tf of _config.fibonacci.timeframes) {
    try {
      // Fetch OHLCV candles from Hyperliquid
      const candles = await fetchCandles(symbol, tf);
      if (!candles || candles.length < 50) continue;

      // Detect swings (check for manual override)
      const watchItem = _S.watchlist.find(w => w.symbol === symbol);
      let swingHigh, swingLow;

      if (watchItem?.swingOverride?.[tf]) {
        swingHigh = watchItem.swingOverride[tf].high;
        swingLow = watchItem.swingOverride[tf].low;
      } else {
        const swings = getLatestSwings(candles, 5);
        if (!swings.swingHigh || !swings.swingLow) continue;
        swingHigh = swings.swingHigh.price;
        swingLow = swings.swingLow.price;
      }

      // Calculate Fibonacci levels
      const fiboLevels = calcFiboLevels(swingHigh, swingLow, _config.fibonacci.levels);

      // Check current price against Fibo levels
      const currentPrice = candles[candles.length - 1].close;
      const touched = checkFiboTouch(currentPrice, fiboLevels);

      for (const touch of touched) {
        const alertKey = `${symbol}_${tf}_${touch.level}`;

        // Cooldown: don't re-alert same level within 4 hours
        const lastAlert = alertedLevels.get(alertKey);
        if (lastAlert && Date.now() - lastAlert < 4 * 60 * 60 * 1000) continue;

        // Check max concurrent positions
        if (_S.activePositions.length >= _config.trading.maxConcurrentTrades) {
          console.log(`⚠️  Max positions reached — skipping ${symbol} alert`);
          continue;
        }

        // Generate trade proposal
        const proposal = generateProposal(
          symbol, currentPrice, touch,
          swingHigh, swingLow,
          _config.trading.riskPerTrade
        );

        // Only alert if R:R >= 1.5
        if (proposal.rr < 1.5) continue;

        // Capture both chart screenshots
        const charts = await captureCharts(symbol, tf, candles, fiboLevels, swingHigh, swingLow, proposal);

        // Create alert
        const alert = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          symbol,
          tf,
          fiboLevel: touch.label,
          proposal,
          macroChartPath: charts.macroPath,
          tradeChartPath: charts.tradePath,
          sentAt: new Date().toISOString(),
          approved: false,
        };

        _S.pendingAlerts.push(alert);
        alertedLevels.set(alertKey, Date.now());

        // Send to Telegram
        await sendTradeAlert(alert);
        console.log(`🎯 Alert sent: ${symbol} ${tf} — Fibo ${touch.label}`);

        saveData();
      }
    } catch (err) {
      console.error(`⚠️  Scan ${symbol}/${tf} error:`, err.message);
    }
  }
}

/**
 * Fetch OHLCV candles from Hyperliquid API
 */
async function fetchCandles(symbol, timeframe) {
  const tfMap = { '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' };
  const interval = tfMap[timeframe] || '1d';

  try {
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: {
          coin: symbol.replace('USDT', '').replace('USD', ''),
          interval,
          startTime: Date.now() - (200 * intervalToMs(interval)),
          endTime: Date.now(),
        },
      }),
    });

    const data = await response.json();

    if (!Array.isArray(data)) return null;

    return data.map(c => ({
      time: c.t,
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
      volume: parseFloat(c.v),
    }));
  } catch (err) {
    console.error(`❌ Failed to fetch candles for ${symbol}:`, err.message);
    return null;
  }
}

function intervalToMs(interval) {
  const map = { '1h': 3600000, '4h': 14400000, '1d': 86400000, '1w': 604800000 };
  return map[interval] || 86400000;
}

function stopScanner() {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
}

module.exports = { startScanner, stopScanner };
