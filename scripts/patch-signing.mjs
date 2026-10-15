// Menetapkan kunci tanda tangan debug secara EKSPLISIT di android/app/build.gradle,
// memakai signing/debug.keystore dari repo. Tanpa ini Gradle memakai debug.keystore
// bawaan runner (acak tiap build) sehingga APK baru tidak bisa menimpa APK lama.
// Pakai:  node scripts/patch-signing.mjs [path-keystore] [alias]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ks = path.resolve(process.argv[2] || path.join(root, 'signing', 'debug.keystore'));
const alias = process.argv[3] || 'androiddebugkey';
const gradle = path.join(root, 'android', 'app', 'build.gradle');

if (!fs.existsSync(ks)) throw new Error('Keystore tidak ditemukan: ' + ks);
if (!fs.existsSync(gradle)) throw new Error('android/app/build.gradle belum ada. Jalankan dulu: npx cap add android');

let g = fs.readFileSync(gradle, 'utf8');
if (g.includes('rekap-signing')) { console.log('• build.gradle sudah ditambal, lewati'); process.exit(0); }
const re = /^android\s*\{/m;
if (!re.test(g)) throw new Error('Blok "android {" tidak ditemukan di build.gradle');

const block = `
    // rekap-signing: kunci tetap dari repo (bukan debug.keystore acak milik runner)
    signingConfigs {
        debug {
            storeFile file('${ks.replace(/\\/g, '/')}')
            storePassword 'android'
            keyAlias '${alias}'
            keyPassword 'android'
        }
    }
`;
g = g.replace(re, m => m + block);
fs.writeFileSync(gradle, g);
console.log('✔ build.gradle ditambal: kunci tetap ' + ks + ' (alias ' + alias + ')');
