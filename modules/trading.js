// ============================================================
// HENRYDESK — Trading Execution (Hyperliquid)
// ============================================================
// Semi-auto mode: executes only after Telegram approval

const { sendMessage } = require('./telegram');
const { saveData } = require('./watchlist');

let _S = null;
let _config = null;
let checkInterval = null;

function initTrading(S, config) {
  _S = S;
  _config = config;

  console.log('💰 Trading module initialized (semi-auto mode)');

  // Poll pending alerts for approved trades
  checkInterval = setInterval(() => processApprovedTrades(), 5000);
}

async function processApprovedTrades() {
  const approved = _S.pendingAlerts.filter(a => a.approved && !a.executed);

  for (const alert of approved) {
    try {
      // Check max concurrent positions
      if (_S.activePositions.length >= _config.trading.maxConcurrentTrades) {
        sendMessage(`⚠️ Max positions atteintes (${_config.trading.maxConcurrentTrades}). Trade *${alert.symbol}* en attente.`);
        continue;
      }

      await executeTrade(alert);
    } catch (err) {
      console.error(`❌ Trade execution failed for ${alert.symbol}:`, err.message);
      sendMessage(`❌ Erreur exécution *${alert.symbol}*: ${err.message}`);
    }
  }
}

async function executeTrade(alert) {
  const { proposal } = alert;

  // TODO: Implement Hyperliquid SDK order placement
  // For now, log and track the position
  console.log(`📈 Executing trade: ${proposal.symbol} ${proposal.side} @ ${proposal.entry}`);

  if (!_config.hlPrivateKey) {
    sendMessage(`⚠️ Hyperliquid API pas configurée. Trade *${proposal.symbol}* simulé.`);
    // Simulate position tracking even without API
  }

  // Add to active positions
  const position = {
    symbol: proposal.symbol,
    side: proposal.side,
    entry: proposal.entry,
    sl: proposal.sl,
    tp: proposal.tp,
    size: proposal.positionSize,
    risk: proposal.risk,
    rr: proposal.rr,
    openedAt: new Date().toISOString(),
    pnl: 0,
    alertId: alert.id,
  };

  _S.activePositions.push(position);
  alert.executed = true;

  // Remove from pending
  _S.pendingAlerts = _S.pendingAlerts.filter(a => a.id !== alert.id);

  sendMessage(
    `✅ *Position ouverte*\n\n` +
    `*${position.symbol}* ${position.side.toUpperCase()}\n` +
    `Entry: ${position.entry}\n` +
    `SL: ${position.sl}\n` +
    `TP: ${position.tp}\n` +
    `Size: ${position.size}\n` +
    `Risk: $${position.risk}\n` +
    `R:R = 1:${position.rr}`
  );

  saveData();
  console.log(`✅ Position opened: ${position.symbol} ${position.side}`);
}

async function closePosition(symbol, exitPrice) {
  const posIndex = _S.activePositions.findIndex(p => p.symbol === symbol);
  if (posIndex === -1) return;

  const pos = _S.activePositions[posIndex];
  const pnl = pos.side === 'long'
    ? (exitPrice - pos.entry) * pos.size
    : (pos.entry - exitPrice) * pos.size;

  const r = pnl / pos.risk;
  const isWin = pnl > 0;

  // Move to history
  const trade = {
    ...pos,
    exit: exitPrice,
    pnl: parseFloat(pnl.toFixed(2)),
    r: parseFloat(r.toFixed(2)),
    result: isWin ? 'win' : 'loss',
    closedAt: new Date().toISOString(),
  };

  _S.tradeHistory.push(trade);
  _S.activePositions.splice(posIndex, 1);

  // Update stats
  _S.stats.totalTrades++;
  if (isWin) _S.stats.wins++;
  else _S.stats.losses++;
  _S.stats.totalPnl += pnl;
  _S.stats.avgR = _S.tradeHistory.reduce((sum, t) => sum + t.r, 0) / _S.tradeHistory.length;

  sendMessage(
    `${isWin ? '🟢' : '🔴'} *Position fermée*\n\n` +
    `*${pos.symbol}* ${pos.side.toUpperCase()}\n` +
    `Entry: ${pos.entry} → Exit: ${exitPrice}\n` +
    `PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${r >= 0 ? '+' : ''}${r.toFixed(2)}R)\n\n` +
    `📊 Total: ${_S.stats.totalTrades} trades | WR: ${((_S.stats.wins / _S.stats.totalTrades) * 100).toFixed(0)}% | PnL: $${_S.stats.totalPnl.toFixed(2)}`
  );

  saveData();
}

module.exports = { initTrading, executeTrade, closePosition };
