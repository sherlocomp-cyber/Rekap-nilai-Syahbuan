// Menyisipkan src/ui-polish.css ke dalam HTML (tepat sebelum </head>, setelah <style> utama
// sehingga menang di cascade). Dipakai oleh prepare.mjs (APK) dan build-pages.mjs (Pages).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function injectPolish(html) {
  const cssPath = path.join(root, 'src', 'ui-polish.css');
  if (!fs.existsSync(cssPath)) { console.warn('⚠ src/ui-polish.css tidak ada, lewati.'); return html; }
  if (html.includes('id="ui-polish"')) return html;
  if (!html.includes('</head>')) throw new Error('Tag </head> tidak ditemukan di index.html');
  const css = fs.readFileSync(cssPath, 'utf8');
  return html.replace('</head>', () => '<style id="ui-polish">\n' + css + '\n</style>\n</head>');
}
