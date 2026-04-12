// ============================================================
// HENRYDESK — Market Scanner
// Uses MANUAL fibo levels (user-defined) — alerts when price touches
// ============================================================

const {
  getLatestSwings, calcFiboLevels, checkFiboTouch,
  generateProposal, estimateDuration,
  analyzeTrend, analyzeVolume, scoreSetup, buildThesis,
} = require('./fibonacci');
const { sendTradeAlert, sendMessage } = require('./telegram');
const { captureCharts } = require('./chart');
const { saveData } = require('./watchlist');

let _S = null;
let _config = null;
let scanInterval = null;

// Cooldown tracker — avoid spamming same level
const alertedLevels = new Map(); // key: `${coin}_${tf}_${level}` → timestamp

const HIGHER_TF = { '1h': '4h', '4h': '1d', '1d': null };
const EMA_PERIODS = { '1h': 20, '4h': 20, '1d': 50 };

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

  // Check fibo expiry reminders before scanning
  checkFiboExpiry();

  for (const item of _S.watchlist) {
    try {
      await scanSymbol(item.symbol);
    } catch (err) {
      console.error(`⚠️  Scan error for ${item.symbol}:`, err.message);
    }
  }
}

// ═══ Fibo Expiry Reminders ═══

function checkFiboExpiry() {
  const now = Date.now();

  for (const [key, setup] of Object.entries(_S.fiboSetups || {})) {
    const setTime = new Date(setup.setAt).getTime();
    const expireTime = new Date(setup.expiresAt).getTime();
    const totalDuration = expireTime - setTime;
    const elapsed = now - setTime;
    const tfLabel = { '1h': '1H', '4h': '4H', '1d': 'Daily' }[setup.tf] || setup.tf;

    // Reminder at 75% of lifetime
    if (elapsed >= totalDuration * 0.75 && !setup.reminderSent) {
      const daysLeft = Math.ceil((expireTime - now) / 86400000);
      sendMessage(
        `🔔 *Rappel Fibo*\n\n` +
        `Tes niveaux *${setup.symbol} ${tfLabel}* expirent dans ${daysLeft}j.\n` +
        `Vérifie si les swings sont toujours valides sur TradingView.\n\n` +
        `Actuels : \`$${fmtP(setup.swingHigh)}\` → \`$${fmtP(setup.swingLow)}\`\n` +
        `/fibo ${setup.symbol} ${setup.tf} HIGH LOW pour MAJ`
      );
      setup.reminderSent = true;
      saveData();
    }

    // Expiry notification
    if (now >= expireTime && !setup.expiredNotified) {
      sendMessage(
        `⚠️ *Fibo expiré*\n\n` +
        `*${setup.symbol} ${tfLabel}* — niveaux expirés, plus surveillés.\n` +
        `/fibo ${setup.symbol} ${setup.tf} HIGH LOW pour retracer`
      );
      setup.expiredNotified = true;
      saveData();
    }
  }
}

function fmtP(v) {
  if (v >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return v.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

// ═══ Symbol Scanner — Uses Manual Fibo Levels ═══

async function scanSymbol(symbol) {
  const coin = symbol.replace(/USDT$/i, '').replace(/USD$/i, '') || symbol;

  // ── Phase 1: Collect data only for TFs with active manual levels ──
  const tfData = {};

  for (const tf of _config.fibonacci.timeframes) {
    const setupKey = `${coin}_${tf}`;
    const manualSetup = (_S.fiboSetups || {})[setupKey];

    // Skip: no manual levels defined
    if (!manualSetup) continue;

    // Skip: levels expired
    if (new Date(manualSetup.expiresAt).getTime() < Date.now()) continue;

    try {
      const candles = await fetchCandles(symbol, tf);
      if (!candles || candles.length < 50) continue;

      // Use MANUAL fibo levels (user-defined swings)
      const { swingHigh, swingLow, levels: fiboLevels } = manualSetup;

      // Trend + volume analysis (still automatic)
      const emaPeriod = EMA_PERIODS[tf] || 20;
      const trend = analyzeTrend(candles, emaPeriod);
      const volume = analyzeVolume(candles);

      tfData[tf] = { candles, swingHigh, swingLow, fiboLevels, trend, volume };
    } catch (err) {
      console.error(`⚠️  Data collection ${coin}/${tf}:`, err.message);
    }
  }

  // ── Phase 2: Check for setups with full context ──
  for (const tf of _config.fibonacci.timeframes) {
    const data = tfData[tf];
    if (!data) continue;

    const { candles, swingHigh, swingLow, fiboLevels, trend, volume } = data;
    const currentPrice = candles[candles.length - 1].close;
    const touched = checkFiboTouch(currentPrice, fiboLevels);

    for (const touch of touched) {
      try {
        const alertKey = `${coin}_${tf}_${touch.level}`;

        // Cooldown: 4h per level
        const lastAlert = alertedLevels.get(alertKey);
        if (lastAlert && Date.now() - lastAlert < 4 * 3600000) continue;

        // Max positions
        if (_S.activePositions.length >= _config.trading.maxConcurrentTrades) {
          console.log(`⚠️  Max positions reached — skipping ${coin} alert`);
          continue;
        }

        // Generate proposal
        const proposal = generateProposal(coin, currentPrice, touch, swingHigh, swingLow, _config.trading.riskPerTrade);
        if (!proposal) continue;

        // R:R filter
        if (proposal.rr < (_config.trading.minRR || 2.0)) continue;

        // ── Contextual analysis ──
        const higherTf = HIGHER_TF[tf];
        const higherData = higherTf ? tfData[higherTf] : null;

        const trendAligned = higherData
          ? (proposal.side === 'long'
            ? ['bullish', 'pullback'].includes(higherData.trend.trend)
            : ['bearish', 'correction'].includes(higherData.trend.trend))
          : (proposal.side === 'long' ? trend.slope > 0 : trend.slope < 0);

        const emaConfirm = higherData
          ? (proposal.side === 'long' ? higherData.trend.slope > 0 : higherData.trend.slope < 0)
          : (proposal.side === 'long' ? trend.slope > 0 : trend.slope < 0);

        const setupScore = scoreSetup({
          fiboLevel: touch.level,
          trendAligned,
          emaConfirm,
          rr: proposal.rr,
          volumeAboveAvg: volume.aboveAvg,
          hasConfluence: !!higherData,
        });

        // Score filter
        if (setupScore.score < (_config.trading.minScore || 50)) {
          console.log(`⏭️  ${coin} ${tf} Fibo ${touch.label} — Grade ${setupScore.grade} (${setupScore.score}) — skipped`);
          continue;
        }

        // ── Build enriched alert ──
        const thesis = buildThesis({
          symbol: coin, tf, fiboLevel: touch.level, side: proposal.side,
          trend, higherTfTrend: higherData?.trend, higherTf, volume,
        });
        const duration = estimateDuration(tf);

        const charts = await captureCharts(coin, tf, candles, fiboLevels, swingHigh, swingLow, proposal);

        const alert = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          symbol: coin,
          tf,
          fiboLevel: touch.label,
          proposal,
          thesis,
          duration,
          context: {
            setupScore,
            trend,
            volume,
            higherTfTrend: higherData?.trend || null,
            higherTf,
            trendAligned,
            emaConfirm,
          },
          macroChartPath: charts.macroPath,
          tradeChartPath: charts.tradePath,
          sentAt: new Date().toISOString(),
          approved: false,
        };

        _S.pendingAlerts.push(alert);
        _S.alertHistory.push({ ...alert, macroChartPath: undefined, tradeChartPath: undefined, action: 'sent' });
        _S.stats.totalAlerts = (_S.stats.totalAlerts || 0) + 1;
        alertedLevels.set(alertKey, Date.now());

        await sendTradeAlert(alert);
        console.log(`🎯 Alert: ${coin} ${tf} Fibo ${touch.label} — Grade ${setupScore.grade} (${setupScore.score})`);

        saveData();
      } catch (err) {
        console.error(`⚠️  Alert ${coin}/${tf} error:`, err.message);
      }
    }
  }
}

// ═══ Hyperliquid Candle Fetcher ═══

async function fetchCandles(symbol, timeframe) {
  const tfMap = { '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' };
  const interval = tfMap[timeframe] || '1d';

  try {
    const coin = symbol.replace(/USDT$/i, '').replace(/USD$/i, '') || symbol;
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: {
          coin,
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
