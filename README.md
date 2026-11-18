# Rekap Nilai Syahbuan

Aplikasi rekap nilai sekolah (satu berkas HTML) yang dibungkus menjadi aplikasi Android (APK) dengan [Capacitor](https://capacitorjs.com/) dan juga diterbitkan sebagai situs GitHub Pages. Keduanya dibuat otomatis oleh GitHub Actions.

## Struktur folder

```
.
├── src/
│   └── index.html            # Aplikasi utama (edit di sini)
├── scripts/
│   ├── prepare.mjs           # Unduh library/font CDN agar jalan offline, sisipkan shim
│   ├── android-shim.js       # Perbaikan tombol unduh/ekspor di WebView Android
│   ├── after-add-android.mjs # Pasang ikon, layar penuh & zoom
│   ├── patch-signing.mjs     # Kunci tanda tangan APK ke signing/debug.keystore
│   └── build-pages.mjs       # Bangun situs GitHub Pages (folder site/)
├── resources/android/
│   └── icon.png              # Ikon aplikasi (192×192)
├── signing/
│   └── debug.keystore        # Kunci tanda tangan debug (agar APK bisa di-update)
├── .github/workflows/
│   └── build-apk.yml         # Build APK + rilis + deploy Pages
├── RELEASE_NOTES.md          # Catatan tambahan yang ikut dimasukkan ke setiap rilis
├── capacitor.config.json
└── package.json
```

Folder `www/`, `android/`, dan `site/` dibuat saat build dan tidak disimpan di repo (lihat `.gitignore`).

## Cara kerja otomatis

Setiap *push* ke `main`/`master` (selain perubahan berkas `.md` dan `LICENSE`), atau klik **Run workflow** secara manual, menjalankan dua job:

1. **Build APK & Rilis**
   - Nomor versi: `v<major>.<minor>.<nomor run>`. `<major>.<minor>` diambil dari `version` di `package.json`, sedangkan nomor run GitHub Actions dipakai sebagai patch **dan** `versionCode` Android (selalu naik).
   - APK ditandatangani dengan `signing/debug.keystore`, lalu tanda tangannya diverifikasi (SHA-256 harus sama dengan kunci di repo).
   - Rilis baru dibuat di tab **Releases** (`Rekap-Nilai-vX.Y.Z.apk` dan `Rekap-Nilai.apk`). Hanya **10 rilis terbaru** yang disimpan; yang lebih lama dihapus beserta tag-nya.
2. **Deploy ke GitHub Pages** — situs dibangun dengan `scripts/build-pages.mjs` dan diterbitkan.

Untuk menaikkan versi minor/mayor (mis. `1.1` → `1.2`), ubah `version` di `package.json`.

## Unduh APK

Buka tab **Releases** di sisi kanan halaman repo, unduh `Rekap-Nilai.apk` (atau berkas bernomor versi), lalu pasang di HP Android. Bila sidik jari tanda tangan di catatan rilis sama dengan rilis sebelumnya, APK bisa dipasang menimpa tanpa uninstall.

Alternatif: tab **Actions** → run terbaru → artifact **rekap-nilai-apk** (berisi `app-debug.apk`).

## Mengubah aplikasi

Edit `src/index.html`, commit ke `main`, lalu tunggu workflow membuat APK dan situs baru.

## Build lokal (opsional)

Butuh Node 20, Java 17, dan Android SDK.

```bash
npm install
npm run android:setup   # sekali saja
npm run android:build   # hasil: android/app/build/outputs/apk/debug/app-debug.apk
```

## Catatan keamanan

- APK yang dirilis adalah build **debug** dan ditandatangani dengan kunci debug yang ada di repo (password publik). Ini praktis untuk pemakaian pribadi, tetapi tidak cocok bila repo dibuka untuk umum atau data nilai sangat sensitif. Rencana perbaikan: build *release* dengan keystore di GitHub Secrets.
- Pasang APK hanya dari tab Releases repo ini.
- Data tersimpan di perangkat. Lakukan ekspor/backup berkala sebelum uninstall atau menghapus data aplikasi.
