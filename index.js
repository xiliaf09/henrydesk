// ============================================================
// HENRYDESK v1.0.0 — Fibonacci Futures Trading Assistant
// Hyperliquid · Telegram · Jarvis Hub
// ============================================================

const HENRY_VERSION = 'v1.1.0';

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
  pendingAlerts: [],      // [{ id, symbol, tf, fiboLevel, proposal, sentAt }]
  alertHistory: [],       // [{ id, symbol, tf, fiboLevel, thesis, side, sentAt, action }]
  fiboSetups: {},          // manual fibo levels { 'BTC_1d': { symbol, tf, swingHigh, swingLow, levels, setAt, expiresAt } }
  stats: {
    totalTrades: 0,
    wins: 0,
    losses: 0,
    totalPnl: 0,
    avgR: 0,
    totalAlerts: 0,
    alertsApproved: 0,
    alertsRejected: 0,
  },
};

// --- Express API (for Jarvis Hub integration) ---
const crypto = require('crypto');
const app = express();
app.use(express.json());

// ── API Security ──
// Generate a random API key on first boot, stored in data.json
// Only localhost (Jarvis Hub) and requests with valid API key can access
const API_KEY = process.env.HENRYDESK_API_KEY || crypto.randomBytes(32).toString('hex');

function apiAuth(req, res, next) {
  // Allow localhost connections (Jarvis Hub proxy)
  const ip = req.ip || req.connection.remoteAddress || '';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (isLocal) return next();

  // Check API key for remote access
  const key = req.headers['x-api-key'] || req.query.key;
  if (key === API_KEY) return next();

  res.status(401).json({ error: 'Unauthorized' });
}

// Health is public (no sensitive data)
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

// All /api/* routes require auth
app.use('/api', apiAuth);

app.get('/api/state', (req, res) => {
  res.json(S);
});

app.get('/api/watchlist', (req, res) => {
  res.json(S.watchlist);
});

app.post('/api/watchlist', (req, res) => {
  const { symbol, action } = req.body;
  if (!symbol || typeof symbol !== 'string') return res.status(400).json({ error: 'symbol required' });

  // Strict validation: uppercase alphanumeric only, max 20 chars
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  if (!sym) return res.status(400).json({ error: 'invalid symbol' });

  if (action === 'remove') {
    S.watchlist = S.watchlist.filter(w => w.symbol !== sym);
    console.log(`📋 Watchlist: removed ${sym}`);
  } else {
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

app.get('/api/alerts', (req, res) => {
  res.json(S.alertHistory.slice(-100).reverse());
});

app.get('/api/overview', (req, res) => {
  res.json({
    version: S.version,
    uptime: process.uptime(),
    startedAt: S.startedAt,
    watchlistCount: S.watchlist.length,
    activePositions: S.activePositions.length,
    pendingAlerts: S.pendingAlerts.length,
    stats: S.stats,
    lastAlert: S.alertHistory.length > 0 ? S.alertHistory[S.alertHistory.length - 1] : null,
    config: {
      timeframes: require('./config').fibonacci.timeframes,
      fiboLevels: require('./config').fibonacci.levels,
      riskPerTrade: require('./config').trading.riskPerTrade,
      maxPositions: require('./config').trading.maxConcurrentTrades,
      minRR: require('./config').trading.minRR,
    },
  });
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
