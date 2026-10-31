/**
 * Desktop dev loop: start Vite, wait for the dev server, then launch Electron
 * against it. Closing either side shuts the other down.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = require.resolve('vite/bin/vite.js');
const electronBin = require('electron');
const devUrl = 'http://localhost:5183';

const vite = spawn(process.execPath, [viteBin], { cwd: root, stdio: 'inherit' });

let electron = null;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  electron?.kill();
  vite.kill();
  process.exit(code);
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error(`Vite exited with code ${vite.exitCode}`);
    try {
      const response = await fetch(devUrl, { method: 'HEAD' });
      if (response.ok) return;
    } catch {
      /* server not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not answer on ${devUrl} within ${timeoutMs}ms`);
}

vite.on('exit', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  await waitForServer();
} catch (error) {
  console.error(`[electron-dev] ${error.message}`);
  shutdown(1);
}

electron = spawn(electronBin, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_START_URL: devUrl },
});
electron.on('exit', (code) => shutdown(code ?? 0));
