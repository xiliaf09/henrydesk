// ============================================================
// HENRYDESK v1.0.0 — Fibonacci Futures Trading Assistant
// Hyperliquid · Telegram · Jarvis Hub
// ============================================================

const HENRY_VERSION = 'v1.0.0';

const config = require('./config');
const express = require('express');
const { initTelegram } = require('./modules/telegram');
const { initWatchlist } = require('./modules/watchlist');
const { startScanner } = require('./modules/scanner');
const { initTrading } = require('./modules/trading');

// --- State ---
const S = {
  version: HENRY_VERSION,
  startedAt: new Date().toISOString(),
  watchlist: [],          // [{ symbol, addedAt, swingOverride? }]
  activePositions: [],    // [{ symbol, side, entry, sl, tp, size, openedAt, pnl }]
  tradeHistory: [],       // [{ symbol, side, entry, exit, pnl, r, closedAt }]
  pendingAlerts: [],      // [{ id, symbol, tf, fiboLevel, proposal, chartPath, sentAt }]
  stats: {
    totalTrades: 0,
    wins: 0,
    losses: 0,
    totalPnl: 0,
    avgR: 0,
  },
};

// --- Express API (for Jarvis Hub integration) ---
const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: HENRY_VERSION,
    uptime: process.uptime(),
    watchlist: S.watchlist.length,
    activePositions: S.activePositions.length,
    pendingAlerts: S.pendingAlerts.length,
  });
});

app.get('/api/state', (req, res) => {
  res.json(S);
});

app.get('/api/watchlist', (req, res) => {
  res.json(S.watchlist);
});

app.post('/api/watchlist', (req, res) => {
  const { symbol, action } = req.body;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  if (action === 'remove') {
    S.watchlist = S.watchlist.filter(w => w.symbol !== symbol.toUpperCase());
    console.log(`📋 Watchlist: removed ${symbol.toUpperCase()}`);
  } else {
    const sym = symbol.toUpperCase();
    if (!S.watchlist.find(w => w.symbol === sym)) {
      S.watchlist.push({ symbol: sym, addedAt: new Date().toISOString() });
      console.log(`📋 Watchlist: added ${sym}`);
    }
  }
  res.json(S.watchlist);
});

app.get('/api/positions', (req, res) => {
  res.json(S.activePositions);
});

app.get('/api/history', (req, res) => {
  res.json(S.tradeHistory);
});

app.get('/api/stats', (req, res) => {
  res.json(S.stats);
});

// --- Boot ---
async function boot() {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   HENRYDESK ${HENRY_VERSION}                    ║`);
  console.log(`║   Fibonacci Futures Assistant         ║`);
  console.log(`║   Hyperliquid · Telegram · Hub        ║`);
  console.log(`╚══════════════════════════════════════╝\n`);

  console.log(`⚙️  Config loaded`);
  console.log(`   📊 Timeframes: ${config.fibonacci.timeframes.join(', ')}`);
  console.log(`   📐 Fibo levels: ${config.fibonacci.levels.join(', ')}`);
  console.log(`   💰 Risk/trade: $${config.trading.riskPerTrade}`);
  console.log(`   🔒 Max positions: ${config.trading.maxConcurrentTrades}`);
  console.log(`   📱 Telegram: ${config.telegramChatId ? '✅' : '❌'}`);
  console.log(`   🔗 Hyperliquid: ${config.hlWalletAddress ? '✅' : '⏳ not configured'}`);

  // Init modules
  initWatchlist(S);
  initTelegram(S, config);
  initTrading(S, config);

  // Start HTTP server
  app.listen(config.port, () => {
    console.log(`\n🌐 API server: http://localhost:${config.port}`);
    console.log(`   /health · /api/state · /api/watchlist · /api/positions · /api/stats`);
  });

  // Start scanner loop
  startScanner(S, config);

  console.log(`\n✅ HenryDesk is live\n`);
}

boot().catch(err => {
  console.error('❌ Boot failed:', err.message);
  process.exit(1);
});

module.exports = { S, app };
