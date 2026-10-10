// Dijalankan setelah "npx cap add android": pasang ikon + kunci tanda tangan tetap.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
if (!fs.existsSync(res)) { console.error('Folder android/ belum ada. Jalankan dulu: npx cap add android'); process.exit(1); }

fs.rmSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true, force: true });
const icon = path.join(root, 'resources', 'android', 'icon.png');
for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const to = path.join(res, 'mipmap-' + d);
  fs.mkdirSync(to, { recursive: true });
  for (const f of ['ic_launcher.png', 'ic_launcher_round.png']) fs.copyFileSync(icon, path.join(to, f));
}
console.log('✔ ikon dipasang');

const dest = path.join(os.homedir(), '.android', 'debug.keystore');
if (process.argv.includes('--force') || process.env.CI || !fs.existsSync(dest)) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(root, 'signing', 'debug.keystore'), dest);
  console.log('✔ kunci tanda tangan dipasang');
}

// Aktifkan zoom cubit (pinch-zoom) di WebView Android
const javaDir = path.join(root, 'android', 'app', 'src', 'main', 'java', 'id', 'sekolah', 'rekapnilai');
fs.mkdirSync(javaDir, { recursive: true });
fs.writeFileSync(path.join(javaDir, 'MainActivity.java'), `package id.sekolah.rekapnilai;

import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WebSettings st = this.bridge.getWebView().getSettings();
    st.setUseWideViewPort(true);      // agar <meta viewport> (mode desktop & ukuran tampilan) dipakai
    st.setLoadWithOverviewMode(true);
    st.setSupportZoom(true);
    st.setBuiltInZoomControls(true);
    st.setDisplayZoomControls(false);
    // Jembatan JS -> kunci orientasi layar: window.AndroidOrient.set('landscape'|'portrait'|'auto')
    this.bridge.getWebView().addJavascriptInterface(new Object() {
      @JavascriptInterface
      public void set(final String mode) {
        MainActivity.this.runOnUiThread(new Runnable() {
          @Override
          public void run() {
            int o = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
            if ("landscape".equals(mode)) o = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
            else if ("portrait".equals(mode)) o = ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;
            MainActivity.this.setRequestedOrientation(o);
          }
        });
      }
    }, "AndroidOrient");
  }
}
`);
console.log('✔ zoom cubit diaktifkan');
