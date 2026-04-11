# Changelog

## v1.0.0 (2026-04-11)

**Release initiale — HenryDesk**

### Features
- Scanner Fibonacci : 4H + Daily + Weekly, niveaux 0.236-0.786
- Détection automatique des swings (N-bar pivot) + override manuel
- Bot Telegram `@HenryDesk_bot` avec commandes complètes
- Double screenshot par alerte (macro + trade setup) via Lightweight Charts
- Exécution semi-auto sur Hyperliquid (isolated margin, SL/TP auto)
- Vue intégrée dans Jarvis Hub (watchlist, positions, stats, historique)
- Risk management : montant fixe par trade, max 2 positions, R:R minimum 1.5
- Commande `/test` pour tester les charts à la demande
- API REST pour intégration Jarvis Hub (proxy `/api/henrydesk/*`)

### Infrastructure
- Repo GitHub `xiliaf09/henrydesk` (privé)
- Railway : projet + service configurés, env vars en place
- Persistence via `data.json`

### Tech
- Node.js + Express + Puppeteer + ethers.js v6
- Lightweight Charts (TradingView open-source) pour le rendu charts
- Signature EIP-712 pour les ordres Hyperliquid
- Anti-duplicate Telegram (tracking `message_id`)
