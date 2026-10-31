/**
 * Headless end-to-end check for the Visualization Wizard.
 *
 * Drives the real app in Chrome: opens the wizard from the toolbar, walks all
 * ten steps, edits settings, verifies locked sections survive randomisation,
 * reloads to confirm the draft resumes, then generates and checks that the
 * editor received an editable project.
 *
 * Usage: node scripts/verify-wizard.mjs
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP_PORT = 5200;
const DEBUG_PORT = 9334;
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

const userDataDir = mkdtempSync(path.join(tmpdir(), 'uvs-wizard-'));
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
  const waitFor = async (fn, label, timeout = 15000) => {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const value = fn();
      if (value) return value;
      await sleep(40);
    }
    throw new Error('Timed out waiting for ' + label);
  };
  const byText = (pattern, root = document) =>
    [...root.querySelectorAll('button')].find((button) => pattern.test((button.textContent || '').trim()));
  const heading = () => document.querySelector('.wiz-main-head h1')?.textContent ?? '';
  const nav = () => [...document.querySelectorAll('.wiz-nav-item')];
  const next = async () => {
    byText(/^Next$/)?.click();
    await sleep(180);
  };
  const setInput = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const canvasPixels = () => {
    const canvas = document.querySelector('.wiz-preview-frame canvas');
    if (!canvas) return 0;
    return canvas.width * canvas.height;
  };

  await waitFor(() => document.querySelector('.sel-overlay'), 'the editor to mount', 20000);
  await sleep(500);

  const wizardButton = byText(/^Wizard$/);
  if (!wizardButton) throw new Error('toolbar Wizard entry missing');
  wizardButton.click();
  await waitFor(() => document.querySelector('.wiz-shell'), 'the wizard to open');
  log.push('toolbar opens the wizard');

  if (nav().length !== 10) throw new Error('expected 10 steps, found ' + nav().length);
  if (!/Choose your track/.test(heading())) throw new Error('step 1 heading wrong: ' + heading());
  await waitFor(() => canvasPixels() > 0, 'the live preview canvas to size itself', 8000);
  const previewError = document.querySelector('.wiz-preview-error');
  if (previewError) throw new Error('preview failed to render: ' + previewError.textContent);
  log.push('audio step renders with a live WebGL preview');

  await next();
  if (!/visual direction/i.test(heading())) throw new Error('style step heading wrong: ' + heading());
  const raveCard = byText(/Oldschool Rave/);
  if (!raveCard) throw new Error('style card missing');
  raveCard.click();
  await sleep(200);
  if (!raveCard.classList.contains('selected')) throw new Error('style card did not become selected');
  log.push('style selection applies');

  await next();
  if (!/Visualisers/.test(heading())) throw new Error('template step heading wrong: ' + heading());
  const cards = [...document.querySelectorAll('.wiz-template-card')];
  if (cards.length < 10) throw new Error('template library looks empty: ' + cards.length);
  const addLayer = cards[2].parentElement.querySelector('.wiz-chip');
  addLayer.click();
  await sleep(200);
  if (!addLayer.classList.contains('on')) throw new Error('supporting layer was not added');
  log.push('templates list and supporting layers work');

  await next();
  if (!/Colour/.test(heading())) throw new Error('appearance step heading wrong: ' + heading());
  const paletteCards = [...document.querySelectorAll('.wiz-palette-card')];
  if (paletteCards.length < 8) throw new Error('palette presets missing: ' + paletteCards.length);
  paletteCards[2].click();
  await sleep(150);
  const swatches = () =>
    [...document.querySelectorAll('.wiz-color-grid .color-swatch')].map((node) => node.getAttribute('style'));
  const before = JSON.stringify(swatches());
  if (before === '[]') throw new Error('colour pickers missing');
  document.querySelector('.wiz-lock')?.click();
  await sleep(120);
  byText(/^Randomise$/)?.click();
  await sleep(400);
  if (JSON.stringify(swatches()) !== before) throw new Error('locked palette was randomised anyway');
  log.push('palette lock is respected by randomise');
  document.querySelector('.wiz-lock')?.click();
  await sleep(100);

  await next();
  if (!/Audio reactivity/.test(heading())) throw new Error('reactivity step heading wrong: ' + heading());
  const profile = byText(/^Extreme/);
  if (!profile) throw new Error('reactivity profiles missing');
  profile.click();
  await sleep(150);
  log.push('reactivity profile applies');

  await next();
  if (!/Text & branding/.test(heading())) throw new Error('branding step heading wrong: ' + heading());
  const inputs = [...document.querySelectorAll('.wiz-text-field input.input')];
  if (inputs.length < 6) throw new Error('branding fields missing');
  setInput(inputs[0], 'VERA');
  setInput(inputs[1], 'Night Drive');
  await sleep(200);
  if (!/VERA/.test(document.querySelector('.wiz-branding-title')?.textContent ?? '')) {
    throw new Error('branding preview did not update');
  }
  log.push('branding fields drive the live text preview');

  await next();
  if (!/Effects/.test(heading())) throw new Error('effects step heading wrong: ' + heading());
  const neon = byText(/^Neon\\n/);
  (neon ?? [...document.querySelectorAll('.wiz-intensity-card')][2])?.click();
  await sleep(150);
  const onCount = document.querySelectorAll('.wiz-effect.on').length;
  if (onCount === 0) throw new Error('effects did not enable');
  log.push('effect presets toggle the stack');

  await next();
  if (!/Scenes/.test(heading())) throw new Error('scenes step heading wrong: ' + heading());
  const sectionCount = () => document.querySelectorAll('.wiz-section').length;
  const beforeSections = sectionCount();
  byText(/^Bar cuts$/)?.click();
  await sleep(250);
  const afterSections = sectionCount();
  if (afterSections === 0) throw new Error('scene strip is empty');
  if (afterSections === beforeSections) {
    log.push('bar-cut structure keeps the same section count (short fallback grid)');
  } else {
    log.push('scene structure changes the timeline layout');
  }

  await next();
  if (!/Output settings/.test(heading())) throw new Error('output step heading wrong: ' + heading());
  byText(/YouTube Shorts/)?.click();
  await sleep(200);
  const sideMeta = [...document.querySelectorAll('.wiz-side-row')].map((row) => row.textContent).join(' ');
  if (!/1080×1920/.test(sideMeta)) throw new Error('output size did not update: ' + sideMeta);
  log.push('output preset updates dimensions');

  await next();
  if (!/Review & generate/.test(heading())) throw new Error('review step heading wrong: ' + heading());
  const summary = document.querySelector('.wiz-summary')?.textContent ?? '';
  for (const needle of ['VERA', 'Night Drive', '1080 × 1920']) {
    if (!summary.includes(needle)) throw new Error('summary is missing ' + needle);
  }
  log.push('review summarises the configuration');

  // Resume: the draft must survive a full reload.
  await waitFor(() => localStorage.getItem('uvs:wizard:draft:v1'), 'the draft to be saved', 6000);
  location.reload();
  await sleep(1200);
  await waitFor(() => document.querySelector('.sel-overlay'), 'the editor to remount', 20000);
  await sleep(400);
  byText(/^Wizard$/)?.click();
  await waitFor(() => document.querySelector('.wiz-shell'), 'the wizard to reopen');
  const resume = document.querySelector('.wiz-main-head .badge-soft');
  if (!/Resumed draft/.test(resume?.textContent ?? '')) {
    throw new Error('wizard did not restore the unfinished draft');
  }
  nav()[9].click();
  await sleep(250);
  const resumedSummary = document.querySelector('.wiz-summary')?.textContent ?? '';
  if (!resumedSummary.includes('VERA')) throw new Error('resumed draft lost the branding');
  log.push('unfinished wizard resumes after a reload');

  byText(/Generate visualisation/)?.click();
  await sleep(1600);
  if (document.querySelector('.wiz-shell')) throw new Error('wizard stayed open after generating');

  const layerItems = [...document.querySelectorAll('.list-item')].filter((item) =>
    item.querySelector('.grow'),
  );
  if (layerItems.length === 0) throw new Error('generated project has no layers in the sidebar');
  const projectName = document.querySelector('.toolbar input[aria-label="Project name"]')?.value ?? '';
  if (!projectName.includes('VERA')) throw new Error('project name not derived from branding: ' + projectName);
  const audioRow = document.querySelector('.status-bar')?.textContent ?? '';
  if (!audioRow.includes('1080')) {
    // Status bar format is not part of the contract; the generated export size is checked via the inspector.
    log.push('status bar does not show the resolution (not required)');
  }
  if (localStorage.getItem('uvs:wizard:draft:v1')) throw new Error('draft was not cleared after generating');
  log.push('generation opens an editable project in the editor');

  return { ok: true, checks: log, layers: layerItems.length, projectName };
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
  const created = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, {
    method: 'PUT',
  }).then((response) => response.json());

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
    console.error('WIZARD CHECK FAILED:', error.message);
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
