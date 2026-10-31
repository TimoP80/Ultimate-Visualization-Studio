# Ultimate Visualization Studio

Professional audio-reactive visualization and music-video workspace for Windows 11.
React + TypeScript + Vite, WebGL2 with custom GLSL, Web Audio API and Zustand.

## Run

```bash
npm install
npm run dev      # http://localhost:5183
npm run build    # type-check + production bundle
```

Import an audio file from the toolbar, the Audio tab or by dropping it on the window.
Supported containers depend on the installed Chromium/WebView codecs: WAV, MP3, FLAC,
OGG, AAC, M4A and AIFF.

### Desktop (Electron)

```bash
npm run electron:dev    # Vite dev server inside the Electron window
npm run electron:pack   # build + unpacked Windows build (release/win-unpacked)
npm run electron:dist   # build + NSIS installer & portable exe in release/
```

`electron/main.cjs` serves the normal Vite build from `dist` over a privileged
`app://bundle` scheme (instead of `file://`), so ES modules, WebGL and the CSP
behave exactly as in the browser. The renderer stays sandboxed with no Node
access — the desktop build uses the same web platform APIs as the browser. The
app is single-instance (a second launch focuses the first window), ships a
View menu with zoom/reload/fullscreen and an About dialog with version info.

## Visualization Wizard

The toolbar **Wizard** entry walks through a guided ten-step flow (Audio → Style
→ Templates → Colours → Reactivity → Branding → Effects → Structure → Output →
Review) and generates a fully editable native project in the main editor
(`src/wizard/`). Each step has a live WebGL preview frame.

- **Styles** (14) — Rave, Hardcore, Hardstyle, Techno, DnB, Jungle, Trance,
  Synthwave, Cyberpunk, Abstract, Cinematic, Minimal, Ambient, Experimental.
  A style bundles templates, palette, typography, effect stack, transition type
  and audio response into one coherent direction; non-compatible template stacks
  are filtered out of the Templates step.
- **Colours** (12 palette presets), **reactivity profiles** (Subtle, Balanced,
  Energetic, Aggressive, Extreme …) and per-band gains mapped onto real template
  parameters, with recommended values derived from the analysed track.
- **Branding** — optional artist/title/album/label text with typography and
  layout (centre, lower-third, corner); text becomes normal, editable text
  layers in the generated project.
- **Structure** — one continuous scene, or real scenes cut on detected musical
  boundaries (bar cuts / intro–main–outro arc) with transitions (cut,
  crossfade, black/white fade, wipe, dissolve).
- **Output** — presets (YouTube, YouTube 4K, Shorts, Reels, TikTok, Archive,
  custom) writing size, frame rate, codec and quality straight into the project
  for the existing exporter.
- **Creative controls** — creativity/complexity/effect-intensity plus a seed for
  reproducible randomisation. Any step can be locked and is then left untouched
  by randomisation.

The wizard draft is persisted to `localStorage` and resumes after a reload until
it is generated or cleared. Configurations are serialisable presets, validated
and clamped field-by-field on read back (`normalizeConfig`), so stale or
hand-edited drafts cannot crash the generator.

## Implemented

**Audio** — one-shot offline analysis (`src/audio/analysis.ts`) produces a
frame-indexed feature track: FFT spectrum, 16 log bands, RMS/peak, spectral
centroid and flux, BPM with beat/downbeat positions, kick/snare/onset/silence
detection. Playback uses `AudioEngine`; the renderer samples the analysis track at
the playhead, so seeking is instant and deterministic.

**Renderer** — `src/render/Renderer.ts` runs the same `renderFrame` pipeline for the
preview and the MP4 exporter: background → layer shader → layer effect stack →
blend composite → scene effect chain → present. Scene targets ping-pong so
multi-layer compositing never samples the bound framebuffer. Shader compilation
errors are surfaced in the stage overlay instead of crashing the loop.

**Templates** — 28 templates with distinct GLSL, parameters, palettes and real
audio reactivity, grouped in the browser by category:

- **Classic** (10) — Circular Spectrum, Radial Frequency Bars, Vertical Equalizer,
  Mirrored Spectrum, Horizontal Spectrum, Stereo Spectrum, Frequency Waveform,
  Oscilloscope, Lissajous Curve, Circular Waveform.
- **Electronic / Cyberpunk** (6) — Neon Horizon, Circuit Pulse, Cyber Tunnel, Data
  Stream, HUD Reticle, Pixel Wave.
- **Hardcore / Rave / Industrial** (6) — Strobe Cuts, Industrial Grate, Bass
  Reactor, Feedback Smear, Hazard Bars, Distortion Wall.
- **Miscellaneous** (6) — Plasma Field, Warp Tunnel, Kaleido Bloom, Moire Bands,
  Parallax Starfield, Liquid Metal.

**MP4 export** — the toolbar Export button opens a sheet for resolution (16:9,
vertical and square presets), frame rate, bitrate and in/out range. Export runs
offline through WebCodecs: a dedicated `Renderer` instance draws every frame at the
target resolution and a fixed timestamp grid, H.264 chunks are muxed with
`mp4-muxer`, and the loaded track is encoded to AAC (with bitrate fallback) into a
second audio track. Jobs are cancellable and leave the interactive preview alone.

**Effects** — 29 GPU effects in Lighting / Distortion / Image / Motion categories,
with per-effect enable, intensity, parameters, reordering and removal. Uniform
arrays and dry-wet mixing are wired through `Renderer`.

**Workspace** — dark charcoal shell with resizable sidebars and timeline, template
browser with search and category filters, layer list, transform/palette/parameter
editing, audio modulation routes, effect stack, transport with looping and volume,
zoomable multitrack timeline with beat grid and real waveform, an editable timeline
length plus a **Match track** shortcut that fits the timeline to the loaded audio and
extends layers that filled the old end, undo/redo,
keyboard shortcuts, configurable preview quality and resolution scaling. A startup splash is painted by
`index.html` before the bundle loads and fades once the UI font and the first
frame are ready.

**Timeline editing** — template clips can be dragged along the timeline and trimmed
from either edge to set their duration (`Timing` in the properties panel does the
same numerically), so templates can be swapped in and out over the track. The
toolbar’s **Add effect…** menu drops a GPU effect onto the selected layer at the
playhead; each effect gets a violet clip in the layer’s Effects lane that can be
dragged, resized and disabled, and effects only render inside their window (an
effect without a window covers the whole layer).

**Text effects** — 12 presets for text layers, shaded on the GPU from the rasterised
glyphs (`src/render/textEffects.ts` + `TEXT_FRAG`): Plain, Neon Flicker, Chrome,
Outline, Glitch Split, CRT Scanlines, Typewriter Reveal, Wave Motion, Beat Pulse,
Hard Shadow, Gradient Sweep and Pixel Mosaic. The Elements tab creates a text layer
with a preset already applied; an existing layer picks its preset and tunes
Intensity / Speed / Reveal in Properties. Reveal is measured from the clip start, so
the typewriter animation matches in preview and export, and the preset id rides in
the project JSON.

**Preview selection** — the preview has one interaction surface for every layer
type (`src/components/SelectionOverlay.tsx` + `src/interaction/`). Pointer-down on
the frame hit-tests the scene top-down: text layers use their glyph box, other
layers their transformed frame quad. The topmost unlocked, visible, in-range layer
wins, so overlapping elements are predictable and locked layers are click-through.
A selected layer gets a transform box with eight resize handles and a rotation
handle: corners resize from the opposite corner, edge handles change one axis,
`Shift` preserves the ratio, `Alt` resizes from the centre, and `Shift` on the
rotation handle snaps to 15°. Dragging the box moves it, with centre/third/other
layer snapping and alignment guides. Every gesture records one undo entry, and
`Escape` or a click on the stage margin deselects. The maths mirrors
`COMPOSITE_FRAG`, so handles track the rendered pixels at any zoom or preview
resolution.

Double-click a text layer, or press `Enter`/`F2`, to edit it in place. Single
click only selects, so editing never moves the layer; `Enter` commits, `Escape`
reverts, and clicking away commits. The editor uses the raster font size and
tracking, so the text being typed matches the rendered glyphs. Text layers with
no glyphs still show a small editable box.

**Project files** — File menu and shortcuts for New Project, Open, Save and Save As.
Documents are versioned JSON envelopes containing scenes, layers, effects,
modulation routes, keyframes, palettes and export settings. Every field is validated
and normalised on load, so truncated autosaves and hand-edited files fail with a
message instead of a broken renderer. Save uses the File System Access API to
overwrite the same file where available and falls back to a download. Edits are
autosaved to `localStorage` after they settle; on the next start the workspace offers
to recover the last session. Opened projects keep their audio *reference* — audio
samples are never stored in JSON, so re-import the file to relink playback.

Shortcuts: `Ctrl+N` new, `Ctrl+O` open, `Ctrl+S` save, `Ctrl+Shift+S` save as,
`Ctrl+I` import audio, `Space` play/pause, `Ctrl+Z`/`Ctrl+Shift+Z` undo/redo,
`Ctrl+D` duplicate, `Ctrl+]`/`Ctrl+[` raise/lower the selected layer, arrow keys
seek, `Enter`/`F2` edits the selected text layer, `Escape` deselects, `Delete`
removes the selected layer. Edits are coalesced into one undo step per gesture or
burst of typing.

## Verification

- `npm test` — 17 geometry regression tests (coordinate round-trips, rotated
  hit-testing, fixed-corner/edge/centre resizing, clamping, rotation and snapping).
- `node scripts/verify-wizard.mjs` — headless Chrome walks the whole wizard:
  all ten steps, style selection, supporting layers, palette locking under
  randomisation, branding preview, output presets, draft resume after a reload,
  and generation into an editable editor project.
- `npm run verify:interaction` — starts Vite and headless Chrome, then
  drives the real pointer flow: add a text layer, deselect in the stage margin,
  click-select on the canvas, resize from a corner, undo, open/close the inline
  editor, and verify locked/hidden layers are click-through.
- `npm run build` — TypeScript + Vite production build.
- Dev-only pages: `/self-test.html` renders every template and effect with
  synthetic audio, checks pixel coverage and reports compile errors;
  `/audio-test.html` synthesises a 120 BPM WAV, runs the real decode → analysis
  → sampler path and checks the rendered frame reacts to the beat.
- Last run: 69/69 checks (28 templates + 29 effects + 12 text effects), audio
  pipeline PASS (BPM 120, beat-reactive render diff 9.2%).
- MP4 export verified through the running app: a 24-frame 640×360 clip produced a
  valid `ftyp`/`moov`/`mdat`/`avc1` file; enabling audio added `mp4a` and `soun`
  tracks with no warnings.
- Selection verified through the running app in headless Chrome (11/11 checks):
  adding a text layer selects it, clicking the frame margin deselects, clicking the
glyph box re-selects the correct layer, a corner handle resizes without losing
selection, undo restores the pre-resize geometry, the inline editor opens and
closes, and locked/hidden layers are skipped by canvas hit-testing.
- Project I/O verified through the running app: JSON round-trip, corrupt and
  future-version rejection, debounced autosave, recovery prompt and restore,
  New Project reset, anchor-download bytes, and reopening a file through the
  file chooser.

## Not implemented yet

- 32 remaining templates (Abstract, 3D, Cinematic).
- Timeline keyframe creation UI, scene management and transitions.
- Shader Studio editor, media assets (image/video/logo layers).
- Portable project packaging with collected assets and project duplication.
- Additional export containers (WebM/MOV/GIF/PNG).
- Multi-selection, grouping/ungrouping, alignment/distribution commands and safe
action menus on the canvas.
- Timeline snapping to beats/markers, keyframe creation UI and scene transitions.
- The Tauri 2 desktop backend (the current desktop shell is Electron).
- Full audio-reactivity and template art-direction audit; MP4 1080p/4K frame-by-frame
  output validation (the export pipeline itself is unchanged).
- Genre presets and the composition randomizer.
