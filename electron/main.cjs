/**
 * Desktop shell.
 *
 * The renderer is the normal Vite build, served from `dist` over a privileged
 * `app://` scheme instead of `file://` so ES modules, WebGL and the CSP in
 * `index.html` behave exactly as they do in the browser. In development the
 * window points at the Vite dev server instead (`ELECTRON_START_URL`).
 *
 * The renderer stays sandboxed with no Node access: everything it needs is
 * already provided by the web platform, which keeps the desktop build honest
 * about matching the browser build.
 */

const { app, BrowserWindow, Menu, dialog, net, protocol, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const APP_SCHEME = 'app';
const APP_HOST = 'bundle';
const APP_ENTRY = `${APP_SCHEME}://${APP_HOST}/index.html`;
const DIST_DIR = path.join(__dirname, '..', 'dist');
const DEV_URL = process.env.ELECTRON_START_URL || '';

let mainWindow = null;

// Must run before the app is ready: grants the scheme the same capabilities a
// real origin has (module scripts, fetch, secure context for WebCodecs).
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

/** Map `app://bundle/<path>` onto `dist/<path>`, refusing anything outside it. */
function registerBundleProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    let relative;
    try {
      relative = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    const target = path.join(DIST_DIR, relative.replace(/^\/+/, '') || 'index.html');
    const inside = path.relative(DIST_DIR, target);
    if (inside.startsWith('..') || path.isAbsolute(inside)) {
      return new Response('Not found', { status: 404 });
    }

    try {
      if (!fs.statSync(target).isFile()) return new Response('Not found', { status: 404 });
    } catch {
      return new Response('Not found', { status: 404 });
    }

    return net.fetch(pathToFileURL(target).toString());
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    backgroundColor: '#08090b',
    title: 'Ultimate Visualization Studio',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // The workspace is a single document: no in-app navigation, no popups.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith(`${APP_SCHEME}://${APP_HOST}/`);
    if (!allowed) {
      event.preventDefault();
      if (/^https?:/i.test(url)) void shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (DEV_URL) void mainWindow.loadURL(DEV_URL);
  else void mainWindow.loadURL(APP_ENTRY);
}

function buildMenu() {
  const template = [
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Ultimate Visualization Studio',
          click: () => showAbout(),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showAbout() {
  const parent = mainWindow ?? undefined;
  void dialog.showMessageBox(parent, {
    type: 'info',
    title: 'Ultimate Visualization Studio',
    message: 'Ultimate Visualization Studio',
    detail: [
      `Version ${app.getVersion()}`,
      '',
      'Audio-reactive visualization and music-video workspace.',
      '',
      `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
    ].join('\n'),
    buttons: ['Close'],
    noLink: true,
  });
}

// A second launch focuses the running window instead of opening another studio.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.ultimateviz.studio');
    registerBundleProtocol();
    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
