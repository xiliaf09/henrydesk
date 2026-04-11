# HENRYDESK — Claude Code Instructions

## Project
- **HenryDesk** — Fibonacci-based futures trading assistant for Hyperliquid
- **Version**: see `HENRY_VERSION` constant (line 7 of index.js)
- **Format**: `vMAJOR.MINOR.PATCH` (e.g., v1.0.0)
- **Modules**: index.js, config.js + modules/ (telegram, watchlist, fibonacci, chart, scanner, trading)
- **Templates**: templates/chart.html (Lightweight Charts rendering)
- **Runtime**: Node.js, Puppeteer, ethers.js v6
- **Local**: `http://localhost:3334`
- **Railway**: project `henrydesk`, service `henrydesk`

## Architecture
- **Semi-auto**: bot détecte les setups Fibo → envoie 2 screenshots + alerte Telegram → user valide → exécution Hyperliquid
- **Watchlist dynamique**: gérable via Telegram (/add, /remove) + API HTTP (Jarvis Hub proxy)
- **Fibonacci**: 4H + Daily + Weekly, niveaux 0.236/0.382/0.5/0.618/0.786
- **Swings**: détection auto + override manuel (hybride)
- **Risk**: isolated margin, montant fixe en $ par trade ($500 défaut), max 2 positions simultanées
- **Charts**: Lightweight Charts (TradingView OSS) rendered via Puppeteer → 2 screenshots par alerte
  - Screenshot 1: vue macro (Fibonacci overview, swing high/low)
  - Screenshot 2: trade setup zoomé (Entry/SL/TP, panel détaillé, R:R)
- **Trading**: Hyperliquid API avec signature EIP-712, ordres limit + SL/TP auto

## Versioning
- `HENRY_VERSION` in index.js line 7
- `version` in package.json
- MAJOR = breaking architecture change
- MINOR = new feature
- PATCH = bugfix
- When releasing: update both `HENRY_VERSION` and package.json `version`
- See CHANGELOG.md for history

## Env vars
- `TELEGRAM_BOT_TOKEN` — required
- `TELEGRAM_CHAT_ID` — required
- `HYPERLIQUID_WALLET_ADDRESS` — required (main wallet, for info queries)
- `HYPERLIQUID_API_WALLET_ADDRESS` — required for live trading (API wallet address)
- `HYPERLIQUID_PRIVATE_KEY` — required for live trading (API wallet private key)
- `PORT` — default 3334
- `HUB_RELAY_URL` — Jarvis Hub URL for relay

## Railway
- Project ID: `da1ef02f-61a3-4d84-9fac-d9eaf5f8891f`
- Service ID: `2214d837-0ce1-4a37-92d0-497538eea01a`
- Environment ID: `a4666157-67d7-4d17-bb68-1710b9b61a67`
- Connected to GitHub repo `xiliaf09/henrydesk`, branch `main`

## API endpoints
- GET /health — status, version, uptime, counts
- GET /api/state — full state (watchlist, positions, alerts, history, stats)
- GET /api/watchlist — watchlist array
- POST /api/watchlist — add/remove pair `{ symbol, action? }`
- GET /api/positions — active positions
- GET /api/history — trade history
- GET /api/stats — win rate, PnL, avg R

## Telegram commands
- /start — intro + liste commandes
- /watchlist — voir la watchlist
- /add SYMBOL — ajouter une paire (ex: /add BTC)
- /remove SYMBOL — retirer une paire
- /positions — positions ouvertes
- /stats — statistiques (win rate, PnL, avg R)
- /status — état du bot (uptime, watchlist, positions)
- /test COIN — générer un test alert avec screenshots (ex: /test BTC)

## Jarvis Hub integration
- Hub proxies all requests via `/api/henrydesk/*` → `http://localhost:3334/api/*`
- Vue HenryDesk in hub sidebar (Strategy section)
- Watchlist manageable from both Telegram and Hub
- Stats, positions, history visible in Hub

## Key patterns
- State object `S` in index.js — persisted to data.json via watchlist module
- Anti-duplicate: telegram.js tracks `_lastMsgId` to prevent double processing
- Chart generation: templates/chart.html loaded in Puppeteer, data injected via `window.__CHART_DATA__`
- Trading: simulation mode if no API key, live mode with EIP-712 signing
