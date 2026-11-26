// Menyisipkan src/ui-polish.css (tepat sebelum </head>, setelah <style> utama sehingga menang di cascade)
// dan src/ui-polish.js + src/koreksi.js (tepat sebelum </body> penutup). Dipakai oleh prepare.mjs (APK) dan build-pages.mjs (Pages).
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

function injectJsFile(html, file, tagId) {
  const jsPath = path.join(root, 'src', file);
  if (!fs.existsSync(jsPath)) { console.warn('⚠ src/' + file + ' tidak ada, lewati.'); return html; }
  if (html.includes('id="' + tagId + '"')) return html;
  const js = fs.readFileSync(jsPath, 'utf8');
  if (/<\/script/i.test(js)) throw new Error('src/' + file + ' tidak boleh memuat "</script"');
  const tag = '<script id="' + tagId + '">\n' + js + '\n</script>\n';
  // </body> TERAKHIR: skrip aplikasi bisa memuat string "</body>" untuk ekspor/cetak.
  const i = html.lastIndexOf('</body>');
  if (i === -1) return html + '\n' + tag;
  return html.slice(0, i) + tag + html.slice(i);
}

function injectJs(html) { return injectJsFile(html, 'ui-polish.js', 'ui-polish-js'); }
// Modul Koreksi Soal: disisipkan SETELAH ui-polish.js (urutan: panggil injectJs dulu, lalu ini).
function injectKoreksi(html) { return injectJsFile(html, 'koreksi.js', 'koreksi-js'); }

export function injectPolish(html) {
  return injectKoreksi(injectJs(injectCss(html)));
}
