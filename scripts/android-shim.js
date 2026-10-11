// Di WebView Android, tombol "unduh" berbasis <a download href="blob:..."> TIDAK menyimpan apa pun.
// Shim ini (aktif hanya di dalam APK) mencegat unduhan itu, menyimpan berkas ke cache aplikasi,
// lalu membuka menu "Bagikan" Android (Simpan ke Drive/File, WhatsApp, Email, dll).
(function () {
  var C = window.Capacitor;
  var native = C && ((typeof C.isNativePlatform === 'function' && C.isNativePlatform()) ||
                     (typeof C.getPlatform === 'function' && C.getPlatform() !== 'web'));
  if (!native) return; // di browser biasa: tidak melakukan apa-apa

  function isDl(a) { return a && a.hasAttribute && a.hasAttribute('download') && /^(blob:|data:)/.test(a.href || ''); }
  function toBase64(blob) {
    return new Promise(function (ok, fail) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result); ok(s.slice(s.indexOf(',') + 1)); };
      r.onerror = function () { fail(r.error); };
      r.readAsDataURL(blob);
    });
  }
  async function saveAndShare(href, name) {
    // fetch() dipanggil sinkron, jadi blob-URL belum sempat di-revoke oleh aplikasi
    var res = await fetch(href);
    var blob = await res.blob();
    var data = await toBase64(blob);
    var fname = (name || 'berkas').replace(/[\\\/:*?"<>|]+/g, '-');
    var P = C.Plugins || {};
    if (!P.Filesystem || !P.Share) throw new Error('Plugin Filesystem/Share tidak tersedia');
    var w = await P.Filesystem.writeFile({ path: fname, data: data, directory: 'CACHE', recursive: true });
    await P.Share.share({ title: fname, dialogTitle: 'Simpan / bagikan berkas', files: [w.uri] });
  }
  function handle(a) {
    saveAndShare(a.href, a.getAttribute('download')).catch(function (e) {
      var m = String((e && e.message) || e || '');
      if (/cancel/i.test(m)) return; // pengguna menutup menu Bagikan
      alert('Gagal menyimpan berkas: ' + m);
    });
  }

  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (isDl(this)) { handle(this); return; }
    return origClick.apply(this, arguments);
  };
  var origDispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (ev) {
    if (ev && ev.type === 'click' && this instanceof HTMLAnchorElement && isDl(this)) { handle(this); return true; }
    return origDispatch.apply(this, arguments);
  };
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('a[download]');
    if (isDl(a)) { ev.preventDefault(); handle(a); }
  }, true);
})();
