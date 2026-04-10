# HENRYDESK — Claude Code Instructions

## Project
- **HenryDesk** — Fibonacci-based futures trading assistant for Hyperliquid
- **Modules**: index.js, config.js + modules/ (telegram, watchlist, fibonacci, chart, scanner, trading)
- **Runtime**: Node.js, Puppeteer (TradingView screenshots)
- **Local**: `http://localhost:3334`
- **Railway**: service `henrydesk` (à configurer)

## Architecture
- **Semi-auto**: bot détecte les setups Fibo → envoie alerte Telegram → user valide → exécution
- **Watchlist dynamique**: gérable via Telegram (/add, /remove) + API HTTP (Jarvis Hub)
- **Fibonacci**: 4H + Daily + Weekly, niveaux 0.236/0.382/0.5/0.618/0.786
- **Swings**: détection auto + override manuel
- **Risk**: isolated margin, montant fixe en $ par trade ($500 défaut), max 2 positions
- **Charts**: screenshots TradingView via Puppeteer headless

## Env vars
- `TELEGRAM_BOT_TOKEN` — required
- `TELEGRAM_CHAT_ID` — required  
- `HYPERLIQUID_WALLET_ADDRESS` — required for live trading
- `HYPERLIQUID_PRIVATE_KEY` — required for live trading
- `PORT` — default 3334
- `HUB_RELAY_URL` — Jarvis Hub URL for relay

## API endpoints
- GET /health — status
- GET /api/state — full state
- GET /api/watchlist — watchlist
- POST /api/watchlist — add/remove pair { symbol, action? }
- GET /api/positions — active positions
- GET /api/history — trade history
- GET /api/stats — win rate, PnL, avg R

## Telegram commands
- /start — intro
- /watchlist — voir la watchlist
- /add SYMBOL — ajouter une paire
- /remove SYMBOL — retirer une paire
- /positions — positions ouvertes
- /stats — statistiques
- /status — état du bot
