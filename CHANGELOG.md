# Changelog

## v1.1.0 (2026-04-12)

**Signaux Telegram Pro — Scoring, Analyse Enrichie, Quick Adjust**

### Features
- Système de scoring (0-100) avec grade A/B/C/D pour chaque setup
- Analyse de trend multi-timeframe (EMA 20/50 par TF)
- Analyse de volume vs moyenne 20 bougies
- Thèse contextuelle enrichie (trend alignment, fibo quality, volume)
- Messages Telegram redesignés : format pro, $ outcomes en premier
- Boutons d'action rapide : GO / PASS / TP élargi / SL serré
- Filtrage automatique : setups grade D (score < 50) ne déclenchent plus d'alerte
- Leverage calculé auto dans les propositions (cap 20x)

### Améliorations
- R:R affiché avec étoiles (⭐ ≥2.5, ⭐⭐ ≥3)
- Pourcentages SL/TP dans les messages d'exécution
- /test enrichi : génère une alerte complète avec scoring réel
- /stats affiche le compteur d'alertes (envoyées/approuvées/rejetées)
- Protection division par zéro dans generateProposal

---

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
