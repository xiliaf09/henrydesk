// ============================================================
// HENRYDESK — Configuration
// ============================================================

const REQUIRED_VARS = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
];

const OPTIONAL_VARS = [
  'HYPERLIQUID_WALLET_ADDRESS',
  'HYPERLIQUID_API_WALLET_ADDRESS',
  'HYPERLIQUID_PRIVATE_KEY',
  'PORT',
  'HUB_RELAY_URL',
  'RAILWAY_ENVIRONMENT',
];

// --- Fail fast if required vars missing ---
const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`\n❌ Missing required env vars:\n${missing.map(v => `   - ${v}`).join('\n')}\n`);
  process.exit(1);
}

const config = {
  // --- Telegram ---
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,

  // --- Hyperliquid ---
  hlWalletAddress: process.env.HYPERLIQUID_WALLET_ADDRESS || '',
  hlApiWalletAddress: process.env.HYPERLIQUID_API_WALLET_ADDRESS || '',
  hlPrivateKey: process.env.HYPERLIQUID_PRIVATE_KEY || '',

  // --- Server ---
  port: parseInt(process.env.PORT || '3334', 10),
  hubRelayUrl: process.env.HUB_RELAY_URL || '',

  // --- Trading defaults ---
  trading: {
    riskPerTrade: 500,          // $ risked per trade
    maxConcurrentTrades: 2,     // max positions open simultaneously
    marginMode: 'isolated',    // always isolated
    defaultLeverage: 5,        // fallback if not calculated
    minRR: 2.0,                // minimum R:R to trigger alert (1:2)
    minScore: 50,              // minimum setup score to alert (0-100, grade C+)
  },

  // --- Fibonacci ---
  fibonacci: {
    timeframes: ['1h', '4h', '1d'],
    levels: [0.236, 0.382, 0.5, 0.618, 0.786],
    swingDetection: 'auto',    // 'auto' | 'manual' | 'hybrid'
    swingLookback: 100,        // candles to look back for swing detection
  },

  // --- Polling ---
  scanIntervalMs: 60_000,      // check prices every 60s
};

module.exports = config;
