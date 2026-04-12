// ============================================================
// HENRYDESK — Fibonacci Analysis + Enrichment
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
  if (slDistance === 0) return null;

  const rr = tpDistance / slDistance;
  const positionSize = riskAmount / slDistance;
  const potentialWin = parseFloat((tpDistance * positionSize).toFixed(2));
  const potentialLoss = parseFloat((slDistance * positionSize).toFixed(2));
  const leverage = Math.max(2, Math.min(20, Math.round(entry / slDistance)));

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
    potentialWin,
    potentialLoss,
    leverage,
    slPercent: parseFloat(((slDistance / entry) * 100).toFixed(1)),
    tpPercent: parseFloat(((tpDistance / entry) * 100).toFixed(1)),
  };
}

/**
 * Generate analysis thesis for a Fibo alert (legacy — kept for compat)
 */
function generateThesis(symbol, tf, fiboLevel, swingHigh, swingLow, currentPrice, side) {
  const fiboName = {
    '0.236': '23.6% (faible retracement)',
    '0.382': '38.2% (retracement modéré)',
    '0.5':   '50% (retracement médian)',
    '0.618': '61.8% (golden ratio)',
    '0.786': '78.6% (retracement profond)',
  };
  const tfName = { '1h': '1H', '4h': '4H', '1d': 'Daily', '1w': 'Weekly' };
  const tfImportance = { '1d': 'majeur', '4h': 'intermédiaire', '1h': 'court terme' };

  const levelName = fiboName[fiboLevel.level] || fiboLevel.label;
  const tfLabel = tfName[tf] || tf;
  const importance = tfImportance[tf] || '';
  const range = Math.abs(swingHigh - swingLow);
  const rangePercent = ((range / swingLow) * 100).toFixed(1);

  const thesis =
    `${symbol} a touché le Fibonacci ${levelName} sur le ${tfLabel} (niveau ${importance}).` +
    ` Le prix évolue entre $${swingLow.toFixed(2)} (swing low) et $${swingHigh.toFixed(2)} (swing high),` +
    ` soit un range de ${rangePercent}%.` +
    ` Position ${side.toUpperCase()} proposée sur réaction au niveau Fibo.`;

  return thesis;
}

/**
 * Estimate trade duration based on timeframe
 */
function estimateDuration(tf) {
  const estimates = {
    '1h': '4-24h',
    '4h': '1-3 jours',
    '1d': '3-10 jours',
    '1w': '2-6 semaines',
  };
  return estimates[tf] || '1-5 jours';
}

// ═══════════════════════════════════════════════════════════════
// Analysis Enrichment — Trend, Volume, Scoring, Thesis
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate EMA (Exponential Moving Average)
 */
function calcEMA(candles, period) {
  if (candles.length < period) return candles.map(c => c.close);
  const k = 2 / (period + 1);
  const ema = [candles[0].close];
  for (let i = 1; i < candles.length; i++) {
    ema.push(candles[i].close * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

/**
 * Analyze trend direction using EMA
 * Returns: { trend, emoji, aboveEma, emaValue, slope, period }
 */
function analyzeTrend(candles, period = 20) {
  if (candles.length < period + 5) {
    return { trend: 'unknown', emoji: '⚪', aboveEma: null, emaValue: null, slope: 0, period };
  }
  const ema = calcEMA(candles, period);
  const lastPrice = candles[candles.length - 1].close;
  const lastEma = ema[ema.length - 1];
  const prevEma = ema[Math.max(0, ema.length - 6)];
  const slope = (lastEma - prevEma) / prevEma;
  const aboveEma = lastPrice > lastEma;
  const rising = slope > 0;

  let trend, emoji;
  if (aboveEma && rising) { trend = 'bullish'; emoji = '🟢'; }
  else if (!aboveEma && !rising) { trend = 'bearish'; emoji = '🔴'; }
  else if (!aboveEma && rising) { trend = 'pullback'; emoji = '🟡'; }
  else { trend = 'correction'; emoji = '🟡'; }

  return { trend, emoji, aboveEma, emaValue: parseFloat(lastEma.toFixed(2)), slope, period };
}

/**
 * Analyze volume vs recent average
 * Returns: { aboveAvg, ratio, percent, emoji }
 */
function analyzeVolume(candles, lookback = 20) {
  if (candles.length < lookback + 1) return { aboveAvg: false, ratio: 1, percent: 0, emoji: '➖' };
  const recent = candles.slice(-(lookback + 1), -1);
  const avgVol = recent.reduce((s, c) => s + c.volume, 0) / recent.length;
  const lastVol = candles[candles.length - 1].volume;
  if (avgVol === 0) return { aboveAvg: false, ratio: 1, percent: 0, emoji: '➖' };
  const ratio = lastVol / avgVol;
  const emoji = ratio >= 1.5 ? '🔥' : ratio >= 1.1 ? '📈' : ratio >= 0.8 ? '➖' : '📉';
  return {
    aboveAvg: ratio >= 1.0,
    ratio: parseFloat(ratio.toFixed(2)),
    percent: Math.round((ratio - 1) * 100),
    emoji,
  };
}

/**
 * Score a trade setup (0-100) → Grade A/B/C/D
 *
 * Scoring breakdown:
 *   Fibo level quality   → max 30 (0.618=30, 0.786=25, 0.5=20, 0.382=15, 0.236=10)
 *   Trend alignment      → max 25 (higher TF trend matches trade direction)
 *   EMA confirmation     → max 15 (higher TF EMA slope supports trade)
 *   R:R quality          → max 15 (≥3=15, ≥2.5=12, ≥2=8, <2=5)
 *   Volume               → max 10 (above 20-bar average)
 *   Multi-TF confluence  → max 5  (higher TF data available & supports)
 */
function scoreSetup({ fiboLevel, trendAligned, emaConfirm, rr, volumeAboveAvg, hasConfluence }) {
  let score = 0;
  const breakdown = [];

  // Fibo level (max 30)
  const fiboScores = { 0.618: 30, 0.786: 25, 0.5: 20, 0.382: 15, 0.236: 10 };
  const fs = fiboScores[fiboLevel] || 15;
  score += fs;
  breakdown.push({ name: 'Fibo', pts: fs, max: 30 });

  // Trend alignment (max 25)
  const ts = trendAligned ? 25 : 0;
  score += ts;
  breakdown.push({ name: 'Trend', pts: ts, max: 25 });

  // EMA confirmation (max 15)
  const es = emaConfirm ? 15 : 0;
  score += es;
  breakdown.push({ name: 'EMA', pts: es, max: 15 });

  // R:R quality (max 15)
  const rs = rr >= 3 ? 15 : rr >= 2.5 ? 12 : rr >= 2 ? 8 : 5;
  score += rs;
  breakdown.push({ name: 'R:R', pts: rs, max: 15 });

  // Volume (max 10)
  const vs = volumeAboveAvg ? 10 : 0;
  score += vs;
  breakdown.push({ name: 'Vol', pts: vs, max: 10 });

  // Confluence bonus (max 5)
  const cs = hasConfluence ? 5 : 0;
  score += cs;
  if (hasConfluence) breakdown.push({ name: 'Confluence', pts: cs, max: 5 });

  let grade, emoji;
  if (score >= 80) { grade = 'A'; emoji = '🟢'; }
  else if (score >= 65) { grade = 'B'; emoji = '🟡'; }
  else if (score >= 50) { grade = 'C'; emoji = '🟠'; }
  else { grade = 'D'; emoji = '🔴'; }

  return { score, grade, emoji, breakdown };
}

/**
 * Build enriched thesis from full analysis context
 */
function buildThesis({ symbol, tf, fiboLevel, side, trend, higherTfTrend, higherTf, volume }) {
  const fiboNames = {
    0.236: 'faible retracement (23.6%)',
    0.382: 'retracement modéré (38.2%)',
    0.5: 'retracement médian (50%)',
    0.618: 'golden ratio (61.8%)',
    0.786: 'retracement profond (78.6%)',
  };
  const tfNames = { '1h': '1H', '4h': '4H', '1d': 'Daily' };
  const lines = [];

  lines.push(`${symbol} touche le Fibo ${fiboNames[fiboLevel] || fiboLevel}.`);

  if (higherTfTrend && higherTf) {
    const htf = tfNames[higherTf] || higherTf;
    if (side === 'long' && higherTfTrend.trend === 'bullish') {
      lines.push(`Correction dans un uptrend ${htf} confirmé — on joue le rebond dans le sens du mouvement.`);
    } else if (side === 'short' && higherTfTrend.trend === 'bearish') {
      lines.push(`Rebond technique dans un downtrend ${htf} — continuation baissière attendue.`);
    } else if (side === 'long' && (higherTfTrend.trend === 'bearish' || higherTfTrend.trend === 'correction')) {
      lines.push(`Contre-tendance : le ${htf} reste baissier. Prudence accrue.`);
    } else if (side === 'short' && (higherTfTrend.trend === 'bullish' || higherTfTrend.trend === 'pullback')) {
      lines.push(`Contre-tendance : le ${htf} reste haussier. Prudence accrue.`);
    }
  }

  if (fiboLevel === 0.618) lines.push(`Le golden ratio offre le meilleur taux de réaction historique.`);
  else if (fiboLevel === 0.786) lines.push(`Retracement profond — meilleur R:R mais risque de cassure accru.`);
  else if (fiboLevel === 0.5) lines.push(`Niveau médian psychologique — zone de décision fréquente.`);

  if (volume && volume.aboveAvg && volume.percent > 10) {
    lines.push(`Volume en hausse (+${volume.percent}%) — participation confirmée.`);
  } else if (volume && !volume.aboveAvg) {
    lines.push(`Volume sous la moyenne — surveiller la confirmation.`);
  }

  return lines.join(' ');
}

module.exports = {
  detectSwings,
  getLatestSwings,
  calcFiboLevels,
  checkFiboTouch,
  generateProposal,
  generateThesis,
  estimateDuration,
  calcEMA,
  analyzeTrend,
  analyzeVolume,
  scoreSetup,
  buildThesis,
};
