// ============================================================
// HENRYDESK — Telegram Bot Interface
// ============================================================

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

let bot = null;
let _S = null;
let _config = null;
const _processedMsgs = new Set(); // anti-duplicate

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
    if (err.code === 'ETELEGRAM' && err.message.includes('409')) {
      // Conflict with another instance — will resolve itself
      return;
    }
    console.error('⚠️  Telegram polling error:', err.message);
  });

  console.log('📱 Telegram bot connected');

  // --- Command handlers ---

  bot.onText(/\/start/, (msg) => {
    if (!isAuthorized(msg)) return;
    sendMessage('🤖 *HenryDesk* is online.\n\nCommands:\n/watchlist — voir la watchlist\n/add <SYMBOL> — ajouter une paire\n/remove <SYMBOL> — retirer une paire\n/positions — positions ouvertes\n/stats — statistiques\n/status — état du bot');
  });

  bot.onText(/\/watchlist/, (msg) => {
    if (!isAuthorized(msg)) return;
    if (_S.watchlist.length === 0) {
      sendMessage('📋 Watchlist vide. Utilise /add BTCUSDT pour ajouter.');
      return;
    }
    const list = _S.watchlist.map((w, i) => `${i + 1}. *${w.symbol}*`).join('\n');
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
    sendMessage(`✅ *${symbol}* ajouté à la watchlist.`);
  });

  bot.onText(/\/remove (.+)/, (msg, match) => {
    if (!isAuthorized(msg)) return;
    const symbol = match[1].trim().toUpperCase();
    const before = _S.watchlist.length;
    _S.watchlist = _S.watchlist.filter(w => w.symbol !== symbol);
    if (_S.watchlist.length < before) {
      sendMessage(`🗑️ *${symbol}* retiré de la watchlist.`);
    } else {
      sendMessage(`⚠️ *${symbol}* pas trouvé dans la watchlist.`);
    }
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
      `R moyen: ${s.avgR.toFixed(2)}R`
    );
  });

  bot.onText(/\/status/, (msg) => {
    if (!isAuthorized(msg)) return;
    const uptime = Math.floor(process.uptime() / 60);
    sendMessage(
      `🤖 *HenryDesk ${_S.version}*\n\n` +
      `Uptime: ${uptime}min\n` +
      `Watchlist: ${_S.watchlist.length} paires\n` +
      `Positions: ${_S.activePositions.length}/${_config.trading.maxConcurrentTrades}\n` +
      `Alertes pending: ${_S.pendingAlerts.length}`
    );
  });

  bot.onText(/\/test(?: (.+))?/, async (msg, match) => {
    if (!isAuthorized(msg)) return;
    const coin = (match[1] || 'BTC').trim().toUpperCase();
    sendMessage(`🧪 Génération test alert *${coin}*...`);
    try {
      const { testChart } = require('./chart');
      const charts = await testChart(coin, '1d');
      if (charts.macroPath) {
        await bot.sendPhoto(_config.telegramChatId, charts.macroPath, {
          caption: `📐 *${coin}* — 1D\nFibonacci retracement — test`,
          parse_mode: 'Markdown',
        });
      }
      if (charts.tradePath) {
        await bot.sendPhoto(_config.telegramChatId, charts.tradePath, {
          caption: `🎯 *SETUP TEST — ${coin}*`,
          parse_mode: 'Markdown',
        });
      }
      sendMessage(`✅ Test alert *${coin}* envoyé.`);
    } catch (err) {
      sendMessage(`❌ Test échoué: ${err.message}`);
    }
  });

  // --- Callback queries (inline buttons for trade approval) ---
  bot.on('callback_query', async (query) => {
    const data = query.data;

    if (data.startsWith('approve_')) {
      const alertId = data.replace('approve_', '');
      const alert = _S.pendingAlerts.find(a => a.id === alertId);
      if (alert) {
        bot.answerCallbackQuery(query.id, { text: '✅ Trade approuvé!' });
        sendMessage(`✅ Trade *${alert.symbol}* approuvé. Exécution en cours...`);
        // Trading module will handle execution
        alert.approved = true;
        alert.approvedAt = new Date().toISOString();
      }
    }

    if (data.startsWith('reject_')) {
      const alertId = data.replace('reject_', '');
      _S.pendingAlerts = _S.pendingAlerts.filter(a => a.id !== alertId);
      bot.answerCallbackQuery(query.id, { text: '❌ Trade rejeté' });
      sendMessage('❌ Trade rejeté.');
    }

    if (data.startsWith('adjust_')) {
      const alertId = data.replace('adjust_', '');
      bot.answerCallbackQuery(query.id, { text: '✏️ Envoie les ajustements' });
      sendMessage('✏️ Envoie les ajustements:\n`SL=<prix> TP=<prix> RISK=<$>`');
    }
  });
}

function isAuthorized(msg) {
  if (String(msg.chat.id) !== String(_config.telegramChatId)) return false;
  // Anti-duplicate: each message_id processed only ONCE across all handlers
  const mid = msg.message_id;
  if (mid && _processedMsgs.has(mid)) return false;
  if (mid) {
    _processedMsgs.add(mid);
    // Cleanup: keep only last 100 IDs in memory
    if (_processedMsgs.size > 100) {
      const oldest = _processedMsgs.values().next().value;
      _processedMsgs.delete(oldest);
    }
  }
  return true;
}

function sendMessage(text, options = {}) {
  if (!bot || !_config.telegramChatId) return;
  return bot.sendMessage(_config.telegramChatId, text, {
    parse_mode: 'Markdown',
    ...options,
  });
}

async function sendTradeAlert(alert) {
  const { symbol, tf, fiboLevel, proposal, macroChartPath, tradeChartPath } = alert;

  // ── Screenshot 1: Macro view (Fibonacci overview) ──
  if (macroChartPath && fs.existsSync(macroChartPath)) {
    await bot.sendPhoto(_config.telegramChatId, macroChartPath, {
      caption: `📐 *${symbol}* — ${tf.toUpperCase()}\nFibonacci retracement — niveau *${fiboLevel}* touché`,
      parse_mode: 'Markdown',
    });
  }

  // ── Screenshot 2: Trade setup (zoomed) ──
  if (tradeChartPath && fs.existsSync(tradeChartPath)) {
    await bot.sendPhoto(_config.telegramChatId, tradeChartPath, {
      caption: `🎯 *SETUP — ${proposal.side.toUpperCase()}*\nEntry $${proposal.entry} → TP $${proposal.tp}\nSL $${proposal.sl} | Risk $${proposal.risk} | R:R 1:${proposal.rr.toFixed(1)}`,
      parse_mode: 'Markdown',
    });
  }

  // ── Trade proposal with action buttons ──
  const text =
    `📊 *ALERTE FIBONACCI*\n\n` +
    `*${symbol}* — ${tf.toUpperCase()}\n` +
    `Niveau *${fiboLevel}* touché\n\n` +
    `${proposal.side === 'long' ? '🟢' : '🔴'} *${proposal.side.toUpperCase()}*\n` +
    `▸ Entry: \`${proposal.entry}\`\n` +
    `▸ Stop Loss: \`${proposal.sl}\`\n` +
    `▸ Take Profit: \`${proposal.tp}\`\n` +
    `▸ Risk: \`$${proposal.risk}\`\n` +
    `▸ Size: \`${proposal.positionSize.toFixed(4)}\`\n` +
    `▸ R:R = *1:${proposal.rr.toFixed(1)}*`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approuver', callback_data: `approve_${alert.id}` },
          { text: '❌ Rejeter', callback_data: `reject_${alert.id}` },
        ],
        [
          { text: '✏️ Ajuster SL/TP', callback_data: `adjust_${alert.id}` },
        ],
      ],
    },
  };

  await sendMessage(text, keyboard);
}

module.exports = { initTelegram, sendMessage, sendTradeAlert };
