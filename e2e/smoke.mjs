// End-to-end smoke test: builds a design in the real UI, exports the ZIP and checks its contents.
// Usage: npm run build && npm run e2e   (uses the pre-installed Playwright + Chromium)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(execSync('npm root -g').toString().trim() + '/playwright');
}

const OUT = process.env.E2E_OUT ?? 'test-results';
mkdirSync(OUT, { recursive: true });
const PORT = 4321;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const url = `http://localhost:${PORT}/`;

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
  console.log('  ✓ ' + msg);
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await waitForServer();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.topbar', { timeout: 30000 });

  console.log('design');
  await page.click('[data-testid=template-dual]');
  await page.waitForTimeout(800);
  const unique0 = await page.textContent('.stats');
  assert(unique0.includes('Printed parts'), 'overview shows stats');

  // Drag a new post from the palette onto the desk (HTML5 drag and drop)
  const canvas = page.locator('[data-testid=viewport] canvas');
  const box = await canvas.boundingBox();
  const postsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('rod-desk-planner')).state.design.posts.length);
  await page.dragAndDrop('[data-testid=palette-post]', '[data-testid=viewport] canvas', { targetPosition: { x: box.width * 0.2, y: box.height * 0.85 } });
  await page.waitForTimeout(500);
  const postsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('rod-desk-planner')).state.design.posts.length);
  assert(postsAfter === postsBefore + 1, `drag & drop added a post (${postsBefore} → ${postsAfter})`);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  const postsUndo = await page.evaluate(() => JSON.parse(localStorage.getItem('rod-desk-planner')).state.design.posts.length);
  assert(postsUndo === postsBefore, 'undo removes it again');

  // Drop a watch stand onto the tall back-right post (found via its dimension label).
  const addonsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('rod-desk-planner')).state.design.addons.length);
  const label = page.locator('.dim-label', { hasText: 'P6 · 420' });
  const lb = await label.boundingBox();
  await page.dragAndDrop('[data-testid=palette-watch]', '[data-testid=viewport] canvas', {
    targetPosition: { x: lb.x - box.x + lb.width / 2, y: lb.y - box.y + lb.height / 2 + 110 },
  });
  await page.waitForTimeout(600);
  const addonsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('rod-desk-planner')).state.design.addons.length);
  const toast = await page.locator('.toast').textContent().catch(() => '');
  assert(addonsAfter === addonsBefore + 1, `dropped a watch stand onto a post (${toast || 'ok'})`);
  await page.screenshot({ path: `${OUT}/design.png` });

  // Drag a post inside the scene (Top view, grab it by its connector)
  await page.click('text=Top');
  await page.waitForTimeout(800);
  const getPost = () => page.evaluate(() => JSON.parse(localStorage.getItem('rod-desk-planner')).state.design.posts[1]);
  const before = await getPost();
  const p2 = await page.locator('.dim-label', { hasText: 'P2 · 150' }).boundingBox();
  await page.mouse.move(p2.x + p2.width / 2, p2.y + p2.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(p2.x + p2.width / 2 + i * 8, p2.y + p2.height / 2 + 1);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await getPost();
  assert(after.x > before.x && after.x % 10 === 0 && after.y === before.y, `dragging the post moves it on the grid (x ${before.x} → ${after.x})`);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  assert((await getPost()).x === before.x, 'undo puts it back');
  await page.click('text=3D');

  console.log('export');
  await page.click('[data-testid=tab-parts]');
  await page.waitForSelector('[data-testid=parts-view] .card');
  const cards = await page.locator('.card').count();
  assert(cards >= 8, `parts view lists ${cards} unique parts`);
  await page.screenshot({ path: `${OUT}/parts.png` });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=export-zip]')]);
  const zipPath = `${OUT}/${download.suggestedFilename()}`;
  await download.saveAs(zipPath);
  const zip = unzipSync(new Uint8Array(readFileSync(zipPath)));
  const names = Object.keys(zip);
  const stls = names.filter((n) => n.startsWith('parts/') && n.endsWith('.stl'));
  assert(names.includes('assembly.pdf') && names.includes('cut-list.csv') && names.includes('design.json') && names.includes('fit-test.stl'), 'zip has pdf, cut list, design and fit test');
  assert(stls.length === cards, `zip has one STL per unique part (${stls.length})`);
  const bed = JSON.parse(strFromU8(zip['design.json'])).settings.bed;
  for (const n of stls) {
    const u8 = zip[n];
    const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    const v = new DataView(buf);
    const tris = v.getUint32(80, true);
    if (buf.byteLength !== 84 + tris * 50 || tris < 12) throw new Error(`bad STL ${n}`);
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (let t = 0; t < tris; t++)
      for (let k = 0; k < 9; k++) {
        const x = v.getFloat32(84 + t * 50 + 12 + k * 4, true);
        min[k % 3] = Math.min(min[k % 3], x);
        max[k % 3] = Math.max(max[k % 3], x);
      }
    const size = max.map((m, i) => m - min[i]);
    const fits = size[2] <= bed[2] && ((size[0] <= bed[0] && size[1] <= bed[1]) || (size[0] <= bed[1] && size[1] <= bed[0]));
    if (!fits || Math.abs(min[2]) > 1e-3) throw new Error(`${n} does not sit on / fit the bed: ${size}`);
  }
  assert(true, `all ${stls.length} STLs parse, sit on z=0 and fit the ${bed.join('×')} bed`);
  const pdf = zip['assembly.pdf'];
  assert(new TextDecoder().decode(pdf.slice(0, 5)) === '%PDF-' && pdf.length > 20000, `assembly.pdf is a PDF (${(pdf.length / 1024).toFixed(0)} kB, with snapshot)`);
  assert(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  console.log('\nE2E passed');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
