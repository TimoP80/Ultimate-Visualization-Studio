/**
 * Colour helpers for the wizard.
 *
 * Palettes are stored as plain hex strings in the project document, so global
 * grade controls (saturation, brightness, contrast) are baked into adjusted hex
 * values when the project is generated. That keeps the generated file simple
 * and means the grade survives save/load without extra renderer state.
 */

import type { Palette } from '@/types';

export interface HexRgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): HexRgb {
  const value = hex.replace('#', '').trim();
  const normalised =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value.padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(normalised.slice(0, 2), 16) || 0,
    g: parseInt(normalised.slice(2, 4), 16) || 0,
    b: parseInt(normalised.slice(4, 6), 16) || 0,
  };
}

export function rgbToHex(rgb: HexRgb): string {
  const part = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const amount = Math.max(0, Math.min(1, t));
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * amount,
    g: ca.g + (cb.g - ca.g) * amount,
    b: ca.b + (cb.b - ca.b) * amount,
  });
}

/** Relative luminance, 0..1. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function isDark(hex: string): boolean {
  return luminance(hex) < 0.45;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl({ r, g, b }: HexRgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb({ h, s, l }: Hsl): HexRgb {
  if (s <= 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const hue = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue(p, q, h + 1 / 3) * 255,
    g: hue(p, q, h) * 255,
    b: hue(p, q, h - 1 / 3) * 255,
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  return rgbToHex(
    hslToRgb({
      h: ((h % 360) + 360) % 360 / 360,
      s: Math.max(0, Math.min(1, s)),
      l: Math.max(0, Math.min(1, l)),
    }),
  );
}

export interface Grade {
  /** 1 = unchanged. */
  saturation: number;
  /** 1 = unchanged. */
  brightness: number;
  /** 1 = unchanged; > 1 pushes values away from mid grey. */
  contrast: number;
}

export function gradeColor(hex: string, grade: Grade): string {
  const hsl = rgbToHsl(hexToRgb(hex));
  const saturation = Math.max(0, Math.min(2.5, grade.saturation));
  const brightness = Math.max(0.2, Math.min(2, grade.brightness));
  const contrast = Math.max(0.4, Math.min(2.2, grade.contrast));

  const s = Math.max(0, Math.min(1, hsl.s * saturation));
  const l = Math.max(0, Math.min(1, (hsl.l - 0.5) * contrast + 0.5)) * brightness;
  return rgbToHex(hslToRgb({ h: hsl.h, s, l: Math.max(0, Math.min(1, l)) }));
}

export function gradePalette(
  palette: Palette,
  grade: Grade,
  backgroundMode: 'keep' | 'darken' = 'keep',
): Palette {
  const background =
    backgroundMode === 'darken'
      ? mixHex(palette.background, '#000000', 0.35)
      : gradeColor(palette.background, { ...grade, saturation: grade.saturation * 0.6 });
  return {
    a: gradeColor(palette.a, grade),
    b: gradeColor(palette.b, grade),
    c: gradeColor(palette.c, grade),
    d: gradeColor(palette.d, grade),
    background,
  };
}
