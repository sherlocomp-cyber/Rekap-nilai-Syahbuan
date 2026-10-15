// Menyiapkan folder site/ untuk GitHub Pages: salinan src/ + poles tampilan.
// Pakai:  node scripts/build-pages.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectPolish } from './polish.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'src');
const OUT = path.join(root, 'site');

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });
const file = path.join(OUT, 'index.html');
fs.writeFileSync(file, injectPolish(fs.readFileSync(file, 'utf8')));
fs.rmSync(path.join(OUT, 'ui-polish.css'), { force: true });
console.log('Selesai → site/index.html (' + Math.round(fs.statSync(file).size / 1024) + ' KB)');
