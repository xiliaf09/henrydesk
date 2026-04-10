// ============================================================
// HENRYDESK — Watchlist Manager
// ============================================================

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data.json');

let _S = null;

function initWatchlist(S) {
  _S = S;
  loadData();
  console.log(`📋 Watchlist loaded: ${_S.watchlist.length} pairs`);
}

function loadData() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const raw = fs.readFileSync(DATA_PATH, 'utf-8');
      const data = JSON.parse(raw);
      _S.watchlist = data.watchlist || [];
      _S.tradeHistory = data.tradeHistory || [];
      _S.stats = data.stats || _S.stats;
    }
  } catch (err) {
    console.error('⚠️  Failed to load data.json:', err.message);
  }
}

function saveData() {
  try {
    const data = {
      watchlist: _S.watchlist,
      tradeHistory: _S.tradeHistory,
      stats: _S.stats,
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('⚠️  Failed to save data.json:', err.message);
  }
}

// Auto-save every 5 minutes
setInterval(() => {
  if (_S) saveData();
}, 5 * 60_000);

module.exports = { initWatchlist, saveData, loadData };
