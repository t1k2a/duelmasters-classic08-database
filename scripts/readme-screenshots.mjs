import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../docs/screenshots');
mkdirSync(outDir, { recursive: true });

const PORT = 4178;
const BASE = `http://localhost:${PORT}`;

// 静的サーバ起動
const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
  cwd: path.join(__dirname, '../public'),
  stdio: 'ignore',
});

// サーバ待ち
async function waitServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(BASE + '/index.html');
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('server did not start');
}
await waitServer();

const shots = [
  { id: 'top', url: '/index.html', viewport: { width: 1280, height: 900 } },
  { id: 'meta', url: '/meta.html', viewport: { width: 1280, height: 900 } },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ deviceScaleFactor: 1 });

for (const shot of shots) {
  const page = await context.newPage();
  await page.setViewportSize(shot.viewport);
  await page.goto(`${BASE}${shot.url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, `${shot.id}.png`) });
  console.log(`saved ${shot.id}.png`);
  await page.close();
}

await browser.close();
server.kill();
console.log('done');
process.exit(0);
