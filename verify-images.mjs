import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const URL = 'http://localhost:8000/';
const DEFAULT_SNIPPET = 'Image+Not+Available';

async function waitForImages(page) {
  await page.waitForSelector('#product-grid .product-card img', { timeout: 120000 });
  await page.waitForFunction(() => {
    const spinner = document.getElementById('loading-spinner');
    return !spinner || spinner.style.display === 'none';
  }, { timeout: 120000 });

  // Scroll to load all lazy images
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 120);
    });
  });

  await page.waitForTimeout(4000);
}

async function auditImages(page) {
  return page.evaluate((placeholderSnippet) => {
    const cards = [...document.querySelectorAll('#product-grid .product-card')];
    return cards.map((card, index) => {
      const img = card.querySelector('img');
      const title = card.querySelector('.product-title')?.textContent?.trim() || `Product ${index + 1}`;
      const src = img?.currentSrc || img?.src || '';
      const loaded = Boolean(img && img.complete && img.naturalWidth > 0);
      const isPlaceholder = src.includes(placeholderSnippet) || src.startsWith('data:image/svg+xml');
      return {
        index: index + 1,
        title,
        loaded,
        isPlaceholder,
        ok: loaded && !isPlaceholder,
        src: src.slice(0, 120)
      };
    });
  }, DEFAULT_SNIPPET);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 120000 });
await waitForImages(page);

const results = await auditImages(page);
const total = results.length;
const ok = results.filter((r) => r.ok).length;
const broken = results.filter((r) => !r.ok);

await page.screenshot({ path: 'catalogue-top.png', fullPage: false });
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
await page.waitForTimeout(500);
await page.screenshot({ path: 'catalogue-middle.png', fullPage: false });
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);
await page.screenshot({ path: 'catalogue-bottom.png', fullPage: false });

const report = {
  url: URL,
  total,
  ok,
  broken: broken.length,
  brokenItems: broken
};

writeFileSync('image-audit.json', JSON.stringify(report, null, 2));

console.log(JSON.stringify({ total, ok, broken: broken.length, brokenItems: broken }, null, 2));

await browser.close();