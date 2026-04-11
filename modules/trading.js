// ============================================================
// HENRYDESK — Trading Execution (Hyperliquid)
// ============================================================
// Semi-auto mode: executes only after Telegram approval

const { ethers } = require('ethers');
const { sendMessage } = require('./telegram');
const { saveData } = require('./watchlist');

let _S = null;
let _config = null;
let checkInterval = null;
let _wallet = null;

const HL_API = 'https://api.hyperliquid.xyz';

function initTrading(S, config) {
  _S = S;
  _config = config;

  if (config.hlPrivateKey) {
    _wallet = new ethers.Wallet(config.hlPrivateKey);
    console.log(`💰 Trading module initialized — LIVE mode`);
    console.log(`   API wallet: ${_wallet.address.slice(0, 8)}...${_wallet.address.slice(-4)}`);
    console.log(`   Main wallet: ${config.hlWalletAddress.slice(0, 8)}...${config.hlWalletAddress.slice(-4)}`);
  } else {
    console.log('💰 Trading module initialized — SIMULATION mode');
  }

  // Poll pending alerts for approved trades
  checkInterval = setInterval(() => processApprovedTrades(), 5000);

  // Monitor open positions for SL/TP
  setInterval(() => monitorPositions(), 10000);
}

// ── Hyperliquid API helpers ──

async function hlInfo(body) {
  const res = await fetch(`${HL_API}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function hlExchange(action, nonce, vaultAddress = null) {
  if (!_wallet) throw new Error('No API wallet configured');

  const timestamp = Date.now();

  // Hyperliquid EIP-712 signing
  const domain = {
    name: 'HyperliquidSignTransaction',
    version: '1',
    chainId: 1337,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  };

  // Action hash for signing
  const connectionId = vaultAddress
    ? ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address'],
        [_wallet.address, vaultAddress]
      ))
    : ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ['address'],
        [_wallet.address]
      ));

  const phantomAgent = {
    source: action.type === 'order' ? 'a' : action.type,
    connectionId,
  };

  const types = {
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' },
    ],
  };

  const signature = await _wallet.signTypedData(domain, types, phantomAgent);

  const payload = {
    action,
    nonce: timestamp,
    signature,
    vaultAddress: vaultAddress || undefined,
  };

  const res = await fetch(`${HL_API}/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (data.status === 'err') {
    // Sanitize: never expose full API response (could contain sensitive context)
    const safeMsg = typeof data.response === 'string' ? data.response.slice(0, 100) : 'Unknown error';
    throw new Error(safeMsg);
  }
  return data;
}

/**
 * Get asset index for a coin on Hyperliquid
 */
async function getAssetIndex(coin) {
  const meta = await hlInfo({ type: 'meta' });
  const idx = meta.universe.findIndex(a => a.name === coin);
  if (idx === -1) throw new Error(`Asset ${coin} not found on Hyperliquid`);
  return { index: idx, szDecimals: meta.universe[idx].szDecimals };
}

/**
 * Get current mid price for a coin
 */
async function getMidPrice(coin) {
  const data = await hlInfo({
    type: 'allMids',
  });
  const price = parseFloat(data[coin]);
  if (!price) throw new Error(`No price for ${coin}`);
  return price;
}

/**
 * Set leverage for a coin (isolated mode)
 */
async function setLeverage(assetIndex, leverage) {
  return hlExchange({
    type: 'updateLeverage',
    asset: assetIndex,
    isCross: false, // isolated
    leverage,
  });
}

// ── Trade execution ──

async function processApprovedTrades() {
  const approved = _S.pendingAlerts.filter(a => a.approved && !a.executed);

  for (const alert of approved) {
    try {
      if (_S.activePositions.length >= _config.trading.maxConcurrentTrades) {
        sendMessage(`⚠️ Max positions atteintes (${_config.trading.maxConcurrentTrades}). Trade *${alert.symbol}* en attente.`);
        continue;
      }
      await executeTrade(alert);
    } catch (err) {
      console.error(`❌ Trade execution failed for ${alert.symbol}:`, err.message);
      sendMessage(`❌ Erreur exécution *${alert.symbol}*: ${err.message.slice(0, 80)}`);
    }
  }
}

async function executeTrade(alert) {
  const { proposal } = alert;
  const coin = proposal.symbol.replace('USDT', '').replace('USD', '');

  console.log(`📈 Executing trade: ${coin} ${proposal.side} @ ${proposal.entry}`);

  if (!_wallet) {
    // Simulation mode
    sendMessage(`⚠️ Mode simulation — trade *${coin}* tracké sans exécution.`);
    trackPosition(proposal, alert, coin);
    return;
  }

  try {
    // Get asset info
    const { index: assetIndex, szDecimals } = await getAssetIndex(coin);
    const currentPrice = await getMidPrice(coin);

    // Calculate leverage from risk
    const slDistance = Math.abs(proposal.entry - proposal.sl);
    const leverage = Math.max(1, Math.min(50, Math.round(currentPrice / slDistance)));

    // Set isolated leverage
    await setLeverage(assetIndex, leverage);

    // Round size to asset decimals
    const size = parseFloat(proposal.positionSize.toFixed(szDecimals));

    // Place limit order
    const isBuy = proposal.side === 'long';
    const orderResult = await hlExchange({
      type: 'order',
      orders: [{
        a: assetIndex,
        b: isBuy,
        p: proposal.entry.toString(),
        s: size.toString(),
        r: false, // reduce only = false
        t: { limit: { tif: 'Gtc' } },
      }],
      grouping: 'na',
    });

    console.log(`📋 Order placed:`, JSON.stringify(orderResult));

    // Place SL order
    await hlExchange({
      type: 'order',
      orders: [{
        a: assetIndex,
        b: !isBuy, // opposite side
        p: proposal.sl.toString(),
        s: size.toString(),
        r: true, // reduce only
        t: {
          trigger: {
            triggerPx: proposal.sl.toString(),
            isMarket: true,
            tpsl: 'sl',
          },
        },
      }],
      grouping: 'na',
    });

    // Place TP order
    await hlExchange({
      type: 'order',
      orders: [{
        a: assetIndex,
        b: !isBuy,
        p: proposal.tp.toString(),
        s: size.toString(),
        r: true,
        t: {
          trigger: {
            triggerPx: proposal.tp.toString(),
            isMarket: true,
            tpsl: 'tp',
          },
        },
      }],
      grouping: 'na',
    });

    trackPosition(proposal, alert, coin, leverage);
    sendMessage(
      `✅ *Ordre placé sur Hyperliquid*\n\n` +
      `*${coin}* ${proposal.side.toUpperCase()} (${leverage}x isolated)\n` +
      `Entry: ${proposal.entry}\n` +
      `SL: ${proposal.sl}\n` +
      `TP: ${proposal.tp}\n` +
      `Size: ${size}\n` +
      `Risk: $${proposal.risk}\n` +
      `R:R = 1:${proposal.rr}`
    );

  } catch (err) {
    console.error(`❌ Hyperliquid order failed:`, err.message);
    sendMessage(`❌ Erreur Hyperliquid: ${err.message.slice(0, 80)}`);
    // Still track in simulation
    trackPosition(proposal, alert, coin);
  }
}

function trackPosition(proposal, alert, coin, leverage = null) {
  const position = {
    symbol: coin,
    side: proposal.side,
    entry: proposal.entry,
    sl: proposal.sl,
    tp: proposal.tp,
    size: proposal.positionSize,
    risk: proposal.risk,
    rr: proposal.rr,
    leverage: leverage || 'sim',
    openedAt: new Date().toISOString(),
    pnl: 0,
    alertId: alert.id,
  };

  _S.activePositions.push(position);
  alert.executed = true;
  _S.pendingAlerts = _S.pendingAlerts.filter(a => a.id !== alert.id);
  saveData();
  console.log(`✅ Position tracked: ${coin} ${proposal.side}`);
}

// ── Position monitoring ──

async function monitorPositions() {
  if (_S.activePositions.length === 0) return;

  for (const pos of _S.activePositions) {
    try {
      const price = await getMidPrice(pos.symbol);
      pos.pnl = pos.side === 'long'
        ? (price - pos.entry) * pos.size
        : (pos.entry - price) * pos.size;

      // Check SL/TP hit (for simulation mode or as backup)
      if (pos.side === 'long') {
        if (price <= pos.sl) await closePosition(pos.symbol, pos.sl);
        else if (price >= pos.tp) await closePosition(pos.symbol, pos.tp);
      } else {
        if (price >= pos.sl) await closePosition(pos.symbol, pos.sl);
        else if (price <= pos.tp) await closePosition(pos.symbol, pos.tp);
      }
    } catch (err) {
      // Price fetch failed, skip this cycle
    }
  }
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
