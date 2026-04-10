// ============================================================
// HENRYDESK — Fibonacci Analysis
// ============================================================

/**
 * Detect swing high/low from OHLCV candles
 * Uses a simple N-bar pivot detection
 */
function detectSwings(candles, lookback = 5) {
  const swingHighs = [];
  const swingLows = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const high = candles[i].high;
    const low = candles[i].low;

    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= high || candles[i + j].high >= high) isSwingHigh = false;
      if (candles[i - j].low <= low || candles[i + j].low <= low) isSwingLow = false;
    }

    if (isSwingHigh) swingHighs.push({ index: i, price: high, time: candles[i].time });
    if (isSwingLow) swingLows.push({ index: i, price: low, time: candles[i].time });
  }

  return { swingHighs, swingLows };
}

/**
 * Get the most recent significant swing high and swing low
 */
function getLatestSwings(candles, lookback = 5) {
  const { swingHighs, swingLows } = detectSwings(candles, lookback);

  const lastSwingHigh = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1] : null;
  const lastSwingLow = swingLows.length > 0 ? swingLows[swingLows.length - 1] : null;

  return { swingHigh: lastSwingHigh, swingLow: lastSwingLow };
}

/**
 * Calculate Fibonacci retracement levels between two prices
 */
function calcFiboLevels(swingHigh, swingLow, levels = [0.236, 0.382, 0.5, 0.618, 0.786]) {
  const diff = swingHigh - swingLow;
  const isUptrend = true; // retracement from high to low

  return levels.map(level => ({
    level,
    price: swingHigh - (diff * level),
    label: `${(level * 100).toFixed(1)}%`,
  }));
}

/**
 * Check if current price is near a Fibonacci level
 */
function checkFiboTouch(currentPrice, fiboLevels, tolerancePercent = 0.3) {
  const touched = [];

  for (const fibo of fiboLevels) {
    const tolerance = fibo.price * (tolerancePercent / 100);
    if (Math.abs(currentPrice - fibo.price) <= tolerance) {
      touched.push({
        ...fibo,
        distance: Math.abs(currentPrice - fibo.price),
        distancePercent: ((Math.abs(currentPrice - fibo.price) / fibo.price) * 100).toFixed(3),
      });
    }
  }

  return touched;
}

/**
 * Generate trade proposal based on Fibo level touch
 */
function generateProposal(symbol, currentPrice, fiboLevel, swingHigh, swingLow, riskAmount = 500) {
  const diff = swingHigh - swingLow;
  const isBuyZone = fiboLevel.level >= 0.5; // 0.5, 0.618, 0.786 = buy zones
  const side = isBuyZone ? 'long' : 'short';

  let entry, sl, tp;

  if (side === 'long') {
    entry = currentPrice;
    sl = swingLow * 0.995; // SL just below swing low
    tp = swingHigh * 1.005; // TP just above swing high
  } else {
    entry = currentPrice;
    sl = swingHigh * 1.005;
    tp = swingLow * 0.995;
  }

  const slDistance = Math.abs(entry - sl);
  const tpDistance = Math.abs(tp - entry);
  const rr = tpDistance / slDistance;
  const positionSize = riskAmount / slDistance;

  return {
    symbol,
    side,
    entry: parseFloat(entry.toFixed(6)),
    sl: parseFloat(sl.toFixed(6)),
    tp: parseFloat(tp.toFixed(6)),
    risk: riskAmount,
    positionSize: parseFloat(positionSize.toFixed(4)),
    rr: parseFloat(rr.toFixed(2)),
    fiboLevel: fiboLevel.label,
  };
}

module.exports = {
  detectSwings,
  getLatestSwings,
  calcFiboLevels,
  checkFiboTouch,
  generateProposal,
};
