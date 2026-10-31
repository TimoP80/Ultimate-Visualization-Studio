# Changelog

All notable changes to Ultimate Visualization Studio are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-31

### Added

#### Audio

- One-shot offline analysis producing a frame-indexed feature track: FFT
  spectrum, 16 log bands, RMS/peak, spectral centroid and flux, BPM estimation
  with beat/downbeat positions, plus kick/snare/onset/silence detection
  (`src/audio/analysis.ts`).
- `AudioEngine` playback with the renderer sampling the analysis track at the
  playhead — seeking is instant and deterministic. Supported containers depend
  on the installed Chromium codecs: WAV, MP3, FLAC, OGG, AAC, M4A, AIFF.

#### Editor & renderer

- WebGL2 renderer with a single `renderFrame` pipeline shared by the preview
  and the MP4 exporter: background → layer shader → layer effect stack → blend
  composite → scene effect chain → present. Pong-pong scene targets keep
  multi-layer compositing safe; shader compile errors surface in the stage
  overlay instead of crashing the loop (`src/render/Renderer.ts`).
- 28 templates with distinct GLSL, parameters, palettes and real audio
  reactivity, grouped by category: Classic (10), Electronic/Cyberpunk (6),
  Hardcore/Rave/Industrial (6), Miscellaneous (6).
- 29 GPU effects across Lighting / Distortion / Image / Motion with per-effect
  enable, intensity, parameters, reordering and removal.
- 12 GPU-shaded text effects (Plain, Neon Flicker, Chrome, Outline, Glitch
  Split, CRT Scanlines, Typewriter Reveal, Wave Motion, Beat Pulse, Hard
  Shadow, Gradient Sweep, Pixel Mosaic) with reveal measured from clip start so
  preview and export match.
- Dark charcoal workspace with resizable sidebars and timeline, template
  browser with search and category filters, layer list, transform/palette/
  parameter editing, audio modulation routes, transport with looping and
  volume, zoomable multitrack timeline with beat grid and real waveform
  (`Match track` fits the timeline to the loaded audio), undo/redo, keyboard
  shortcuts, preview quality/resolution controls and a pre-drawn startup
  splash.
- Timeline editing: template clips drag/trim from either edge; `Add effect…`
  drops a GPU effect onto the selected layer at the playhead as a resizable,
  disableable clip in the layer's Effects lane.
- Preview selection: click/select/resize/rotate/drag on the canvas with
  snapping, alignment guides, per-gesture undo entries and click-through for
  locked layers; double-click (or `Enter`/`F2`) in-place text editing.

#### Visualization Wizard

- Guided ten-step wizard (Audio → Style → Templates → Colours → Reactivity →
  Branding → Effects → Structure → Output → Review) with a live WebGL preview
  per step, generating a fully editable native project (`src/wizard/`).
- 14 style presets bundling templates, palette, typography, effects and
  audio response; 12 palette presets; reactivity profiles from Subtle to
  Extreme; output presets up to YouTube 4K.
- Scene structure modes (single continuous scene, bar cuts, intro–main–outro
  arc) with transitions (cut, crossfade, black/white fade, wipe, dissolve).
- Per-step locks respected by randomisation, a seeded creative randomiser, a
  resumable `localStorage` draft, and strict field-by-field config normalisation.

#### Project & export

- Versioned JSON project files with scenes, layers, effects, modulation routes,
  keyframes, palettes and export settings; every field validated and
  normalised on load. Save via the File System Access API with download
  fallback, debounced autosaves with session recovery on restart. Audio is
  referenced, never embedded.
- MP4 export: UI for resolution/aspect presets, frame rate, bitrate and in/out
  range; offline WebCodecs render with H.264 + AAC muxed via `mp4-muxer`,
  cancellable jobs that do not disturb the preview.

#### Desktop (Electron)

- Windows desktop shell (`electron/main.cjs`) serving the Vite build from
  `dist` over a privileged `app://bundle` scheme so ES modules, WebGL and CSP
  behave as in the browser. Sandboxed renderer with no Node access,
  single-instance window, View menu (reload, zoom, DevTools, fullscreen) and an
  About dialog.
- Packaging with electron-builder: NSIS installer and portable x64 build
  (`npm run electron:pack` / `npm run electron:dist`).

#### Verification

- 17 geometry regression tests (`npm test`).
- `npm run verify:interaction` — headless Chrome drives the real pointer flow
  (add/select/resize/undo/deselect, inline editor, locked-layer click-through).
- `node scripts/verify-wizard.mjs` — headless Chrome walks the full wizard,
  including draft resume and generation into the editor.
- Dev-only `/self-test.html` (28 templates + 29 effects + 12 text effects,
  69/69 checks) and `/audio-test.html` (decode → analysis → beat-reactive
  render), plus MP4 and project I/O verification through the running app.

### Known limitations

- 32 remaining templates (Abstract, 3D, Cinematic categories) are not
  implemented yet; timeline keyframe creation UI, scene management UI and
  Shader Studio are open work items.
- Additional export containers (WebM/MOV/GIF/PNG) and the planned Tauri 2
  desktop backend are not started.

[0.1.0]: https://github.com/TimoP80/Ultimate-Visualization-Studio/releases/tag/v0.1.0
