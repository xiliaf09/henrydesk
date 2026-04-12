// ============================================================
// HENRYDESK — Telegram Bot Interface
// Manual Fibo management + Pro signal format + Quick Adjust
// ============================================================

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

let bot = null;
let _S = null;
let _config = null;
const _processedMsgs = new Set(); // anti-duplicate

// Fibo expiry durations per timeframe
const FIBO_EXPIRY_MS = { '1h': 3 * 86400000, '4h': 7 * 86400000, '1d': 21 * 86400000 };
const VALID_TFS = ['1h', '4h', '1d'];

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
function fmtP(v) {
  if (v >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return v.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function initTelegram(S, config) {
  _S = S;
  _config = config;

  bot = new TelegramBot(config.telegramToken, {
    polling: {
      interval: 2000,
      autoStart: true,
      params: { timeout: 30 },
    },
  });

  bot.on('polling_error', (err) => {
    if (err.code === 'ETELEGRAM' && err.message.includes('409')) return;
    console.error('⚠️  Telegram polling error:', err.message);
  });

  console.log('📱 Telegram bot connected');

  // ── Command handlers ──

  bot.onText(/\/start/, (msg) => {
    if (!isAuthorized(msg)) return;
    sendMessage(
      '🤖 *HenryDesk* is online.\n\n' +
      '*Fibo :*\n' +
      '/fibo COIN TF HIGH LOW — tracer des niveaux\n' +
      '/fibo COIN — voir les niveaux\n' +
      '/fibo — tous les niveaux\n' +
      '/delfibo COIN TF — supprimer\n\n' +
      '*Trading :*\n' +
      '/watchlist — watchlist\n' +
      '/positions — positions ouvertes\n' +
      '/stats — statistiques\n' +
      '/status — état du bot\n' +
      '/test COIN — test alert complet'
    );
  });

  // ── /fibo — Manual Fibonacci Level Management ──

  bot.onText(/\/fibo(?:\s+(.+))?$/, (msg, match) => {
    if (!isAuthorized(msg)) return;
    const raw = (match[1] || '').trim();

    // /fibo → show all
    if (!raw) return showAllFibo();

    const args = raw.split(/\s+/);

    // /fibo BTC → show for coin
    if (args.length === 1) return showFibo(args[0].toUpperCase());

    // /fibo BTC 1d 88000 74000 → set levels
    if (args.length >= 4) {
      const coin = args[0].toUpperCase();
      const tf = args[1].toLowerCase();
      const price1 = parseFloat(args[2]);
      const price2 = parseFloat(args[3]);
      return setFibo(coin, tf, price1, price2);
    }

    sendMessage('⚠️ Usage:\n`/fibo BTC 1d 88000 74000`\n`/fibo BTC` (voir)\n`/fibo` (tout voir)');
  });

  // ── /delfibo — Delete fibo levels ──

  bot.onText(/\/delfibo\s+(.+)/, (msg, match) => {
    if (!isAuthorized(msg)) return;
    const args = match[1].trim().split(/\s+/);
    if (args.length < 2) {
      sendMessage('⚠️ Usage: `/delfibo BTC 1d`');
      return;
    }
    const coin = args[0].toUpperCase();
    const tf = args[1].toLowerCase();
    const key = `${coin}_${tf}`;
    const tfLabel = { '1h': '1H', '4h': '4H', '1d': 'Daily' }[tf] || tf;

    if (_S.fiboSetups?.[key]) {
      delete _S.fiboSetups[key];
      const { saveData } = require('./watchlist');
      saveData();
      sendMessage(`🗑️ Niveaux *${coin} ${tfLabel}* supprimés.`);
    } else {
      sendMessage(`⚠️ Aucun niveau Fibo pour *${coin} ${tfLabel}*.`);
    }
  });

  // ── Watchlist commands ──

  bot.onText(/\/watchlist/, (msg) => {
    if (!isAuthorized(msg)) return;
    if (_S.watchlist.length === 0) {
      sendMessage('📋 Watchlist vide. Utilise /add BTC pour ajouter.');
      return;
    }
    const list = _S.watchlist.map((w, i) => {
      const coin = w.symbol.replace(/USDT$/i, '').replace(/USD$/i, '') || w.symbol;
      const setups = Object.values(_S.fiboSetups || {}).filter(s => s.symbol === coin);
      const tfInfo = setups.length > 0
        ? setups.map(s => s.tf.toUpperCase()).join(', ')
        : 'pas de fibo';
      return `${i + 1}. *${w.symbol}* (${tfInfo})`;
    }).join('\n');
    sendMessage(`📋 *Watchlist* (${_S.watchlist.length}):\n\n${list}`);
  });

  bot.onText(/\/add (.+)/, (msg, match) => {
    if (!isAuthorized(msg)) return;
    const symbol = match[1].trim().toUpperCase();
    if (_S.watchlist.find(w => w.symbol === symbol)) {
      sendMessage(`⚠️ *${symbol}* déjà dans la watchlist.`);
      return;
    }
    _S.watchlist.push({ symbol, addedAt: new Date().toISOString() });
    sendMessage(`✅ *${symbol}* ajouté.\n💡 Trace tes Fibo : /fibo ${symbol} 1d HIGH LOW`);
  });

  bot.onText(/\/remove (.+)/, (msg, match) => {
    if (!isAuthorized(msg)) return;
    const symbol = match[1].trim().toUpperCase();
    const before = _S.watchlist.length;
    _S.watchlist = _S.watchlist.filter(w => w.symbol !== symbol);
    sendMessage(_S.watchlist.length < before
      ? `🗑️ *${symbol}* retiré de la watchlist.`
      : `⚠️ *${symbol}* pas trouvé dans la watchlist.`);
  });

  bot.onText(/\/positions/, (msg) => {
    if (!isAuthorized(msg)) return;
    if (_S.activePositions.length === 0) {
      sendMessage('📊 Aucune position ouverte.');
      return;
    }
    const lines = _S.activePositions.map(p =>
      `• *${p.symbol}* ${p.side.toUpperCase()} @ ${p.entry}\n  SL: ${p.sl} | TP: ${p.tp} | PnL: $${p.pnl?.toFixed(2) || '0.00'}`
    ).join('\n\n');
    sendMessage(`📊 *Positions ouvertes* (${_S.activePositions.length}):\n\n${lines}`);
  });

  bot.onText(/\/stats/, (msg) => {
    if (!isAuthorized(msg)) return;
    const s = _S.stats;
    const wr = s.totalTrades > 0 ? ((s.wins / s.totalTrades) * 100).toFixed(1) : '0';
    sendMessage(
      `📈 *Stats HenryDesk*\n\n` +
      `Trades: ${s.totalTrades}\n` +
      `Win rate: ${wr}%\n` +
      `Wins: ${s.wins} | Losses: ${s.losses}\n` +
      `PnL total: $${s.totalPnl.toFixed(2)}\n` +
      `R moyen: ${s.avgR.toFixed(2)}R\n\n` +
      `Alertes: ${s.totalAlerts || 0} (✅ ${s.alertsApproved || 0} · ❌ ${s.alertsRejected || 0})`
    );
  });

  bot.onText(/\/status/, (msg) => {
    if (!isAuthorized(msg)) return;
    const uptime = Math.floor(process.uptime() / 60);
    const fiboCount = Object.keys(_S.fiboSetups || {}).length;
    const activeFibo = Object.values(_S.fiboSetups || {}).filter(s => new Date(s.expiresAt) > new Date()).length;
    sendMessage(
      `🤖 *HenryDesk ${_S.version}*\n\n` +
      `Uptime: ${uptime}min\n` +
      `Watchlist: ${_S.watchlist.length} paires\n` +
      `Fibo actifs: ${activeFibo}/${fiboCount}\n` +
      `Positions: ${_S.activePositions.length}/${_config.trading.maxConcurrentTrades}\n` +
      `Alertes pending: ${_S.pendingAlerts.length}`
    );
  });

  // ── /test — Full enriched test alert (uses auto-detection for test) ──

  bot.onText(/\/test(?: (.+))?/, async (msg, match) => {
    if (!isAuthorized(msg)) return;
    const coin = (match[1] || 'BTC').trim().toUpperCase();
    sendMessage(`🧪 Test *${coin}* — génération en cours...`);

    try {
      const { captureCharts } = require('./chart');
      const {
        getLatestSwings, calcFiboLevels, generateProposal,
        analyzeTrend, analyzeVolume, scoreSetup, buildThesis, estimateDuration,
      } = require('./fibonacci');

      const fetchHL = async (sym, interval) => {
        const msMap = { '1h': 3600000, '4h': 14400000, '1d': 86400000 };
        const res = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'candleSnapshot',
            req: {
              coin: sym,
              interval,
              startTime: Date.now() - (200 * (msMap[interval] || 86400000)),
              endTime: Date.now(),
            },
          }),
        });
        const raw = await res.json();
        if (!Array.isArray(raw)) return null;
        return raw.map(c => ({ time: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v }));
      };

      const tf = '4h';
      const candles = await fetchHL(coin, tf);
      const dailyCandles = await fetchHL(coin, '1d');

      if (!candles || candles.length < 50) {
        sendMessage(`❌ Pas assez de données pour *${coin}*`);
        return;
      }

      const swings = getLatestSwings(candles, 5);
      const swingHigh = swings.swingHigh?.price || Math.max(...candles.slice(-50).map(c => c.high));
      const swingLow = swings.swingLow?.price || Math.min(...candles.slice(-50).map(c => c.low));
      const fiboLevels = calcFiboLevels(swingHigh, swingLow);

      const trend = analyzeTrend(candles, 20);
      const volume = analyzeVolume(candles);
      const higherTfTrend = dailyCandles && dailyCandles.length >= 55
        ? analyzeTrend(dailyCandles, 50) : null;

      const lastPrice = candles[candles.length - 1].close;
      const closestFibo = fiboLevels.reduce((prev, curr) =>
        Math.abs(curr.price - lastPrice) < Math.abs(prev.price - lastPrice) ? curr : prev
      );

      const proposal = generateProposal(coin, lastPrice, closestFibo, swingHigh, swingLow, 500);
      if (!proposal) { sendMessage('❌ Impossible de générer un proposal'); return; }

      const trendAligned = higherTfTrend
        ? (proposal.side === 'long'
          ? ['bullish', 'pullback'].includes(higherTfTrend.trend)
          : ['bearish', 'correction'].includes(higherTfTrend.trend))
        : (proposal.side === 'long' ? trend.slope > 0 : trend.slope < 0);

      const emaConfirm = higherTfTrend
        ? (proposal.side === 'long' ? higherTfTrend.slope > 0 : higherTfTrend.slope < 0)
        : (proposal.side === 'long' ? trend.slope > 0 : trend.slope < 0);

      const setupScore = scoreSetup({
        fiboLevel: closestFibo.level, trendAligned, emaConfirm,
        rr: proposal.rr, volumeAboveAvg: volume.aboveAvg, hasConfluence: !!higherTfTrend,
      });

      const thesis = buildThesis({
        symbol: coin, tf, fiboLevel: closestFibo.level, side: proposal.side,
        trend, higherTfTrend, higherTf: '1d', volume,
      });

      const charts = await captureCharts(coin, tf, candles, fiboLevels, swingHigh, swingLow, proposal);

      const alert = {
        id: 'test_' + Date.now(),
        symbol: coin, tf, fiboLevel: closestFibo.label,
        proposal, thesis, duration: estimateDuration(tf),
        context: { setupScore, trend, volume, higherTfTrend, higherTf: '1d', trendAligned, emaConfirm },
        macroChartPath: charts.macroPath, tradeChartPath: charts.tradePath,
      };

      await sendTradeAlert(alert);
    } catch (err) {
      sendMessage(`❌ Test échoué: ${err.message}`);
    }
  });

  // ── Callback queries (inline buttons for trade actions) ──

  bot.on('callback_query', async (query) => {
    const data = query.data;

    // ✅ GO — approve trade
    if (data.startsWith('go_')) {
      const alertId = data.replace('go_', '');
      const alert = _S.pendingAlerts.find(a => a.id === alertId);
      if (alert) {
        alert.approved = true;
        alert.approvedAt = new Date().toISOString();
        _S.stats.alertsApproved = (_S.stats.alertsApproved || 0) + 1;
        bot.answerCallbackQuery(query.id, { text: '✅ Trade approuvé!' });
        sendMessage(`✅ *${alert.symbol}* approuvé — exécution en cours...`);
      } else {
        bot.answerCallbackQuery(query.id, { text: '⚠️ Alerte expirée' });
      }
    }

    // ❌ PASS — reject trade
    if (data.startsWith('pass_')) {
      const alertId = data.replace('pass_', '');
      const alert = _S.pendingAlerts.find(a => a.id === alertId);
      if (alert) {
        _S.pendingAlerts = _S.pendingAlerts.filter(a => a.id !== alertId);
        _S.stats.alertsRejected = (_S.stats.alertsRejected || 0) + 1;
        bot.answerCallbackQuery(query.id, { text: '❌ Trade passé' });
        sendMessage('❌ Trade passé.');
      } else {
        bot.answerCallbackQuery(query.id, { text: '⚠️ Alerte expirée' });
      }
    }

    // 🎯 TP élargi — extend TP by 50%
    if (data.startsWith('widen_')) {
      const alertId = data.replace('widen_', '');
      const alert = _S.pendingAlerts.find(a => a.id === alertId);
      if (alert) {
        const p = alert.proposal;
        const oldTpDist = Math.abs(p.tp - p.entry);
        const newTpDist = oldTpDist * 1.5;
        p.tp = parseFloat((p.side === 'long' ? p.entry + newTpDist : p.entry - newTpDist).toFixed(6));
        const slDist = Math.abs(p.entry - p.sl);
        p.rr = parseFloat((newTpDist / slDist).toFixed(2));
        p.tpPercent = parseFloat(((newTpDist / p.entry) * 100).toFixed(1));
        p.potentialWin = parseFloat((newTpDist * p.positionSize).toFixed(2));
        bot.answerCallbackQuery(query.id, { text: '🎯 TP élargi ×1.5' });
        await sendUpdatedExecution(alert);
      } else {
        bot.answerCallbackQuery(query.id, { text: '⚠️ Alerte expirée' });
      }
    }

    // 🛡 SL serré — tighten SL by 40%
    if (data.startsWith('tight_')) {
      const alertId = data.replace('tight_', '');
      const alert = _S.pendingAlerts.find(a => a.id === alertId);
      if (alert) {
        const p = alert.proposal;
        const oldSlDist = Math.abs(p.entry - p.sl);
        const newSlDist = oldSlDist * 0.6;
        p.sl = parseFloat((p.side === 'long' ? p.entry - newSlDist : p.entry + newSlDist).toFixed(6));
        const tpDist = Math.abs(p.tp - p.entry);
        p.rr = parseFloat((tpDist / newSlDist).toFixed(2));
        p.slPercent = parseFloat(((newSlDist / p.entry) * 100).toFixed(1));
        p.positionSize = parseFloat((p.risk / newSlDist).toFixed(4));
        p.potentialLoss = parseFloat((newSlDist * p.positionSize).toFixed(2));
        p.potentialWin = parseFloat((tpDist * p.positionSize).toFixed(2));
        bot.answerCallbackQuery(query.id, { text: '🛡 SL resserré ×0.6' });
        await sendUpdatedExecution(alert);
      } else {
        bot.answerCallbackQuery(query.id, { text: '⚠️ Alerte expirée' });
      }
    }
  });
}

// ── Authorization ──

function isAuthorized(msg) {
  if (String(msg.chat.id) !== String(_config.telegramChatId)) return false;
  const mid = msg.message_id;
  if (mid && _processedMsgs.has(mid)) return false;
  if (mid) {
    _processedMsgs.add(mid);
    if (_processedMsgs.size > 100) {
      const oldest = _processedMsgs.values().next().value;
      _processedMsgs.delete(oldest);
    }
  }
  return true;
}

// ── Send helpers ──

function sendMessage(text, options = {}) {
  if (!bot || !_config.telegramChatId) return;
  return bot.sendMessage(_config.telegramChatId, text, {
    parse_mode: 'Markdown',
    ...options,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIBO MANAGEMENT (manual levels)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function setFibo(coin, tf, price1, price2) {
  if (!VALID_TFS.includes(tf)) {
    sendMessage(`⚠️ Timeframe invalide. Utilise: ${VALID_TFS.join(', ')}`);
    return;
  }
  if (isNaN(price1) || isNaN(price2) || price1 <= 0 || price2 <= 0) {
    sendMessage('⚠️ Prix invalides.');
    return;
  }

  const swingHigh = Math.max(price1, price2);
  const swingLow = Math.min(price1, price2);

  if (swingHigh === swingLow) {
    sendMessage('⚠️ High et Low ne peuvent pas être identiques.');
    return;
  }

  // Calculate fibo levels
  const { calcFiboLevels } = require('./fibonacci');
  const levels = calcFiboLevels(swingHigh, swingLow);

  // Expiry
  const expiryMs = FIBO_EXPIRY_MS[tf] || 7 * 86400000;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiryMs);
  const expiryDays = Math.round(expiryMs / 86400000);

  // Store
  if (!_S.fiboSetups) _S.fiboSetups = {};
  const key = `${coin}_${tf}`;
  const isUpdate = !!_S.fiboSetups[key];
  _S.fiboSetups[key] = {
    symbol: coin,
    tf,
    swingHigh,
    swingLow,
    levels,
    setAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    reminderSent: false,
    expiredNotified: false,
  };

  // Auto-add to watchlist if not present
  const inWatchlist = _S.watchlist.find(w => {
    const wCoin = w.symbol.replace(/USDT$/i, '').replace(/USD$/i, '');
    return wCoin === coin || w.symbol === coin;
  });
  if (!inWatchlist) {
    _S.watchlist.push({ symbol: coin, addedAt: now.toISOString() });
  }

  // Save
  const { saveData } = require('./watchlist');
  saveData();

  // Response
  const tfLabel = { '1h': '1H', '4h': '4H', '1d': 'Daily' }[tf];
  const levelsText = levels.map(l =>
    `  ${l.label}  \`$${fmtP(l.price)}\``
  ).join('\n');

  sendMessage(
    `📐 *${coin} · ${tfLabel}* — Fibo ${isUpdate ? 'mis à jour' : 'tracé'}\n\n` +
    `▸ Swing High: \`$${fmtP(swingHigh)}\`\n` +
    `▸ Swing Low: \`$${fmtP(swingLow)}\`\n\n` +
    `*Niveaux :*\n${levelsText}\n\n` +
    `⏰ Expire dans ${expiryDays}j (${expiresAt.toLocaleDateString('fr-FR')})\n` +
    `💡 Alerte auto quand le prix touche un niveau.`
  );
}

function showAllFibo() {
  if (!_S.fiboSetups || Object.keys(_S.fiboSetups).length === 0) {
    sendMessage(
      '📐 Aucun niveau Fibo défini.\n\n' +
      'Trace tes niveaux depuis TradingView :\n' +
      '`/fibo BTC 1d 88000 74000`\n' +
      '`/fibo ETH 4h 4000 3200`'
    );
    return;
  }

  const lines = ['📐 *Niveaux Fibo actifs*\n'];
  const bySymbol = {};

  for (const setup of Object.values(_S.fiboSetups)) {
    if (!bySymbol[setup.symbol]) bySymbol[setup.symbol] = [];
    bySymbol[setup.symbol].push(setup);
  }

  for (const [symbol, setups] of Object.entries(bySymbol)) {
    lines.push(`*${symbol}*`);
    for (const s of setups.sort((a, b) => VALID_TFS.indexOf(b.tf) - VALID_TFS.indexOf(a.tf))) {
      const tfLabel = { '1h': '1H', '4h': '4H', '1d': 'Daily' }[s.tf] || s.tf;
      const daysLeft = Math.ceil((new Date(s.expiresAt).getTime() - Date.now()) / 86400000);
      const expired = daysLeft <= 0;
      const status = expired ? '❌ expiré' : `⏰ ${daysLeft}j`;
      lines.push(`  ${tfLabel} — \`$${fmtP(s.swingHigh)}\` → \`$${fmtP(s.swingLow)}\` (${status})`);
    }
    lines.push('');
  }

  sendMessage(lines.join('\n'));
}

function showFibo(coin) {
  const setups = Object.values(_S.fiboSetups || {}).filter(s => s.symbol === coin);
  if (setups.length === 0) {
    sendMessage(`📐 Aucun niveau pour *${coin}*.\n\n/fibo ${coin} 1d HIGH LOW`);
    return;
  }

  const lines = [`📐 *Niveaux Fibo — ${coin}*\n`];
  const tfNames = { '1h': '1H', '4h': '4H', '1d': 'Daily' };

  for (const tf of VALID_TFS.slice().reverse()) {
    const setup = setups.find(s => s.tf === tf);
    if (!setup) {
      lines.push(`${tfNames[tf]} — _pas défini_`);
      continue;
    }

    const daysAgo = Math.floor((Date.now() - new Date(setup.setAt).getTime()) / 86400000);
    const daysLeft = Math.ceil((new Date(setup.expiresAt).getTime() - Date.now()) / 86400000);
    const expired = daysLeft <= 0;

    lines.push(`*${tfNames[tf]}* (posé il y a ${daysAgo}j, ${expired ? '❌ expiré' : `expire dans ${daysLeft}j`})`);
    lines.push(`  High \`$${fmtP(setup.swingHigh)}\` → Low \`$${fmtP(setup.swingLow)}\``);
    const levelsStr = setup.levels.map(l => `${l.label} \`$${fmtP(l.price)}\``).join(' · ');
    lines.push(`  ${levelsStr}`);
    lines.push('');
  }

  sendMessage(lines.join('\n'));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TRADE ALERT — 2 messages (ANALYSE + EXÉCUTION)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function sendTradeAlert(alert) {
  const { symbol, tf, fiboLevel, proposal, thesis, duration, context, macroChartPath, tradeChartPath } = alert;
  const tfUp = tf.toUpperCase();
  const sideIcon = proposal.side === 'long' ? '🟢' : '🔴';
  const fmt = (v) => typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v;
  const tfNames = { '1h': '1H', '4h': '4H', '1d': 'Daily' };

  // ━━ MESSAGE 1 — ANALYSE ━━

  if (macroChartPath && fs.existsSync(macroChartPath)) {
    await bot.sendPhoto(_config.telegramChatId, macroChartPath, {
      caption: `📐 *${symbol} · ${tfUp}* — Fibo ${fiboLevel}`,
      parse_mode: 'Markdown',
    });
  }

  const lines1 = [];
  lines1.push(`📐 *${symbol} · ${tfUp}* — Fibo ${fiboLevel}`);
  lines1.push('');

  if (context?.setupScore) {
    const { score, grade, emoji } = context.setupScore;
    lines1.push(`🎯 *Grade ${grade}* (${score}/100) ${emoji}`);
    lines1.push('');
  }

  const fiboDesc = {
    '23.6%': 'Faible retracement', '38.2%': 'Retracement modéré',
    '50.0%': 'Niveau médian', '61.8%': 'Golden ratio', '78.6%': 'Retracement profond',
  };
  lines1.push(`📊 ${fiboDesc[fiboLevel] || fiboLevel} touché`);

  if (context?.higherTfTrend && context.higherTf) {
    const htf = tfNames[context.higherTf] || context.higherTf;
    const ht = context.higherTfTrend;
    lines1.push(`${ht.emoji} ${htf} : ${capitalize(ht.trend)} (${ht.aboveEma ? '>' : '<'} EMA${ht.period})`);
  }

  if (context?.trend) {
    const ctf = tfNames[tf] || tfUp;
    const ct = context.trend;
    lines1.push(`${ct.emoji} ${ctf} : ${capitalize(ct.trend)} (${ct.aboveEma ? '>' : '<'} EMA${ct.period})`);
  }

  if (context?.volume) {
    const sign = context.volume.percent >= 0 ? '+' : '';
    lines1.push(`${context.volume.emoji} Volume : ${sign}${context.volume.percent}% vs moy.`);
  }

  lines1.push('');

  if (thesis) {
    lines1.push(`💡 *Thèse*`);
    lines1.push(thesis);
    lines1.push('');
  }

  lines1.push(`${sideIcon} *${proposal.side.toUpperCase()}* · ⏱ ${duration || '—'}`);

  await sendMessage(lines1.join('\n'));

  // ━━ MESSAGE 2 — EXÉCUTION ━━

  if (tradeChartPath && fs.existsSync(tradeChartPath)) {
    await bot.sendPhoto(_config.telegramChatId, tradeChartPath, {
      caption: `🎯 *${symbol} ${proposal.side.toUpperCase()}* · ${proposal.leverage || '—'}x`,
      parse_mode: 'Markdown',
    });
  }

  const lines2 = [];
  lines2.push(`🎯 *${symbol} ${proposal.side.toUpperCase()}* · ${proposal.leverage || '—'}x isolated`);
  lines2.push('');
  lines2.push(`✅ Si TP → *+$${fmt(proposal.potentialWin)}*`);
  lines2.push(`❌ Si SL → *-$${fmt(proposal.potentialLoss)}*`);
  lines2.push('');
  lines2.push(`▸ Entry  \`$${fmt(proposal.entry)}\``);
  lines2.push(`▸ SL  \`$${fmt(proposal.sl)}\`  (−${proposal.slPercent || '?'}%)`);
  lines2.push(`▸ TP  \`$${fmt(proposal.tp)}\`  (+${proposal.tpPercent || '?'}%)`);
  lines2.push('');
  lines2.push(`▸ Size \`${proposal.positionSize.toFixed(4)} ${symbol}\` · Risk \`$${proposal.risk}\``);

  const rrStars = proposal.rr >= 3 ? ' ⭐⭐' : proposal.rr >= 2.5 ? ' ⭐' : '';
  lines2.push(`▸ R:R = *1 : ${proposal.rr.toFixed(1)}*${rrStars}`);
  lines2.push(`▸ Durée : *${duration || '—'}*`);

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ GO', callback_data: `go_${alert.id}` },
          { text: '❌ PASS', callback_data: `pass_${alert.id}` },
        ],
        [
          { text: '🎯 TP élargi', callback_data: `widen_${alert.id}` },
          { text: '🛡 SL serré', callback_data: `tight_${alert.id}` },
        ],
      ],
    },
  };

  await sendMessage(lines2.join('\n'), keyboard);
}

// ── Updated execution message (after quick adjust) ──

async function sendUpdatedExecution(alert) {
  const { symbol, proposal, duration } = alert;
  const fmt = (v) => typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v;
  const rrStars = proposal.rr >= 3 ? ' ⭐⭐' : proposal.rr >= 2.5 ? ' ⭐' : '';

  const lines = [];
  lines.push(`🔄 *AJUSTÉ — ${symbol} ${proposal.side.toUpperCase()}*`);
  lines.push('');
  lines.push(`✅ Si TP → *+$${fmt(proposal.potentialWin)}*`);
  lines.push(`❌ Si SL → *-$${fmt(proposal.potentialLoss)}*`);
  lines.push('');
  lines.push(`▸ Entry  \`$${fmt(proposal.entry)}\``);
  lines.push(`▸ SL  \`$${fmt(proposal.sl)}\`  (−${proposal.slPercent || '?'}%)`);
  lines.push(`▸ TP  \`$${fmt(proposal.tp)}\`  (+${proposal.tpPercent || '?'}%)`);
  lines.push('');
  lines.push(`▸ Size \`${proposal.positionSize.toFixed(4)} ${symbol}\` · Risk \`$${proposal.risk}\``);
  lines.push(`▸ R:R = *1 : ${proposal.rr.toFixed(1)}*${rrStars}`);

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ GO', callback_data: `go_${alert.id}` },
          { text: '❌ PASS', callback_data: `pass_${alert.id}` },
        ],
        [
          { text: '🎯 TP élargi', callback_data: `widen_${alert.id}` },
          { text: '🛡 SL serré', callback_data: `tight_${alert.id}` },
        ],
      ],
    },
  };

  await sendMessage(lines.join('\n'), keyboard);
}

module.exports = { initTelegram, sendMessage, sendTradeAlert };
