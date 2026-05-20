import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] ? `-${process.argv[3]}` : '';

const screenshotDir = path.join(__dirname, 'temporary screenshots');
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

let n = 1;
while (fs.existsSync(path.join(screenshotDir, `screenshot-${n}${label}.png`))) n++;
const outPath = path.join(screenshotDir, `screenshot-${n}${label}.png`);

const browser = await puppeteer.launch({
  headless: true,
  executablePath: (() => {
    const candidates = [
      'C:/Users/nateh/.cache/puppeteer/chrome/win64-131.0.6778.204/chrome-win64/chrome.exe',
      'C:/Users/yanag/.cache/puppeteer/chrome/win64-131.0.6778.204/chrome-win64/chrome.exe',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return undefined;
  })(),
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await page.screenshot({ path: outPath, fullPage: true });
await browser.close();

console.log(`Screenshot saved: ${outPath}`);
