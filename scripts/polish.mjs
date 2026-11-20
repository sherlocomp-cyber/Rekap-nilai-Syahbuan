// Menyisipkan src/ui-polish.css (tepat sebelum </head>, setelah <style> utama sehingga menang di cascade)
// dan src/ui-polish.js (tepat sebelum </body> penutup). Dipakai oleh prepare.mjs (APK) dan build-pages.mjs (Pages).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function injectCss(html) {
  const cssPath = path.join(root, 'src', 'ui-polish.css');
  if (!fs.existsSync(cssPath)) { console.warn('⚠ src/ui-polish.css tidak ada, lewati.'); return html; }
  if (html.includes('id="ui-polish"')) return html;
  if (!html.includes('</head>')) throw new Error('Tag </head> tidak ditemukan di index.html');
  const css = fs.readFileSync(cssPath, 'utf8');
  return html.replace('</head>', () => '<style id="ui-polish">\n' + css + '\n</style>\n</head>');
}

function injectJs(html) {
  const jsPath = path.join(root, 'src', 'ui-polish.js');
  if (!fs.existsSync(jsPath)) { console.warn('⚠ src/ui-polish.js tidak ada, lewati.'); return html; }
  if (html.includes('id="ui-polish-js"')) return html;
  const js = fs.readFileSync(jsPath, 'utf8');
  if (/<\/script/i.test(js)) throw new Error('src/ui-polish.js tidak boleh memuat "</script"');
  const tag = '<script id="ui-polish-js">\n' + js + '\n</script>\n';
  // </body> TERAKHIR: skrip aplikasi bisa memuat string "</body>" untuk ekspor/cetak.
  const i = html.lastIndexOf('</body>');
  if (i === -1) return html + '\n' + tag;
  return html.slice(0, i) + tag + html.slice(i);
}

export function injectPolish(html) {
  return injectJs(injectCss(html));
}
