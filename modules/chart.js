// ============================================================
// HENRYDESK — Chart Screenshot Generator (TradingView)
// ============================================================

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

let browser = null;

async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    console.log('🖼️  Puppeteer browser launched');
  }
  return browser;
}

/**
 * Generate a TradingView chart screenshot with Fibonacci levels drawn
 */
async function captureChart(symbol, timeframe, fiboLevels, swingHigh, swingLow) {
  const b = await initBrowser();
  const page = await b.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // TradingView timeframe mapping
  const tfMap = { '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' };
  const tvTf = tfMap[timeframe] || 'D';

  // Format symbol for TradingView (most perps are on major exchanges)
  const tvSymbol = `BINANCE:${symbol}.P`;

  // Build TradingView widget URL
  const widgetUrl = `https://s.tradingview.com/widgetembed/?` +
    `frameElementId=tv_chart&symbol=${tvSymbol}&interval=${tvTf}` +
    `&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=1a1a2e` +
    `&studies=[]&theme=dark&style=1&timezone=Etc/UTC` +
    `&withdateranges=0&showpopupbutton=0&studies_overrides={}` +
    `&overrides={"paneProperties.background":"#0a0a1a","paneProperties.backgroundType":"solid"}` +
    `&enabled_features=[]&disabled_features=["header_widget"]` +
    `&locale=en&utm_source=henrydesk`;

  try {
    await page.goto(widgetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(3000); // Let chart render

    // Draw Fibonacci levels as overlay
    await page.evaluate((levels, high, low) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:9999;';

      // Add Fibonacci level labels
      const chartHeight = window.innerHeight;
      const priceRange = high - low;

      levels.forEach(l => {
        const yPercent = ((high - l.price) / priceRange) * 100;
        const div = document.createElement('div');
        div.style.cssText = `position:absolute;right:10px;top:${yPercent}%;color:#ffd700;font-size:11px;font-family:monospace;background:rgba(0,0,0,0.7);padding:2px 6px;border-radius:3px;`;
        div.textContent = `${l.label} — $${l.price.toFixed(2)}`;
        overlay.appendChild(div);

        const line = document.createElement('div');
        line.style.cssText = `position:absolute;left:0;right:0;top:${yPercent}%;height:1px;background:rgba(255,215,0,0.4);`;
        overlay.appendChild(line);
      });

      document.body.appendChild(overlay);
    }, fiboLevels, swingHigh, swingLow);

    // Take screenshot
    const filename = `${symbol}_${timeframe}_${Date.now()}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    await page.screenshot({ path: filepath, type: 'png' });

    await page.close();
    console.log(`📸 Chart captured: ${filename}`);
    return filepath;
  } catch (err) {
    console.error(`❌ Chart capture failed for ${symbol}:`, err.message);
    await page.close().catch(() => {});
    return null;
  }
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = { captureChart, closeBrowser };
