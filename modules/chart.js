// ============================================================
// HENRYDESK — Chart Screenshot Generator
// Lightweight Charts + Puppeteer
// ============================================================

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'chart.html');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

let browser = null;

async function initBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
    });
    console.log('🖼️  Puppeteer browser launched');
  }
  return browser;
}

/**
 * Generate both chart screenshots for a Fibonacci alert
 * Returns { macroPath, tradePath }
 */
async function captureCharts(symbol, timeframe, candles, fiboLevels, swingHigh, swingLow, trade) {
  const b = await initBrowser();
  const timestamp = Date.now();
  const results = {};

  // ── Screenshot 1: Macro view (Fibonacci overview) ──
  try {
    results.macroPath = await renderChart({
      candles,
      symbol,
      timeframe,
      fiboLevels,
      swingHigh,
      swingLow,
      trade: null,
      mode: 'macro',
    }, `${symbol}_${timeframe}_macro_${timestamp}.png`);
    console.log(`📸 Macro chart: ${symbol} ${timeframe}`);
  } catch (err) {
    console.error(`❌ Macro chart failed:`, err.message);
    results.macroPath = null;
  }

  // ── Screenshot 2: Trade setup (zoomed with entry/SL/TP) ──
  if (trade) {
    try {
      results.tradePath = await renderChart({
        candles,
        symbol,
        timeframe,
        fiboLevels,
        swingHigh,
        swingLow,
        trade,
        mode: 'trade',
      }, `${symbol}_${timeframe}_trade_${timestamp}.png`);
      console.log(`📸 Trade chart: ${symbol} ${timeframe}`);
    } catch (err) {
      console.error(`❌ Trade chart failed:`, err.message);
      results.tradePath = null;
    }
  }

  return results;
}

async function renderChart(data, filename) {
  const b = await initBrowser();
  const page = await b.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Load template
  const templateUrl = 'file:///' + TEMPLATE_PATH.replace(/\\/g, '/');
  await page.goto(templateUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

  // Inject chart data
  await page.evaluate((chartData) => {
    window.__CHART_DATA__ = chartData;
  }, data);

  // Wait for chart to render
  await page.waitForFunction(() => window.__CHART_READY__ === true, { timeout: 10000 });
  // Extra wait for animations
  await new Promise(r => setTimeout(r, 500));

  // Screenshot
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: filepath, type: 'png' });
  await page.close();

  return filepath;
}

/**
 * Quick test: generate chart with real data
 */
async function testChart(symbol = 'BTC', timeframe = '1d') {
  const { calcFiboLevels, getLatestSwings } = require('./fibonacci');

  // Fetch candles
  const res = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'candleSnapshot',
      req: {
        coin: symbol,
        interval: timeframe,
        startTime: Date.now() - (200 * 86400000),
        endTime: Date.now(),
      },
    }),
  });
  const raw = await res.json();
  const candles = raw.map(c => ({
    time: c.t,
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
    volume: parseFloat(c.v),
  }));

  // Detect swings
  const swings = getLatestSwings(candles, 5);
  const swingHigh = swings.swingHigh?.price || Math.max(...candles.slice(-50).map(c => c.high));
  const swingLow = swings.swingLow?.price || Math.min(...candles.slice(-50).map(c => c.low));

  // Fibo levels
  const fiboLevels = calcFiboLevels(swingHigh, swingLow);

  // Mock trade for testing — ensure R:R >= 2
  const lastPrice = candles[candles.length - 1].close;
  const slPrice = swingLow * 0.995;
  const slDist = Math.abs(lastPrice - slPrice);
  const tpPrice = lastPrice + (slDist * 2.5); // force R:R = 2.5
  const posSize = 500 / slDist;
  const mockTrade = {
    symbol,
    side: 'long',
    entry: lastPrice,
    sl: slPrice,
    tp: tpPrice,
    risk: 500,
    positionSize: posSize,
    rr: 2.5,
    potentialWin: parseFloat((slDist * 2.5 * posSize).toFixed(2)),
    potentialLoss: 500,
  };

  const results = await captureCharts(symbol, timeframe, candles, fiboLevels, swingHigh, swingLow, mockTrade);
  results._testProposal = mockTrade;
  console.log('📸 Test charts generated:', { macroPath: results.macroPath, tradePath: results.tradePath });
  return results;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = { captureCharts, testChart, closeBrowser };
