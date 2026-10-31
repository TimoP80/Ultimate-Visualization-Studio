import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

import './styles/global.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/timeline.css';
import './styles/studio.css';
import './styles/wizard.css';

// Registers the built-in template library before the first render.
import './templates';

import App from './App';

/** Minimum time the splash stays readable before the fade starts. */
const SPLASH_MIN_MS = 900;
const SPLASH_FADE_MS = 340;

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Fade the startup splash out once the app has painted its first frame and the
 * UI font is ready, so the workspace never flashes in half-rendered.
 */
function dismissSplash(): void {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('splash--exit');
  splash.setAttribute('aria-hidden', 'true');
  const remove = (): void => splash.remove();
  splash.addEventListener('transitionend', remove, { once: true });
  // Safety net for reduced-motion or a dropped transition event.
  window.setTimeout(remove, SPLASH_FADE_MS + 250);
}

async function revealWorkspace(): Promise<void> {
  // `performance.now()` counts from navigation, so the splash is not held on
  // screen any longer than necessary when the bundle loads late.
  const remaining = SPLASH_MIN_MS - performance.now();
  const fonts = document.fonts?.ready ?? Promise.resolve();
  await Promise.race([fonts, new Promise<void>((resolve) => window.setTimeout(resolve, 2000))]);
  if (remaining > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  dismissSplash();
}

void revealWorkspace();
