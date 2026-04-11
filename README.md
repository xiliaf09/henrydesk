# 📈 HenryDesk

**Assistant de trading futures basé sur les Fibonacci — Hyperliquid × Telegram × Jarvis Hub**

---

## Concept

HenryDesk surveille une watchlist de paires futures, trace automatiquement les niveaux Fibonacci sur les grosses timeframes, et envoie des alertes visuelles sur Telegram quand un niveau clé est touché. Mode semi-automatique : le bot propose, tu valides, il exécute sur Hyperliquid.

## Fonctionnalités

| Feature | Description |
|---------|-------------|
| 📐 **Fibonacci Scanner** | Détection auto des swings + calcul niveaux Fibo (0.236 → 0.786) |
| 📊 **Charts pro** | 2 screenshots par alerte : vue macro + trade setup zoomé |
| 📱 **Bot Telegram** | Commandes watchlist, stats, test + boutons Approuver/Rejeter |
| 💰 **Hyperliquid Trading** | Exécution live — isolated margin, SL/TP auto |
| 🖥️ **Jarvis Hub** | Vue intégrée — watchlist, positions, stats, historique |
| 🔒 **Risk Management** | Montant fixe par trade ($500), max 2 positions |

## Architecture

```
index.js          → Boot + API Express (port 3334)
config.js         → Configuration + env vars
modules/
  telegram.js     → Bot Telegram (commandes + inline buttons)
  fibonacci.js    → Détection swings + calcul niveaux + propositions
  scanner.js      → Boucle de scan watchlist → alertes
  chart.js        → Screenshots Lightweight Charts via Puppeteer
  trading.js      → Exécution Hyperliquid (EIP-712 signing)
  watchlist.js    → Persistence data.json
templates/
  chart.html      → Template de rendu charts (dark theme, pro)
```

## Stratégie

- **Timeframes** : 4H + Daily + Weekly
- **Niveaux Fibo** : 0.236, 0.382, 0.5, 0.618, 0.786
- **Détection swings** : automatique (N-bar pivot) + override manuel
- **Mode** : semi-auto — alerte → validation Telegram → exécution
- **Risk** : isolated margin, risque fixe en $ par trade, levier calculé auto
- **Filtre** : R:R minimum 1.5 pour déclencher une alerte

## Flow d'alerte

```
Scanner détecte Fibo touché
  → Screenshot 1 : vue macro (Fibonacci + swings)
  → Screenshot 2 : trade setup (Entry/SL/TP zoomé)
  → Message Telegram avec proposition
  → Boutons : ✅ Approuver | ❌ Rejeter | ✏️ Ajuster
  → Si approuvé → ordre Hyperliquid (limit + SL/TP)
```

## Commandes Telegram

| Commande | Action |
|----------|--------|
| `/start` | Message de bienvenue + liste commandes |
| `/watchlist` | Voir la watchlist |
| `/add BTC` | Ajouter BTC à la surveillance |
| `/remove BTC` | Retirer BTC |
| `/positions` | Voir les positions ouvertes |
| `/stats` | Win rate, PnL, avg R |
| `/status` | État du bot |
| `/test BTC` | Générer un test alert avec screenshots |

## API

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Status, version, uptime |
| `/api/state` | GET | État complet |
| `/api/watchlist` | GET | Watchlist |
| `/api/watchlist` | POST | Ajouter/retirer `{ symbol, action? }` |
| `/api/positions` | GET | Positions ouvertes |
| `/api/history` | GET | Historique trades |
| `/api/stats` | GET | Statistiques |

## Variables d'environnement

```env
# Required
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Required for live trading
HYPERLIQUID_WALLET_ADDRESS=       # Main wallet address
HYPERLIQUID_API_WALLET_ADDRESS=   # API wallet address
HYPERLIQUID_PRIVATE_KEY=          # API wallet private key

# Optional
PORT=3334
HUB_RELAY_URL=http://localhost:3333
```

## Setup

```bash
# Clone
git clone https://github.com/xiliaf09/henrydesk.git
cd henrydesk

# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your values

# Run
node index.js
```

## Infrastructure

| Composant | Détail |
|-----------|--------|
| **Local** | `http://localhost:3334` |
| **GitHub** | `xiliaf09/henrydesk` (privé) |
| **Railway** | Projet `henrydesk`, auto-deploy on push |
| **Telegram** | `@HenryDesk_bot` |
| **Hyperliquid** | API wallet avec signature EIP-712 |
| **Jarvis Hub** | Proxy via `/api/henrydesk/*` |

---

*Built with Claude Code · v1.0.0*
