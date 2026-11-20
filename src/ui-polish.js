/* ==========================================================================
   REKAP NILAI — perilaku tambahan UI (aksesibilitas & input nilai).
   Disisipkan saat build oleh scripts/polish.mjs (sebelum </body>).
   Defensif: tidak mengubah logika aplikasi, hanya menambah atribut ARIA dan
   penanganan fokus. Bila satu bagian gagal, bagian lain tetap jalan.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__rnPolishJs) return;
  window.__rnPolishJs = true;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var safe = function (fn) { try { fn(); } catch (e) { /* abaikan */ } };

  /* 1) Label untuk tombol ikon yang tidak punya teks ---------------------- */
  var LABELS = [
    ['#themeToggle', 'Ganti tema terang atau gelap'],
    ['#tampilanBtn', 'Pengaturan tampilan'],
    ['#fabToggle', 'Menu cadangan data'],
    ['.sheet-close', 'Tutup'],
    ['.chk-clear', 'Hapus centang']
  ];

  function needsLabel(el) {
    if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') || el.getAttribute('title')) return false;
    var t = (el.textContent || '').replace(/\s+/g, '');
    return t.length === 0 || (t.length === 1 && !/[A-Za-z0-9]/.test(t));
  }

  function labelButtons(root) {
    LABELS.forEach(function (p) {
      $$(p[0], root).forEach(function (el) {
        if (needsLabel(el)) el.setAttribute('aria-label', p[1]);
      });
    });
  }

  /* 2) Toast, undo, dan dialog dibacakan pembaca layar -------------------- */
  function semantics() {
    ['.toast', '.undo-bar'].forEach(function (sel) {
      var el = $(sel);
      if (!el) return;
      if (!el.hasAttribute('role')) el.setAttribute('role', 'status');
      if (!el.hasAttribute('aria-live')) el.setAttribute('aria-live', 'polite');
    });
    $$('.modal-box').forEach(function (box) {
      if (box.hasAttribute('role')) return;
      box.setAttribute('role', 'alertdialog');
      box.setAttribute('aria-modal', 'true');
      var msg = $('.modal-msg', box);
      if (msg) {
        if (!msg.id) msg.id = 'rnModalMsg';
        box.setAttribute('aria-describedby', msg.id);
      }
    });
  }

  /* 3) Menu aktif ditandai aria-current ----------------------------------- */
  function syncNav() {
    $$('.mobile-bottom-nav button, .sidebar-nav button').forEach(function (b) {
      if (b.classList.contains('active')) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  }

  function watchNav() {
    if (!window.MutationObserver) return;
    ['.mobile-bottom-nav', 'nav.tabs'].forEach(function (sel) {
      var root = $(sel);
      if (!root) return;
      new MutationObserver(function () { safe(syncNav); })
        .observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    });
  }

  /* 4) Kolom nilai: keyboard angka, pilih-semua saat fokus, nama terbaca --- */
  function isScore(el) {
    return !!(el && el.matches && el.matches('.score-input'));
  }

  function prepScore(el) {
    if (!el.hasAttribute('inputmode')) el.setAttribute('inputmode', 'decimal');
    if (!el.hasAttribute('enterkeyhint')) el.setAttribute('enterkeyhint', 'next');
    if (!el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
  }

  function nameScore(el) {
    if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') || el.getAttribute('title')) return;
    var td = el.closest('td');
    var tbl = el.closest('table');
    if (!td || !tbl || !td.parentElement) return;
    var parts = [];
    var nm = td.parentElement.querySelector('td.nama');
    if (nm && nm.textContent.trim()) parts.push(nm.textContent.trim());
    var hr = tbl.tHead && tbl.tHead.rows[tbl.tHead.rows.length - 1];
    var th = hr && hr.cells[td.cellIndex];
    if (th && th.textContent.trim()) parts.push(th.textContent.trim());
    if (parts.length) el.setAttribute('aria-label', parts.join(' – '));
  }

  document.addEventListener('pointerdown', function (e) {
    if (isScore(e.target)) safe(function () { prepScore(e.target); });
  }, true);

  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (isScore(el)) {
      safe(function () { prepScore(el); nameScore(el); });
      // setTimeout: supaya ketukan tidak menimpa pilihan teks di layar sentuh
      setTimeout(function () {
        if (document.activeElement === el) safe(function () { el.select(); });
      }, 0);
    } else if (el && el.matches && el.tagName === 'BUTTON') {
      safe(function () {
        LABELS.forEach(function (p) {
          if (el.matches(p[0]) && needsLabel(el)) el.setAttribute('aria-label', p[1]);
        });
      });
    }
  });

  /* 5) Enter = pindah ke siswa berikutnya (Shift+Enter = sebelumnya) -------- */
  function locate(el) {
    var td = el.closest('td'), tr = td && td.parentElement, tbl = el.closest('table');
    if (!tr || !tbl) return null;
    return {
      t: Array.prototype.indexOf.call(document.querySelectorAll('table'), tbl),
      r: tr.rowIndex,
      c: td.cellIndex
    };
  }

  function findScore(p) {
    var tbl = document.querySelectorAll('table')[p.t];
    var tr = tbl && tbl.rows[p.r];
    var td = tr && tr.cells[p.c];
    return td ? td.querySelector('.score-input') : null;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    var el = e.target;
    if (!isScore(el)) return;
    var p = locate(el);
    if (!p) return;
    var step = e.shiftKey ? -1 : 1;
    var next = null;
    for (var r = p.r + step; r >= 0; r += step) {
      var cand = findScore({ t: p.t, r: r, c: p.c });
      if (cand && !cand.disabled) { next = cand; p = { t: p.t, r: r, c: p.c }; break; }
      var tbl = document.querySelectorAll('table')[p.t];
      if (!tbl || r >= tbl.rows.length) break;
    }
    e.preventDefault();
    if (!next) { el.blur(); return; }
    next.focus();
    try { next.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
    // Bila aplikasi menggambar ulang tabel saat nilai disimpan, fokus dipulihkan.
    setTimeout(function () {
      var a = document.activeElement;
      if (isScore(a)) return;
      var again = findScore(p);
      if (again) again.focus();
    }, 90);
  });

  /* Mulai ------------------------------------------------------------------ */
  function init() {
    safe(function () { labelButtons(document); });
    safe(semantics);
    safe(syncNav);
  }
  init();
  safe(watchNav);
  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', init);
})();
