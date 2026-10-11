// Menyiapkan folder www/ dari src/index.html:
//  1) mengunduh library CDN (lz-string, xlsx, jszip, jspdf, ...) agar aplikasi jalan OFFLINE
//  2) mengunduh font Poppins agar tampilan sama tanpa internet
//  3) menyisipkan android-shim.js (perbaikan tombol unduh/ekspor di WebView Android)
//
// Pakai:  node scripts/prepare.mjs            (build biasa, butuh internet)
//         node scripts/prepare.mjs --skip-download   (hanya uji penambalan, tanpa unduh)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'src', 'index.html');
const WWW = path.join(root, 'www');
const skipDownload = process.argv.includes('--skip-download');
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

async function fetchRetry(url, opts = {}, tries = 3) {
  let err;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    } catch (e) {
      err = e;
      await new Promise(r => setTimeout(r, 1500 * i));
    }
  }
  throw new Error('Gagal mengunduh ' + url + ' → ' + err.message);
}

async function download(url, dest) {
  const res = await fetchRetry(url);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error('Berkas terlalu kecil: ' + url);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

let html = fs.readFileSync(SRC, 'utf8');
fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

// 1) Library JavaScript dari CDN → lokal
const libRe = /https:\/\/(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)\/[^"'\s)]+?\.js/g;
const libUrls = [...new Set(html.match(libRe) || [])];
for (const url of libUrls) {
  const local = 'libs/' + url.split('/').pop();
  if (!skipDownload) {
    const n = await download(url, path.join(WWW, local));
    console.log('✔ ' + local + ' (' + Math.round(n / 1024) + ' KB)');
  } else {
    console.log('• (lewati unduh) ' + local);
  }
  html = html.split(url).join(local);
}

// 2) Font Google (Poppins) → lokal. Gagal = tidak fatal (jatuh ke font bawaan saat offline).
const fontLink = html.match(/<link[^>]+href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"[^>]*>/);
if (fontLink && !skipDownload) {
  try {
    const css = await (await fetchRetry(fontLink[1], { headers: { 'User-Agent': UA } })).text();
    const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]))];
    let out = css, i = 0;
    for (const u of urls) {
      const name = 'font-' + (++i) + '.woff2';
      await download(u, path.join(WWW, 'fonts', name));
      out = out.split(u).join(name);
    }
    fs.writeFileSync(path.join(WWW, 'fonts', 'fonts.css'), out);
    html = html.replace(fontLink[0], '<link href="fonts/fonts.css" rel="stylesheet">');
    html = html.replace(/<link rel="preconnect"[^>]*fonts\.g[^>]*>\s*/g, '');
    console.log('✔ font Poppins (' + urls.length + ' berkas)');
  } catch (e) {
    console.warn('⚠ Font tidak bisa diunduh, memakai link Google Fonts apa adanya:', e.message);
  }
}

// 3) Perbaikan khusus Android
fs.copyFileSync(path.join(root, 'scripts', 'android-shim.js'), path.join(WWW, 'android-shim.js'));
if (!html.includes('</head>')) throw new Error('Tag </head> tidak ditemukan di index.html');
html = html.replace('</head>', '<script src="android-shim.js"></script>\n</head>');

fs.writeFileSync(path.join(WWW, 'index.html'), html);
const sisa = html.match(libRe) || [];
console.log('Selesai → www/index.html (' + Math.round(html.length / 1024) + ' KB).' +
  (sisa.length ? ' Masih ada URL CDN: ' + sisa.join(', ') : ''));
