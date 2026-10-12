# Rekap Nilai Syahbuan

Aplikasi rekap nilai sekolah (satu berkas HTML) yang dibungkus menjadi aplikasi Android (APK) dengan [Capacitor](https://capacitorjs.com/). APK dibuat otomatis oleh GitHub Actions.

## Struktur folder

```
.
├── src/
│   └── index.html            # Aplikasi utama (edit di sini)
├── scripts/
│   ├── prepare.mjs           # Unduh library/font CDN agar jalan offline, sisipkan shim
│   ├── android-shim.js       # Perbaikan tombol unduh/ekspor di WebView Android
│   └── after-add-android.mjs # Pasang ikon, kunci tanda tangan, layar penuh & zoom
├── resources/android/
│   └── icon.png              # Ikon aplikasi (192×192)
├── signing/
│   └── debug.keystore        # Kunci tanda tangan debug (agar APK bisa di-update)
├── .github/workflows/
│   └── build-apk.yml         # Build APK otomatis
├── capacitor.config.json
└── package.json
```

Folder `www/` dan `android/` dibuat saat build dan tidak disimpan di repo (lihat `.gitignore`).

## Unduh APK (rilis)

Versi stabil ada di tab **Releases** di sisi kanan halaman repo. Unduh berkas `Rekap-Nilai-vX.Y.Z.apk` dan pasang di HP Android.

Menerbitkan rilis baru: naikkan `version` di `package.json` (mis. `1.2.0`), perbarui `RELEASE_NOTES.md`, lalu commit ke `main`. Workflow membangun APK dan membuat rilis `v1.2.0` otomatis. Jika versinya belum berubah, rilis tidak dibuat ulang.

## Cara mendapatkan APK dari Actions

1. Buka tab **Actions** → workflow **Build APK**.
2. Klik **Run workflow** (atau cukup *push* ke branch `main`).
3. Setelah selesai (± beberapa menit), buka run tersebut dan unduh artifact **rekap-nilai-apk**.
4. Ekstrak zip-nya, lalu pasang `app-debug.apk` di HP.

## Mengubah aplikasi

Edit `src/index.html`, commit ke `main`, lalu tunggu workflow membuat APK baru.

## Build lokal (opsional)

Butuh Node 20, Java 17, dan Android SDK.

```bash
npm install
npm run android:setup   # sekali saja
npm run android:build   # hasil: android/app/build/outputs/apk/debug/app-debug.apk
```
