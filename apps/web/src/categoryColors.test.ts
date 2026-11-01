import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CategoryColor } from '@notes/shared';
import { describe, expect, it } from 'vite-plus/test';

const css = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8');
const darkStart = css.indexOf('prefers-color-scheme: dark');
const themes = { light: css.slice(0, darkStart), dark: css.slice(darkStart) };

function token(theme: string, name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(theme);
  if (!m?.[1]) throw new Error(`missing token --${name}`);
  return m[1];
}
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe.each(Object.entries(themes))('category colors, %s theme', (_name, theme) => {
  it.each(CategoryColor.options)('%s: ink on tint ≥ 4.5:1, ink edge on surface ≥ 3:1', (key) => {
    const tint = token(theme, `cat-${key}-tint`);
    const ink = token(theme, `cat-${key}-ink`);
    expect(contrast(ink, tint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, token(theme, 'surface'))).toBeGreaterThanOrEqual(3);
  });
});
