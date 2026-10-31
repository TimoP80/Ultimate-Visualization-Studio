/**
 * Headless interaction check for the preview selection system.
 *
 * Starts Vite, launches Chrome headless, adds a text layer, then verifies the
 * real pointer flow: deselect in the stage margin, click-select on the canvas,
 * resize from a corner handle, undo the resize and open/close the inline text
 * editor. Exits non-zero on the first failed check.
 *
 * Usage: node scripts/verify-interaction.mjs
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP_PORT = 5199;
const DEBUG_PORT = 9333;
const APP_URL = `http://127.0.0.1:${APP_PORT}/`;

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!chromePath) {
  console.error('No Chrome/Edge binary found. Set CHROME_PATH to run this check.');
  process.exit(2);
}

const userDataDir = mkdtempSync(path.join(tmpdir(), 'uvs-verify-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let server = null;
let chrome = null;
let socket = null;

async function waitForHttp(url, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      /* retry */
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { ws, ready, send };
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
    throw new Error(description);
  }
  return result.result?.value;
}

const pageScript = `(async () => {
  const log = [];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (fn, label, timeout = 12000) => {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const value = fn();
      if (value) return value;
      await sleep(40);
    }
    throw new Error('Timed out waiting for ' + label);
  };
  const byText = (pattern) =>
    [...document.querySelectorAll('button')].find((button) => pattern.test((button.textContent || '').trim()));

  await waitFor(() => document.querySelector('.sel-overlay'), 'the editor to mount', 20000);
  await sleep(700);

  const elementsTab = byText(/^Elements$/);
  if (!elementsTab) throw new Error('Elements tab not found');

  // Add exactly one text layer, tolerating a slow first interaction on CI where
  // the sidebar tab has not painted its panel yet.
  const titleItem = () =>
    [...document.querySelectorAll('.list-item')].find(
      (item) => item.querySelector('.grow')?.textContent?.trim() === 'Title',
    );
  let added = false;
  for (let attempt = 0; attempt < 8 && !added; attempt++) {
    elementsTab.click();
    await sleep(150);
    if (!titleItem()) {
      const textButton = [...document.querySelectorAll('.sidebar-content button')].find(
        (button) => (button.textContent || '').trim() === 'Text',
      );
      textButton?.click();
      await sleep(180);
    }
    const item = titleItem();
    if (item) {
      item.click();
      await sleep(120);
      added = Boolean(document.querySelector('.sel-outline'));
    }
    if (!added) await sleep(200);
  }
  if (!added) throw new Error('could not add and select a text layer');
  const addedName = document.querySelector('.sel-badge .name')?.textContent ?? '';
  if (addedName !== 'Title') throw new Error('new text layer not selected: ' + addedName);
  log.push('adding a text layer selects it');

  const overlay = document.querySelector('.sel-overlay');
  const rect = overlay.getBoundingClientRect();
  const pointsOf = () => document.querySelector('.sel-outline')?.getAttribute('points') ?? '';
  const parsePoints = (value) =>
    value.trim().split(/\\s+/).map((pair) => pair.split(',').map(Number));
  const centre = () => {
    const points = parsePoints(pointsOf());
    return {
      x: points.reduce((sum, point) => sum + point[0], 0) / points.length,
      y: points.reduce((sum, point) => sum + point[1], 0) / points.length,
    };
  };
  const toClient = (normalised) => ({
    x: rect.left + (normalised.x / 100) * rect.width,
    y: rect.top + (normalised.y / 100) * rect.height,
  });
  const pointer = (type, target, x, y, id) =>
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        pointerId: id,
        isPrimary: true,
        pointerType: 'mouse',
      }),
    );

  // Remember the glyph centre while the outline still exists: the layer does
  // not move, so the same screen point is used to select it again later.
  const normalisedCentre = centre();

  const viewport = document.querySelector('.stage-viewport');
  const viewportRect = viewport.getBoundingClientRect();
  pointer('pointerdown', viewport, viewportRect.left + 2, viewportRect.top + 2, 11);
  await sleep(120);
  if (document.querySelector('.sel-outline')) throw new Error('clicking the stage margin did not deselect');
  log.push('clicking outside the frame deselects');

  let position = toClient(normalisedCentre);
  pointer('pointerdown', overlay, position.x, position.y, 12);
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: position.x, clientY: position.y, pointerId: 12 }));
  await waitFor(() => document.querySelector('.sel-outline'), 'selection after a canvas click');
  const clickedName = document.querySelector('.sel-badge .name')?.textContent;
  if (clickedName !== 'Title') throw new Error('canvas click selected the wrong layer: ' + clickedName);
  log.push('clicking the element on the canvas selects it');

  const beforeResize = pointsOf();
  const handle = document.querySelector('.sel-handle--se');
  if (!handle) throw new Error('bottom-right resize handle missing');
  const handleRect = handle.getBoundingClientRect();
  const hx = handleRect.left + handleRect.width / 2;
  const hy = handleRect.top + handleRect.height / 2;
  pointer('pointerdown', handle, hx, hy, 13);
  await sleep(30);
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: hx + 70, clientY: hy + 45, pointerId: 13 }));
  await sleep(100);
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: hx + 70, clientY: hy + 45, pointerId: 13 }));
  await sleep(150);
  if (pointsOf() === beforeResize) throw new Error('dragging the handle did not resize the layer');
  if (document.querySelector('.sel-badge .name')?.textContent !== 'Title') throw new Error('selection was lost while resizing');
  log.push('corner handle resizes and keeps the selection');

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  await sleep(200);
  if (pointsOf() !== beforeResize) throw new Error('undo did not restore the pre-resize geometry');
  log.push('undo restores the pre-resize geometry');

  position = toClient(normalisedCentre);
  overlay.dispatchEvent(
    new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: position.x, clientY: position.y, button: 0 }),
  );
  const editor = await waitFor(() => document.querySelector('.text-inline-editor'), 'the inline text editor');
  if (editor.value !== 'ULTIMATE') throw new Error('inline editor did not receive the layer text');
  log.push('double-click opens the inline editor');
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(150);
  if (document.querySelector('.text-inline-editor')) throw new Error('Escape did not close the inline editor');
  log.push('Escape closes the editor without losing selection');

  const layerItem = (name) =>
    [...document.querySelectorAll('.list-item')].find(
      (item) => item.querySelector('.grow')?.textContent?.trim() === name,
    );
  const canvasClick = async (id) => {
    const point = toClient(normalisedCentre);
    pointer('pointerdown', overlay, point.x, point.y, id);
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: point.x, clientY: point.y, pointerId: id }));
    await sleep(140);
    return document.querySelector('.sel-badge .name')?.textContent ?? null;
  };

  // Locked layers are click-through: the template below becomes selected.
  const lockButton = layerItem('Title')?.querySelector('button[title="Lock layer"]');
  if (!lockButton) throw new Error('lock control not found');
  lockButton.click();
  await sleep(160);
  const afterLockClick = await canvasClick(21);
  if (afterLockClick === 'Title') throw new Error('a locked layer was selected on the canvas');
  log.push('locked layer is skipped by canvas hit-testing');

  layerItem('Title')?.querySelector('button[title="Unlock layer"]')?.click();
  await sleep(160);
  const afterUnlockClick = await canvasClick(22);
  if (afterUnlockClick !== 'Title') throw new Error('unlocked text layer could not be selected');
  log.push('unlocked layer selects normally again');

  // Hidden layers disappear from the canvas and from hit-testing.
  layerItem('Title')?.querySelector('button[title="Hide layer"]')?.click();
  await sleep(160);
  if (document.querySelector('.sel-outline')) throw new Error('hidden layer still shows a selection outline');
  const afterHideClick = await canvasClick(23);
  if (afterHideClick === 'Title') throw new Error('a hidden layer was selected on the canvas');
  log.push('hidden layer is not drawn or hit-tested');

  layerItem('Title')?.querySelector('button[title="Show layer"]')?.click();
  await sleep(160);
  const afterShowClick = await canvasClick(24);
  if (afterShowClick !== 'Title') throw new Error('visible text layer could not be selected again');
  log.push('showing the layer restores selection');

  return { ok: true, checks: log };
})()`;

async function main() {
  server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--port', String(APP_PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: process.cwd(), stdio: 'ignore' },
  );
  await waitForHttp(APP_URL);

  chrome = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--window-size=1440,900',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
  const created = await fetch(
    `http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`,
    { method: 'PUT' },
  ).then((response) => response.json());

  const client = startCdp(created.webSocketDebuggerUrl);
  socket = client.ws;
  await client.ready;
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await client.send('Page.navigate', { url: APP_URL });

  const result = await evaluate(client, pageScript);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error('INTERACTION CHECK FAILED:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      socket?.close();
    } catch {
      /* ignore */
    }
    chrome?.kill();
    server?.kill();
    await sleep(600);
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* Chrome may still hold a file on Windows */
    }
  });
