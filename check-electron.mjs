import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const pages = await browser.pages();
const page = pages[0];
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));
await page.waitForFunction(() => document.querySelector('.toolbar'), { timeout: 15000 });
await new Promise((r) => setTimeout(r, 2500));

const result = await page.evaluate(() => {
  const canvas = document.querySelector('#root canvas');
  const gl = canvas?.getContext('webgl2');
  return {
    href: location.href,
    title: document.title,
    splash: Boolean(document.getElementById('splash')),
    toolbar: Boolean(document.querySelector('.toolbar')),
    canvas: canvas ? `${canvas.width}x${canvas.height}` : null,
    webgl2: Boolean(gl),
    renderer: gl ? gl.getParameter(gl.VERSION) : null,
    fonts: document.fonts.check('600 13px Inter'),
    stylesheets: document.styleSheets.length,
    projectName: document.querySelector('.toolbar input')?.value ?? null,
    timeline: Boolean(document.querySelector('.timeline')),
  };
});
console.log(JSON.stringify(result, null, 2));
console.log('errors:', errors.length ? errors : 'none');
browser.disconnect();
