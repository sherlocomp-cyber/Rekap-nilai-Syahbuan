/* =========================================================================
   KOREKSI SOAL — modul tambahan (disisipkan otomatis saat build oleh
   scripts/polish.mjs, tepat sebelum </body>, setelah ui-polish.js).
   Alur: pilih Ujian + Mapel + Kelas -> pilih siswa -> tab Bagian A / B / C.
   Bagian A: ketik jawaban pilihan ganda (Q=A, W=B, E=C, R=D) atau tombol besar A/B/C/D.
   Bagian B: kunci isian tampil per soal (satu baris per soal); tiap soal 0, 1, atau 2 poin (BOBOT_B).
             Pintasan keyboard: tombol 0/1/2 mengisi soal kosong pertama.
   Bagian C: kunci + kriteria skor 0-4 tampil per soal; ketuk kriteria yang cocok = skor.
             Pintasan keyboard: tombol 0-4 mengisi soal kosong pertama.
   Nilai A & C = skor / skor maksimal x maks nilai/bagian. Nilai B = jumlah poin (maks = maks nilai/bagian).
   Nilai Akhir (tampil di atas kartu siswa bila A, B, C lengkap) memakai rumus fitur UTS/STS:
   total = A+B+C (tiap bagian dibulatkan seperti saat dikirim), akhir = round(total / (maks x 3) x 100).
   Kotak "Belum dinilai" di atas daftar siswa: jumlah siswa yang belum selesai per bagian A / B / C.

   Tambahan (versi praktis):
   - Bagian B satu baris per soal (muat ~10 soal sekaligus) + tombol "Sisanya Benar".
   - Lanjut otomatis ke siswa berikutnya yang belum selesai di bagian yang sama (bisa dimatikan).
   - Daftar siswa menampilkan penanda A/B/C + filter "hanya yang belum selesai".
   - Header kartu siswa menempel (nama, skor sementara, tab) saat digulir.
   - Tombol Urungkan (maks 30 langkah, A/B/C).
   - Analisis Soal: persentase tuntas per soal + pilihan salah terbanyak (A), soal tersulit.

   Data: DB.koreksi = { kunci:{key:{n,a,b,c}}, jawab:{key:{siswaId:"ABCD-.."}}, waktu:{key:{siswaId:{d,t}}},
                        skorB:{key:{siswaId:"2-10"}}  (poin per soal 0-2, '-' = belum),
                        skorC:{key:{siswaId:"43-0"}}  (skor per soal 0-4, '-' = belum) }
   (nilai berupa string/angka agar aman digabung oleh mergeDeep_ saat sinkron)
   Struktur data TIDAK berubah dari versi sebelumnya.
   Kunci lama di fitur Ujian (DB.kunciJawaban) TIDAK dipakai.
   ========================================================================= */
(function(){
'use strict';
if(typeof DB === 'undefined' || typeof PAGES === 'undefined' || document.getElementById('page-koreksi')) return;

var SEL_KEY = 'appRekapNilaiSekolah_v2_koreksiSel';
var AUTO_KEY = 'rn_kk_auto';
var BOBOT_B = 2; /* poin maksimal per soal Bagian B (pilihan 0, 1, 2) */
var K = { ujian:'', mapel:'', kelas:'', siswaId:'', pos:0, panel:'', bag:'A', auto:true, filter:false };
try{ K.auto = (typeof lsGet_==='function' ? lsGet_(AUTO_KEY) : null) !== '0'; }catch(e){}

/* ---------- util ---------- */
function esc(s){ return (typeof escapeHtml==='function') ? escapeHtml(s) : String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function seg(s){ return String(s==null?'':s).replace(/[.#$\[\]\/]/g,'_'); }
function toast(m){ try{ showToast(m); }catch(e){} }
function $(id){ return document.getElementById(id); }
function ensure(){
  if(!DB.koreksi || typeof DB.koreksi!=='object') DB.koreksi = {};
  if(!DB.koreksi.kunci || typeof DB.koreksi.kunci!=='object') DB.koreksi.kunci = {};
  if(!DB.koreksi.jawab || typeof DB.koreksi.jawab!=='object') DB.koreksi.jawab = {};
  if(!DB.koreksi.waktu || typeof DB.koreksi.waktu!=='object') DB.koreksi.waktu = {};
  if(!DB.koreksi.skorB || typeof DB.koreksi.skorB!=='object') DB.koreksi.skorB = {};
  if(!DB.koreksi.skorC || typeof DB.koreksi.skorC!=='object') DB.koreksi.skorC = {};
  return DB.koreksi;
}
function kelasObj(){ return DB.kelasList.find(function(k){return k.id===K.kelas;}); }
function kelompok(){ var k=kelasObj(); return k ? (k.kelompok||k.nama) : ''; }
function kKunci(){ return [seg(K.ujian),seg(K.mapel),seg(kelompok())].join('||'); }
function kJawab(){ return [seg(K.ujian),seg(K.mapel),seg(K.kelas)].join('||'); }
function siswaList(){ var k=kelasObj(); return k ? (k.siswa||[]) : []; }
function pad(s,n,ch){ s=String(s||''); while(s.length<n) s+=ch; return s.slice(0,n); }

function getKunci(create){
  var st=ensure().kunci, key=kKunci();
  if(!st[key]){
    if(!create) return null;
    st[key]={n:20,a:pad('',20,'-'),b:'',c:''};
  }
  var d=st[key];
  d.n = Math.max(1, Math.min(100, parseInt(d.n,10)||20));
  d.a = pad(d.a,d.n,'-'); d.b = d.b||''; d.c = d.c||'';
  return d;
}
function getJawab(){
  var st=ensure().jawab, key=kJawab();
  if(!st[key]) st[key]={};
  return st[key];
}
/* ---------- Waktu koreksi Bagian A ----------
   Mulai terhitung saat soal 1 diisi. Tiap jawaban menambah selisih waktu sejak jawaban
   sebelumnya, dibatasi IDLE_MAX detik agar jeda panjang (istirahat) tidak ikut terhitung. */
var IDLE_MAX = 120;
function getWaktu(){
  var st=ensure().waktu, key=kJawab();
  if(!st[key]) st[key]={};
  return st[key];
}
function catatWaktu(id, kosong){
  var w=getWaktu(), now=Date.now(), r=w[id];
  if(kosong || !r || !r.t){ w[id]={d:0,t:now}; return; }
  r.d=Math.round((r.d+Math.min((now-r.t)/1000,IDLE_MAX))*10)/10; r.t=now;
}
function detikWaktu(id, selesai){
  var r=getWaktu()[id]; if(!r||!r.t) return null;
  return r.d + (selesai ? 0 : Math.min((Date.now()-r.t)/1000,IDLE_MAX));
}
function fmtWaktu(sec){
  if(sec==null) return '–';
  sec=Math.round(sec); var m=Math.floor(sec/60), d=sec%60;
  return m+':'+(d<10?'0':'')+d;
}
function jawabSiswa(id,n){ return pad(getJawab()[id],n,'-'); }
function simpan(){ try{ saveDB(); }catch(e){ console.warn(e); } }

/* skor satu siswa: {benar, terisi} */
function hitung(kunci, jw){
  var benar=0, terisi=0;
  for(var i=0;i<kunci.n;i++){
    var kc=kunci.a.charAt(i), j=jw.charAt(i);
    if(j!=='-') terisi++;
    if(kc==='*') benar++;
    else if(kc!=='-' && j===kc) benar++;
  }
  return {benar:benar, terisi:terisi};
}
function maksBagian(){
  try{ var d=getUtsData(K.mapel,K.kelas); return d && d.maksBagian ? d.maksBagian : 20; }catch(e){ return 20; }
}
function nilaiA(benar,n){ return Math.round((benar/n)*maksBagian()*100)/100; }

/* ---------- Bagian B & C: butir kunci + skor per soal ---------- */
function itemsB(kd){
  return String(kd.b||'').split('\n').map(function(l){
    var m=l.trim().match(/^(\d{1,3})\s*[.)|:\-]?\s*\|?\s*(.*)$/);
    return m ? {no:m[1], teks:m[2]} : null;
  }).filter(Boolean);
}
function itemsC(kd){
  return String(kd.c||'').split('\n').map(function(l){
    var m=l.trim().match(/^(\d{1,3})\s*[.)|:]?\s*(.*)$/); if(!m) return null;
    var kunci='', kr={};
    m[2].split(/\s*\|\s*/).forEach(function(p){
      var k=p.match(/^KUNCI\s*:\s*(.*)$/i);
      if(k){ kunci=k[1]; return; }
      var s=p.match(/^([0-4])\s*:\s*(.*)$/);
      if(s){ kr[s[1]]=s[2]; return; }
      if(!kunci) kunci=p;
    });
    return {no:m[1], kunci:kunci, kr:kr};
  }).filter(Boolean);
}
function skorStr(j,id,n){
  var st=ensure()['skor'+j], key=kJawab();
  if(!st[key]) st[key]={};
  return pad(st[key][id],n,'-');
}
function setSkor(j,id,n,i,ch){
  var st=ensure()['skor'+j], key=kJawab();
  if(!st[key]) st[key]={};
  var s=pad(st[key][id],n,'-');
  st[key][id]=s.slice(0,i)+ch+s.slice(i+1);
}
/* ringkasan B/C satu siswa: {n, terisi, jml, nilai}
   B: jml = jumlah poin (tiap soal 0-2), nilai = jml (maks = maks nilai/bagian)
   C: jml = jumlah skor 0-4, nilai = jml / (n x 4) x maks nilai/bagian */
function ringkasBC(j,kd,id){
  var items=(j==='B')?itemsB(kd):itemsC(kd), n=items.length, s=skorStr(j,id,n), jml=0, terisi=0;
  for(var i=0;i<n;i++){ var ch=s.charAt(i); if(ch!=='-'){ terisi++; jml+=parseInt(ch,10)||0; } }
  var nilai;
  if(j==='B') nilai=Math.round(Math.min(maksBagian(), jml)*100)/100;
  else nilai = n ? Math.round(jml/(n*4)*maksBagian()*100)/100 : 0;
  return {n:n, terisi:terisi, jml:jml, nilai:nilai};
}
/* Nilai Akhir seperti fitur UTS/STS: hanya bila A, B, C terisi semua.
   Tiap bagian dibulatkan dulu (sama seperti yang dikirim ke tabel UTS/STS). */
function nilaiAkhirSiswa(kd,id){
  var rA=hitung(kd,jawabSiswa(id,kd.n)), rB=ringkasBC('B',kd,id), rC=ringkasBC('C',kd,id);
  if(rA.terisi<kd.n || !rB.n || rB.terisi<rB.n || !rC.n || rC.terisi<rC.n) return null;
  var a=Math.round(nilaiA(rA.benar,kd.n)), b=Math.round(rB.nilai), c=Math.round(rC.nilai);
  var maks3=maksBagian()*3, total=a+b+c;
  return {a:a, b:b, c:c, total:total, maks3:maks3, akhir:Math.round((total/maks3)*100)};
}
/* ---------- status per bagian (A/B/C) ---------- */
function nBag(kd,bag){ return bag==='A' ? kd.n : (bag==='B' ? itemsB(kd).length : itemsC(kd).length); }
function terisiBag(kd,id,bag){
  if(bag==='A') return hitung(kd,jawabSiswa(id,kd.n)).terisi;
  return ringkasBC(bag,kd,id).terisi;
}
function selesaiBag(kd,id,bag){ var n=nBag(kd,bag); return n>0 && terisiBag(kd,id,bag)>=n; }

/* Berapa siswa yang BELUM selesai dinilai di tiap bagian.
   belum = soal belum terisi semua; sebagian = di antaranya yang sudah mulai terisi.
   ada=false bila kunci bagian itu belum dibuat. */
function hitungBelum(kd){
  var list=siswaList(), nB=itemsB(kd).length, nC=itemsC(kd).length;
  var h={total:list.length, A:{ada:true,belum:0,sebagian:0}, B:{ada:nB>0,belum:0,sebagian:0}, C:{ada:nC>0,belum:0,sebagian:0}};
  function catat(o,terisi,n){ if(terisi<n){ o.belum++; if(terisi>0) o.sebagian++; } }
  list.forEach(function(s){
    catat(h.A, hitung(kd,jawabSiswa(s.id,kd.n)).terisi, kd.n);
    if(h.B.ada) catat(h.B, ringkasBC('B',kd,s.id).terisi, nB);
    if(h.C.ada) catat(h.C, ringkasBC('C',kd,s.id).terisi, nC);
  });
  return h;
}
function updateBelum(){
  var el=$('kkBelum'), kd=getKunci(false); if(!el||!kd) return;
  var h=hitungBelum(kd);
  function baris(huruf,o){
    var isi;
    if(!o.ada) isi='<span>kunci belum ada</span>';
    else if(!o.belum) isi='<span class="ok">✓ semua selesai</span>';
    else isi='<span><b>'+o.belum+'</b> belum'+(o.sebagian?' <small>('+o.sebagian+' baru sebagian)</small>':'')+'</span>';
    return '<div><span>Bagian '+huruf+'</span>'+isi+'</div>';
  }
  el.innerHTML='<div class="kk-belum-judul">Belum dinilai (dari '+h.total+' siswa)</div>'+baris('A',h.A)+baris('B',h.B)+baris('C',h.C);
}

/* ---------- Urungkan (maks 30 langkah) ---------- */
var UNDO=[];
function pushUndo(e){ UNDO.push(e); if(UNDO.length>30) UNDO.shift(); }
function snapA(s,jw){
  var w=getWaktu()[s.id];
  return {kind:'jawab', key:kJawab(), id:s.id, prev:jw, pos:K.pos, waktu:w?{d:w.d,t:w.t}:null, bag:'A'};
}
function undo(){
  var e=UNDO.pop();
  if(!e){ toast('Tidak ada yang bisa diurungkan.'); return; }
  if(e.key!==kJawab()){ toast('Langkah itu milik ujian/mapel/kelas lain, dilewati.'); UNDO=[]; segarkan(); return; }
  if(e.kind==='skor'){
    var st=ensure()['skor'+e.j]; if(!st[e.key]) st[e.key]={};
    st[e.key][e.id]=e.prev;
  } else {
    var js=ensure().jawab; if(!js[e.key]) js[e.key]={};
    js[e.key][e.id]=e.prev;
    var ws=ensure().waktu; if(!ws[e.key]) ws[e.key]={};
    if(e.waktu) ws[e.key][e.id]=e.waktu; else delete ws[e.key][e.id];
    K.pos=e.pos;
  }
  K.siswaId=e.id; K.bag=e.bag;
  simpan(); segarkan();
}

/* ---------- Prompt master + parser ---------- */
function promptMaster(){
  var kel = kelasObj();
  return [
    'Kamu adalah penyusun kunci jawaban ujian sekolah (Madrasah Ibtidaiyah).',
    'Mapel: '+(K.mapel||'-')+' | Ujian: '+(namaUjian()||'-')+' | Kelas: '+(kel?kel.nama:'-'),
    '',
    'Saya melampirkan soal ujian. Kerjakan SEMUA soal dengan teliti, tentukan jawaban yang benar, lalu keluarkan HANYA satu blok kode dengan format PERSIS di bawah ini, tanpa penjelasan, tanpa teks lain di luar blok.',
    '',
    '```',
    '#KUNCI',
    'A',
    '1 B',
    '2 D',
    '3 A',
    'B',
    '1 | kunci isian singkat',
    '2 | kunci isian singkat',
    'C',
    '1 | KUNCI: jawaban ideal singkat | 4: sempurna, memuat semua poin kunci | 3: kurang sedikit (satu poin kurang/keliru) | 2: separuh benar | 1: hanya sedikit benar | 0: kosong atau salah',
    '#AKHIR',
    '```',
    '',
    'ATURAN:',
    '1. Bagian A = pilihan ganda. Satu baris per nomor: "nomor spasi huruf" (huruf besar A/B/C/D saja).',
    '2. Jika sebuah soal PG ambigu, tidak punya jawaban benar, atau ada dua jawaban benar, tulis BONUS sebagai jawabannya (contoh: "7 BONUS").',
    '3. Bagian B = isian. Satu baris per nomor: "nomor | kunci" (kunci singkat, tanpa baris baru).',
    '4. Bagian C = uraian/esai. Satu baris per nomor, TETAP SATU BARIS, dengan format: "nomor | KUNCI: jawaban ideal | 4: ... | 3: ... | 2: ... | 1: ... | 0: ...". Nilai maksimal tiap soal = 4. Skor 4 = jawaban sempurna, 3 = kurang sedikit, 2 = separuh benar, 1 = sedikit benar, 0 = kosong/salah. Tulis kriteria SPESIFIK sesuai soal (poin apa yang harus ada untuk tiap skor), bukan kalimat umum. Gunakan tanda "|" hanya sebagai pemisah di format ini.',
    '5. Nomor mengikuti nomor soal di lembar soal. Jika suatu bagian tidak ada, tulis huruf bagiannya lalu satu baris "-".',
    '6. Jika ragu pada suatu jawaban PG, tetap pilih yang paling mungkin; jangan menulis tanda tanya.',
    '7. Jangan menambah judul, komentar, atau penjelasan apa pun di luar blok.'
  ].join('\n');
}
function namaUjian(){
  try{ var u=DB.ujianList.find(function(x){return x.id===K.ujian;}); return u?u.nama:''; }catch(e){ return ''; }
}
/* Mengembalikan {n,a,b,c,jmlA,jmlB,jmlC} atau null kalau tak ada bagian A */
function parseKunci(teks){
  var t=String(teks||'').replace(/\r/g,'').replace(/```[a-z]*/gi,'');
  var m=t.match(/#KUNCI([\s\S]*?)(?:#AKHIR|$)/i);
  if(m) t=m[1];
  var bagian=null, A={}, B={}, C={}, lines=t.split('\n');
  lines.forEach(function(raw){
    var ln=raw.trim(); if(!ln) return;
    var h=ln.match(/^(?:bagian\s*)?([ABC])\s*[:.)\]]?\s*$/i);
    if(h){ bagian=h[1].toUpperCase(); return; }
    if(!bagian) return;
    var r=ln.match(/^(\d{1,3})\s*[.)=:|\-]?\s*(.*)$/);
    if(!r) return;
    var no=parseInt(r[1],10), isi=r[2].replace(/^\|\s*/,'').trim();
    if(!no || no>100 || !isi || isi==='-') return;
    if(bagian==='A'){
      if(/^(bonus|semua)/i.test(isi)) A[no]='*';
      else { var l=isi.match(/^\W*([A-Da-d])(?![A-Za-z])/); if(l) A[no]=l[1].toUpperCase(); }
    } else if(bagian==='B'){ B[no]=isi; }
    else { C[no]=isi; }
  });
  var nomorA=Object.keys(A).map(Number);
  if(!nomorA.length) return null;
  var n=Math.max.apply(null,nomorA), a='';
  for(var i=1;i<=n;i++) a+=(A[i]||'-');
  function gabung(o){ return Object.keys(o).map(Number).sort(function(x,y){return x-y;}).map(function(k){return k+' | '+o[k];}).join('\n'); }
  return {n:n,a:a,b:gabung(B),c:gabung(C),jmlA:nomorA.length,jmlB:Object.keys(B).length,jmlC:Object.keys(C).length};
}

/* ---------- Clipboard ---------- */
function salin(teks){
  function cadangan(){
    var ta=document.createElement('textarea'); ta.value=teks; ta.style.cssText='position:fixed;left:-9999px;top:0;';
    document.body.appendChild(ta); ta.focus(); ta.select();
    var ok=false; try{ ok=document.execCommand('copy'); }catch(e){}
    ta.remove(); return ok;
  }
  if(navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(teks).then(function(){return true;}, function(){return cadangan();});
  }
  return Promise.resolve(cadangan());
}

/* ---------- Gaya ---------- */
var css=document.createElement('style'); css.id='koreksi-css';
css.textContent=[
'#page-koreksi .kk-grid{display:grid;grid-template-columns:minmax(210px,280px) 1fr;gap:14px;align-items:start;}',
'@media(max-width:760px){#page-koreksi .kk-grid{grid-template-columns:1fr;}}',
'#page-koreksi .kk-siswa{display:flex;flex-direction:column;gap:6px;max-height:70vh;overflow:auto;}',
'#page-koreksi .kk-sw{display:flex;justify-content:space-between;gap:8px;align-items:center;text-align:left;padding:10px 12px;border:1px solid var(--garis-strong);border-radius:var(--r-md);background:var(--kartu);color:var(--teks);font:inherit;cursor:pointer;}',
'#page-koreksi .kk-sw.aktif{border-color:var(--hijau);background:var(--hijau-muda);box-shadow:var(--ring);}',
'#page-koreksi .kk-sw small{color:var(--abu);white-space:nowrap;}',
'#page-koreksi .kk-sw.done small{color:var(--ok-text);font-weight:700;}',
'#page-koreksi .kk-chips{display:flex;gap:3px;align-items:center;flex:none;}',
'#page-koreksi .kk-chip{font-style:normal;font-weight:800;font-size:11px;min-width:20px;height:20px;line-height:20px;text-align:center;border-radius:6px;border:1px solid transparent;}',
'#page-koreksi .kk-chip.ok{background:var(--pill-hijau-bg);color:var(--pill-hijau-fg);}',
'#page-koreksi .kk-chip.sb{background:#fde68a;color:#78350f;}',
'#page-koreksi .kk-chip.kos{background:var(--surface-2);color:var(--abu);border-color:var(--garis-strong);}',
'#page-koreksi .kk-chip.na{background:transparent;color:var(--abu);opacity:.35;border-color:var(--garis);}',
'#page-koreksi .kk-chips small{margin-left:4px;font-weight:800;color:var(--hijau-tua);}',
'#page-koreksi .kk-filter{display:flex;align-items:center;gap:6px;font-size:13px;margin:0 0 8px;cursor:pointer;}',
'#page-koreksi .kk-filter input{width:auto;}',
'#page-koreksi .kk-nama{font-size:20px;font-weight:700;margin:0 0 2px;}',
'#page-koreksi .kk-info{color:var(--abu);font-size:14px;margin-bottom:10px;}',
'#page-koreksi .kk-no{font-size:56px;font-weight:800;line-height:1;margin:6px 0 12px;}',
'#page-koreksi .kk-no small{font-size:20px;color:var(--abu);font-weight:600;}',
'#page-koreksi .kk-abcd{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px;}',
'#page-koreksi .kk-abcd button{min-height:108px;font-size:52px;font-weight:800;border-radius:var(--r-xl);border:2px solid var(--hijau);background:var(--hijau-muda);color:var(--hijau-tua);cursor:pointer;font-family:inherit;touch-action:manipulation;}',
'#page-koreksi .kk-abcd button:active{background:var(--hijau);color:var(--on-hijau);}',
'#page-koreksi .kk-abcd button small{display:block;font-size:13px;font-weight:600;opacity:.7;margin-top:2px;}',
'#page-koreksi .kk-strip{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0;}',
'#page-koreksi .kk-c{min-width:34px;height:34px;padding:0 4px;border-radius:8px;border:1px solid var(--garis-strong);background:var(--surface-2);color:var(--teks);font:600 13px var(--font);cursor:pointer;}',
'#page-koreksi .kk-c.ok{background:var(--pill-hijau-bg);color:var(--pill-hijau-fg);border-color:transparent;}',
'#page-koreksi .kk-c.no{background:var(--pill-merah-bg);color:var(--pill-merah-fg);border-color:transparent;}',
'#page-koreksi .kk-c.cur{outline:3px solid var(--biru);outline-offset:1px;}',
'#page-koreksi .kk-skor{font-size:18px;font-weight:700;}',
'#page-koreksi .kk-kunci{white-space:pre-wrap;font-size:14px;background:var(--surface-2);border:1px solid var(--garis);border-radius:var(--r-md);padding:10px;max-height:34vh;overflow:auto;}',
'#page-koreksi textarea.kk-ta{width:100%;min-height:130px;font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;}',
'#page-koreksi .kk-edit{display:flex;flex-wrap:wrap;gap:6px 14px;margin:8px 0;}',
'#page-koreksi .kk-edit label{display:flex;align-items:center;gap:6px;font-size:14px;}',
'#page-koreksi .kk-edit select{width:auto;min-width:66px;}',
'#page-koreksi .kk-warn{color:var(--warn-text);font-size:13px;margin-top:6px;}',
'#page-koreksi .kk-hasil td,#page-koreksi .kk-hasil th{padding:6px 8px;text-align:left;border-bottom:1px solid var(--garis);}',
/* kotak "Belum dinilai" per bagian */
'#page-koreksi .kk-belum{display:flex;flex-direction:column;gap:4px;margin:0 0 10px;padding:8px 10px;border:1px solid var(--garis);border-radius:var(--r-md);background:var(--surface-2);font-size:13px;}',
'#page-koreksi .kk-belum-judul{font-weight:700;color:var(--abu);font-size:12px;}',
'#page-koreksi .kk-belum>div:not(.kk-belum-judul){display:flex;justify-content:space-between;gap:8px;align-items:baseline;}',
'#page-koreksi .kk-belum b{font-size:16px;color:var(--teks);}',
'#page-koreksi .kk-belum small{color:var(--abu);}',
'#page-koreksi .kk-belum .ok{color:var(--ok-text);font-weight:700;}',
/* header kartu siswa yang menempel + tab Bagian A/B/C */
'#page-koreksi .kk-sticky{position:sticky;top:var(--kk-top,0px);z-index:5;background:var(--kartu);padding:4px 0 2px;margin-bottom:6px;}',
'#page-koreksi .kk-mini{font-size:14px;font-weight:700;color:var(--hijau-tua);margin-bottom:4px;}',
'#page-koreksi .kk-tabs{display:flex;gap:6px;margin:6px 0 6px;}',
'#page-koreksi .kk-tab{flex:1 1 0;min-height:48px;padding:6px 8px;border-radius:var(--r-md);border:1px solid var(--garis-strong);background:var(--surface-2);color:var(--teks);font:inherit;font-weight:800;font-size:16px;cursor:pointer;touch-action:manipulation;}',
'#page-koreksi .kk-tab small{display:block;font-size:12px;font-weight:600;color:var(--abu);}',
'#page-koreksi .kk-tab.aktif{border-color:var(--hijau);background:var(--hijau-muda);color:var(--hijau-tua);box-shadow:var(--ring);}',
'#page-koreksi .kk-tools{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px;}',
'#page-koreksi .kk-tools .btn{min-height:40px;}',
/* Bagian B: satu baris per soal */
'#page-koreksi .kk-brows{display:flex;flex-direction:column;gap:6px;}',
'#page-koreksi .kk-brow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 8px;border:1px solid var(--garis);border-radius:var(--r-md);background:var(--surface-2);}',
'#page-koreksi .kk-brow.sudah{border-color:var(--hijau);}',
'#page-koreksi .kk-brow.next{outline:2px solid var(--biru);outline-offset:1px;}',
'#page-koreksi .kk-brow-k{flex:1;min-width:0;font-size:15px;line-height:1.3;word-break:break-word;}',
'#page-koreksi .kk-brow-k b{color:var(--hijau-tua);}',
'#page-koreksi .kk-brow-a{display:flex;gap:6px;flex:none;}',
'#page-koreksi .kk-brow-a .kk-sk{min-height:44px;min-width:54px;padding:4px 8px;font-size:18px;}',
/* kartu butir C */
'#page-koreksi .kk-bc{border:1px solid var(--garis);border-radius:var(--r-md);padding:10px;margin-bottom:10px;background:var(--surface-2);}',
'#page-koreksi .kk-bc.sudah{border-color:var(--hijau);}',
'#page-koreksi .kk-bc.next{outline:2px solid var(--biru);outline-offset:1px;}',
'#page-koreksi .kk-bc-kunci{font-size:15px;line-height:1.45;margin-bottom:8px;white-space:pre-wrap;}',
'#page-koreksi .kk-bc-kunci b{color:var(--hijau-tua);}',
'#page-koreksi .kk-sk{min-height:46px;border-radius:var(--r-md);border:2px solid var(--garis-strong);background:var(--kartu);color:var(--teks);font:inherit;font-weight:700;cursor:pointer;padding:6px 10px;touch-action:manipulation;}',
'#page-koreksi .kk-sk.ok.on{background:var(--pill-hijau-bg);color:var(--pill-hijau-fg);border-color:var(--hijau);}',
'#page-koreksi .kk-sk.no.on{background:var(--pill-merah-bg);color:var(--pill-merah-fg);border-color:var(--merah);}',
'#page-koreksi .kk-sk.half.on{background:var(--hijau-muda);color:var(--hijau-tua);border-color:var(--biru);box-shadow:var(--ring);}',
'#page-koreksi .kk-skala{display:flex;flex-direction:column;gap:6px;}',
'#page-koreksi .kk-skala .kk-sk{display:flex;gap:10px;align-items:flex-start;text-align:left;font-weight:500;font-size:14px;line-height:1.35;}',
'#page-koreksi .kk-skala .kk-sk b{font-size:20px;min-width:22px;line-height:1.1;}',
'#page-koreksi .kk-skala .kk-sk.on{background:var(--hijau-muda);border-color:var(--hijau);color:var(--hijau-tua);}',
'#page-koreksi .kk-nav{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;}',
'#page-koreksi .kk-auto{display:flex;align-items:center;gap:6px;font-size:13px;margin-top:8px;cursor:pointer;color:var(--abu);}',
'#page-koreksi .kk-auto input{width:auto;}',
/* banner Nilai Akhir di atas kartu siswa */
'#page-koreksi .kk-akhir{display:flex;align-items:center;gap:14px;margin:6px 0 10px;padding:10px 14px;border-radius:var(--r-lg);border:2px solid var(--hijau);background:var(--hijau-muda);color:var(--hijau-tua);}',
'#page-koreksi .kk-akhir-n{font-size:46px;font-weight:800;line-height:1;text-align:center;}',
'#page-koreksi .kk-akhir-n small{display:block;font-size:12px;font-weight:700;margin-top:4px;opacity:.8;}',
'#page-koreksi .kk-akhir-d{font-size:14px;line-height:1.5;}',
/* analisis soal */
'#page-koreksi .kk-anal td,#page-koreksi .kk-anal th{padding:5px 8px;text-align:left;border-bottom:1px solid var(--garis);font-size:13px;}',
'#page-koreksi .kk-bar{display:inline-block;height:8px;border-radius:4px;background:var(--hijau);vertical-align:middle;min-width:2px;}',
'#page-koreksi .kk-bar.bad{background:var(--merah);}',
'#page-koreksi .kk-sulit{font-size:14px;margin:0 0 8px;}',
'#page-koreksi .kk-sulit b{color:var(--merah);}'
].join('\n');
document.head.appendChild(css);

/* ---------- Kerangka halaman ---------- */
var sec=document.createElement('section'); sec.className='page'; sec.id='page-koreksi';
sec.innerHTML=
'<div class="card"><h2>Koreksi Soal</h2>'+
'<div class="sub">Pilih ujian, mapel, kelas, lalu siswa. <b>Bagian A</b> diketik cepat dengan keyboard <b>Q=A, W=B, E=C, R=D</b> atau tombol besar. <b>Bagian B</b> (tiap soal 0, 1, atau 2 poin; keyboard <b>0/1/2</b>) &amp; <b>C</b> (skor 0-4) dinilai di tab masing-masing, kunci tampil di tiap soal. Nilai akhir muncul di atas bila A, B, C sudah terisi semua.</div>'+
'<div class="row">'+
'<div class="field"><label>Ujian</label><select id="kkUjian" class="sel-ujian"></select></div>'+
'<div class="field"><label>Mata Pelajaran</label><select id="kkMapel"></select></div>'+
'<div class="field"><label>Kelas</label><select id="kkKelas"></select></div>'+
'</div></div>'+
'<div id="kkBody"></div>';
var main=document.querySelector('main');
(main||document.body).appendChild(sec);
if(PAGES.indexOf('koreksi')<0) PAGES.push('koreksi');
if(typeof DASH_TILE_INFO!=='undefined') DASH_TILE_INFO.koreksi={ic:'✅',label:'Koreksi Soal'};

/* menu: sidebar, lembar "Semua Menu", beranda */
(function(){
  var ikon='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 5 5L20 6"/></svg>';
  var sb=document.querySelector('.sidebar-nav button[data-page="harian"]');
  if(sb){ var b=document.createElement('button'); b.setAttribute('data-page','koreksi');
    b.innerHTML='<span class="nav-icon" aria-hidden="true">'+ikon+'</span><span>Koreksi Soal</span>'; b.title='Koreksi Soal'; b.setAttribute('aria-label','Koreksi Soal'); sb.after(b); }
  var sh=document.querySelector('#moreSheet button[data-page="harian"]');
  if(sh){ var b2=document.createElement('button'); b2.setAttribute('data-page','koreksi'); b2.setAttribute('popovertarget','moreSheet');
    b2.innerHTML='<span>'+ikon+'</span>Koreksi Soal'; sh.after(b2); }
  var dt=document.querySelector('.dash-tile[data-page="harian"]');
  if(dt){ var b3=document.createElement('button'); b3.className='dash-tile'; b3.setAttribute('data-page','koreksi'); b3.setAttribute('aria-label','Buka Koreksi Soal');
    b3.innerHTML='<span class="dash-tile-ic">'+ikon+'</span><span class="dash-tile-label">Koreksi Soal</span><span class="dash-tile-badge" id="tileBadge-koreksi"></span>'; dt.after(b3); }
})();

/* ---------- Render ---------- */
function isiPilihan(){
  if(typeof isiSelectUjian_==='function') isiSelectUjian_();
  var sm=$('kkMapel'), sk=$('kkKelas');
  sm.innerHTML=DB.mapelList.map(function(m){return '<option value="'+esc(m)+'">'+esc(m)+'</option>';}).join('');
  sk.innerHTML=DB.kelasList.map(function(k){return '<option value="'+esc(k.id)+'">'+esc(k.nama)+'</option>';}).join('');
  var sv={}; try{ sv=JSON.parse(lsGet_(SEL_KEY)||'{}'); }catch(e){}
  var mp=K.mapel||sv.mapel, kl=K.kelas||sv.kelas;
  if(mp && DB.mapelList.indexOf(mp)>=0) sm.value=mp;
  if(kl && DB.kelasList.some(function(k){return k.id===kl;})) sk.value=kl;
  K.mapel=sm.value; K.kelas=sk.value;
  K.ujian=($('kkUjian')||{}).value||'';
}
function render(){
  isiPilihan();
  var box=$('kkBody');
  if(!K.mapel||!K.kelas||!K.ujian){ box.innerHTML='<div class="card"><div class="empty-note">Tambahkan mapel dan kelas di Pengaturan dulu.</div></div>'; return; }
  var kd=getKunci(false), h='';
  h+='<div class="card"><h3 style="margin:0 0 6px;">Kunci Jawaban</h3>';
  h+='<div class="kk-info">'+(kd?('Bagian A: <b>'+kd.n+' soal</b>'+(kd.b?' · B: '+itemsB(kd).length:'')+(kd.c?' · C: '+itemsC(kd).length:'')):'Belum ada kunci untuk ujian/mapel/tingkat ini.')+'</div>';
  h+='<div class="btn-row"><button class="btn" id="kkSalinPrompt">📋 Salin Prompt Master</button>'+
     '<button class="btn secondary" id="kkTempel">Tempel Kunci dari AI</button>'+
     '<button class="btn secondary" id="kkAtur">Atur Kunci Manual</button></div>';
  if(K.panel==='tempel'){
    h+='<div style="margin-top:10px;"><textarea class="kk-ta" id="kkTa" placeholder="Tempel hasil AI di sini (blok #KUNCI ... #AKHIR)"></textarea>'+
       '<div class="btn-row"><button class="btn" id="kkTerapkan">Baca &amp; Simpan Kunci</button><button class="btn secondary" id="kkBatal">Tutup</button></div><div id="kkPrev" class="kk-info"></div></div>';
  }
  if(K.panel==='atur' && kd){
    h+='<div style="margin-top:10px;"><div class="row"><div class="field" style="max-width:150px;"><label>Jumlah soal A</label><input type="number" id="kkN" min="1" max="100" value="'+kd.n+'"></div></div>';
    h+='<div class="kk-info">Soal salah? Ubah di sini — skor semua siswa ikut berubah. <b>Bonus</b> = semua siswa dapat nilai benar.</div><div class="kk-edit">';
    for(var i=0;i<kd.n;i++){
      var c=kd.a.charAt(i);
      h+='<label>'+(i+1)+'<select data-kk-no="'+i+'">'+
        [['-','–'],['A','A'],['B','B'],['C','C'],['D','D'],['*','Bonus']].map(function(o){return '<option value="'+o[0]+'"'+(c===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select></label>';
    }
    h+='</div><div class="row"><div class="field"><label>Kunci Bagian B (satu baris per nomor: 1 | kunci)</label><textarea class="kk-ta" id="kkB" style="min-height:90px;">'+esc(kd.b)+'</textarea></div>'+
       '<div class="field"><label>Kunci Bagian C (1 | KUNCI: ... | 4: ... | 3: ... | 2: ... | 1: ... | 0: ...)</label><textarea class="kk-ta" id="kkC" style="min-height:90px;">'+esc(kd.c)+'</textarea></div></div>'+
       '<div class="btn-row"><button class="btn" id="kkSimpanBC">Simpan Kunci B &amp; C</button><button class="btn secondary" id="kkTutup">Tutup</button></div></div>';
  }
  h+='</div>';
  if(kd){
    h+='<div class="kk-grid"><div class="card"><h3 style="margin:0 0 8px;">Siswa</h3><div class="kk-belum" id="kkBelum"></div>'+
       '<label class="kk-filter"><input type="checkbox" id="kkFilter"'+(K.filter?' checked':'')+'> Hanya yang belum selesai (<span id="kkFilterBag">Bagian '+K.bag+'</span>)</label>'+
       '<div class="kk-siswa" id="kkSiswa"></div></div><div id="kkPanel"></div></div>';
    h+='<div id="kkHasil"></div>';
  }
  box.innerHTML=h;
  if(kd){ daftarSiswa(); panelKoreksi(); tabelHasil(); }
}
/* penanda kecil A/B/C per siswa: hijau = selesai, kuning = sebagian, abu = belum, pudar = tanpa kunci */
function chipsSiswa(kd,id){
  var out='';
  ['A','B','C'].forEach(function(bg){
    var n=nBag(kd,bg), t=n?terisiBag(kd,id,bg):0;
    var cls=!n?'na':(t>=n?'ok':(t>0?'sb':'kos'));
    out+='<i class="kk-chip '+cls+'" title="Bagian '+bg+(n?(' '+t+'/'+n):' (kunci belum ada)')+'">'+bg+'</i>';
  });
  return out;
}
function daftarSiswa(){
  var kd=getKunci(false), el=$('kkSiswa'); if(!el||!kd) return;
  var fb=$('kkFilterBag'); if(fb) fb.textContent='Bagian '+K.bag;
  var html=siswaList().map(function(s,i){
    if(K.filter && s.id!==K.siswaId && selesaiBag(kd,s.id,K.bag)) return '';
    var lengkap=true;
    ['A','B','C'].forEach(function(bg){ if(nBag(kd,bg)>0 && !selesaiBag(kd,s.id,bg)) lengkap=false; });
    var ak=nilaiAkhirSiswa(kd,s.id);
    return '<button class="kk-sw'+(s.id===K.siswaId?' aktif':'')+(lengkap?' done':'')+'" data-kk-siswa="'+esc(s.id)+'"><span>'+(i+1)+'. '+esc(s.nama)+'</span><span class="kk-chips">'+chipsSiswa(kd,s.id)+(ak?'<small>'+ak.akhir+'</small>':'')+'</span></button>';
  }).join('');
  el.innerHTML=html||'<div class="empty-note">🎉 Semua siswa sudah selesai di Bagian '+K.bag+'.</div>';
  updateBelum();
}
function siswaAktif(){ return siswaList().find(function(s){return s.id===K.siswaId;}); }

/* isi tab Bagian A (perilaku sama seperti sebelumnya) */
function bodyA(kd,s){
  var jw=jawabSiswa(s.id,kd.n), r=hitung(kd,jw), selesai=K.pos>=kd.n;
  var strip='';
  for(var i=0;i<kd.n;i++){
    var kc=kd.a.charAt(i), j=jw.charAt(i), cls='kk-c';
    if(j!=='-' || kc==='*'){ cls+=(kc==='*' || (kc!=='-' && j===kc))?' ok':' no'; }
    if(i===K.pos) cls+=' cur';
    strip+='<button class="'+cls+'" data-kk-pos="'+i+'" title="Soal '+(i+1)+'">'+(i+1)+(j!=='-'?j:'')+'</button>';
  }
  var h='<div class="kk-info">Benar <span class="kk-skor">'+r.benar+' / '+kd.n+'</span> · Nilai A: <span class="kk-skor">'+nilaiA(r.benar,kd.n)+'</span> (maks '+maksBagian()+')'+
    ' · ⏱ <span class="kk-skor" id="kkTimer">'+(detikWaktu(s.id,r.terisi>=kd.n)==null?'mulai saat soal 1 diisi':fmtWaktu(detikWaktu(s.id,r.terisi>=kd.n)))+'</span></div>';
  if(selesai){
    h+='<div class="kk-no" style="font-size:34px;">Selesai ✓</div><div class="btn-row"><button class="btn" id="kkNext">Siswa berikutnya (Enter)</button><button class="btn secondary" id="kkUlang">Ulangi dari soal 1</button></div>';
  } else {
    h+='<div class="kk-no">Soal '+(K.pos+1)+' <small>dari '+kd.n+'</small></div>'+
      '<div class="kk-abcd"><button data-kk-j="A">A<small>Q</small></button><button data-kk-j="B">B<small>W</small></button><button data-kk-j="C">C<small>E</small></button><button data-kk-j="D">D<small>R</small></button></div>'+
      '<div class="btn-row"><button class="btn secondary" id="kkLewati">Kosong / lewati (Spasi)</button><button class="btn secondary" id="kkMundur">⌫ Mundur &amp; hapus</button></div>';
  }
  h+='<div class="kk-strip">'+strip+'</div><div class="kk-info">Keyboard: Q W E R = A B C D · Spasi = kosong · Backspace = mundur · ← → pindah soal · Enter = siswa berikutnya</div>';
  if(kd.a.indexOf('-')>=0) h+='<div class="kk-warn">⚠ Ada soal yang kuncinya belum terisi (tanda –). Soal itu dianggap salah untuk semua siswa sampai kuncinya diisi.</div>';
  return h;
}
/* isi tab Bagian B: satu baris per soal; tiap soal 0 (salah), 1 (sebagian), atau 2 (benar) poin */
function bodyB(kd,s){
  var it=itemsB(kd);
  if(!it.length) return '<div class="empty-note">Kunci Bagian B belum ada. Isi lewat “Atur Kunci Manual” atau “Tempel Kunci dari AI”.</div>';
  var str=skorStr('B',s.id,it.length), r=ringkasBC('B',kd,s.id), next=str.indexOf('-');
  var h='<div class="kk-info">Poin <span class="kk-skor">'+r.jml+' / '+(it.length*BOBOT_B)+'</span> · Nilai B: <span class="kk-skor">'+(r.terisi?r.nilai:'–')+'</span> (maks '+maksBagian()+') · terisi '+r.terisi+'/'+it.length+'<br>0 = salah · 1 = sebagian · '+BOBOT_B+' = benar · keyboard 0/1/'+BOBOT_B+' mengisi soal bertanda biru</div>';
  h+='<div class="kk-brows">';
  it.forEach(function(x,idx){
    var ch=str.charAt(idx);
    h+='<div class="kk-brow'+(ch!=='-'?' sudah':'')+(idx===next?' next':'')+'"><div class="kk-brow-k"><b>'+esc(x.no)+'.</b> '+esc(x.teks)+'</div>'+
       '<div class="kk-brow-a">'+
       '<button class="kk-sk no'+(ch==='0'?' on':'')+'" data-kk-b="'+idx+':0" title="Salah">0</button>'+
       '<button class="kk-sk half'+(ch==='1'?' on':'')+'" data-kk-b="'+idx+':1" title="Sebagian">1</button>'+
       '<button class="kk-sk ok'+(ch==='2'?' on':'')+'" data-kk-b="'+idx+':2" title="Benar">2</button>'+
       '</div></div>';
  });
  h+='</div>';
  return h;
}
/* isi tab Bagian C: kunci + kriteria skor 0-4, ketuk kriteria = beri skor */
function bodyC(kd,s){
  var it=itemsC(kd);
  if(!it.length) return '<div class="empty-note">Kunci Bagian C belum ada. Isi lewat “Atur Kunci Manual” atau “Tempel Kunci dari AI”.</div>';
  var str=skorStr('C',s.id,it.length), r=ringkasBC('C',kd,s.id), next=str.indexOf('-');
  var h='<div class="kk-info">Skor <span class="kk-skor">'+r.jml+' / '+(it.length*4)+'</span> · Nilai C: <span class="kk-skor">'+(r.terisi?r.nilai:'–')+'</span> (maks '+maksBagian()+') · terisi '+r.terisi+'/'+it.length+' · keyboard 0-4 mengisi soal bertanda biru</div>';
  it.forEach(function(x,idx){
    var ch=str.charAt(idx);
    h+='<div class="kk-bc'+(ch!=='-'?' sudah':'')+(idx===next?' next':'')+'"><div class="kk-bc-kunci"><b>'+esc(x.no)+'.</b> '+esc(x.kunci||'(kunci belum diisi)')+'</div><div class="kk-skala">';
    [4,3,2,1,0].forEach(function(sc){
      h+='<button class="kk-sk'+(ch===String(sc)?' on':'')+'" data-kk-c="'+idx+':'+sc+'"><b>'+sc+'</b><span>'+esc(x.kr[sc]||'')+'</span></button>';
    });
    h+='</div></div>';
  });
  return h;
}
/* banner Nilai Akhir (hanya saat A, B, C lengkap; skor sementara selalu ada di header yang menempel) */
function bannerAkhir(kd,s){
  var x=nilaiAkhirSiswa(kd,s.id);
  if(!x) return '';
  return '<div class="kk-akhir"><div class="kk-akhir-n">'+x.akhir+'<small>NILAI AKHIR</small></div>'+
    '<div class="kk-akhir-d">Total <b>'+x.total+' / '+x.maks3+'</b><br>A '+x.a+' + B '+x.b+' + C '+x.c+'</div></div>';
}
function panelKoreksi(){
  var kd=getKunci(false), el=$('kkPanel'); if(!el||!kd) return;
  var s=siswaAktif();
  if(!s){ el.innerHTML='<div class="card"><div class="empty-note">Pilih siswa di sebelah kiri untuk mulai mengoreksi.</div></div>'; return; }
  var rA=hitung(kd,jawabSiswa(s.id,kd.n)), rB=ringkasBC('B',kd,s.id), rC=ringkasBC('C',kd,s.id), ak=nilaiAkhirSiswa(kd,s.id);
  function tab(kode,judul,info){ return '<button class="kk-tab'+(K.bag===kode?' aktif':'')+'" data-kk-bag="'+kode+'">'+judul+'<small>'+info+'</small></button>'; }
  var mini='A '+(rA.terisi?nilaiA(rA.benar,kd.n):'–')+' · B '+(rB.terisi?rB.nilai:'–')+' · C '+(rC.terisi?rC.nilai:'–')+' · Akhir '+(ak?ak.akhir:'–');
  var h='<div class="card"><div class="kk-sticky"><p class="kk-nama">'+esc(s.nama)+'</p><div class="kk-mini">'+mini+'</div>'+
    '<div class="kk-tabs">'+
      tab('A','Bagian A',rA.terisi+'/'+kd.n)+
      tab('B','Bagian B',rB.n?(rB.terisi+'/'+rB.n):'–')+
      tab('C','Bagian C',rC.n?(rC.terisi+'/'+rC.n):'–')+
    '</div></div>'+
    bannerAkhir(kd,s);
  h+='<div class="kk-tools"><button class="btn secondary" id="kkUndo"'+(UNDO.length?'':' disabled')+'>↶ Urungkan</button>'+
     (K.bag==='B' && rB.n && rB.terisi<rB.n ? '<button class="btn secondary" id="kkBSemua">✓ Sisanya Benar ('+BOBOT_B+')</button>' : '')+'</div>';
  h+=(K.bag==='B')?bodyB(kd,s):(K.bag==='C')?bodyC(kd,s):bodyA(kd,s);
  if(K.bag!=='A'){
    h+='<div class="kk-nav"><button class="btn secondary" data-kk-nav="-1">← Siswa sebelumnya</button><button class="btn" id="kkNextBag">Berikutnya yang belum →</button></div>'+
       '<label class="kk-auto"><input type="checkbox" id="kkAuto"'+(K.auto?' checked':'')+'> Lanjut otomatis ke siswa berikutnya setelah soal terakhir terisi</label>';
  }
  h+='</div>';
  el.innerHTML=h;
  if(K.bag!=='A'){
    var nx=el.querySelector('.kk-brow.next, .kk-bc.next');
    if(nx && nx.scrollIntoView){ try{ nx.scrollIntoView({block:'nearest'}); }catch(e){} }
  }
}
/* ---------- Analisis soal ---------- */
function analisisSoal(kd){
  var list=siswaList(), baris=[];
  function tambahA(i){
    var kc=kd.a.charAt(i); if(kc==='-') return;
    var terisi=0, benar=0, salah={};
    list.forEach(function(s){
      var j=jawabSiswa(s.id,kd.n).charAt(i); if(j==='-') return;
      terisi++;
      if(kc==='*'||j===kc) benar++; else salah[j]=(salah[j]||0)+1;
    });
    if(!terisi) return;
    var top='', tm=0;
    Object.keys(salah).forEach(function(k){ if(salah[k]>tm){ tm=salah[k]; top=k; } });
    baris.push({bag:'A', no:String(i+1), n:terisi, pct:Math.round(benar/terisi*100), cat:(top && kc!=='*') ? ('salah terbanyak memilih '+top+' ('+tm+' siswa)') : ''});
  }
  for(var i=0;i<kd.n;i++) tambahA(i);
  [['B',itemsB(kd),BOBOT_B],['C',itemsC(kd),4]].forEach(function(g){
    g[1].forEach(function(x,idx){
      var t=0, sum=0;
      list.forEach(function(s){
        var ch=skorStr(g[0],s.id,g[1].length).charAt(idx); if(ch==='-') return;
        t++; sum+=parseInt(ch,10)||0;
      });
      if(t) baris.push({bag:g[0], no:x.no, n:t, pct:Math.round(sum/(t*g[2])*100), cat:''});
    });
  });
  if(!baris.length) return '';
  var sulit=baris.slice().sort(function(a,b){ return a.pct-b.pct; }).slice(0,5).filter(function(x){ return x.pct<100; });
  var h='<div class="card kk-anal"><h3 style="margin:0 0 6px;">Analisis Soal</h3>';
  h+=sulit.length
    ? '<div class="kk-sulit">Soal tersulit: '+sulit.map(function(x){ return '<b>'+x.bag+x.no+'</b> ('+x.pct+'%)'; }).join(', ')+'. Di bawah 50% layak dibahas ulang.</div>'
    : '<div class="kk-sulit">Semua soal dijawab benar oleh semua siswa yang sudah dinilai.</div>';
  h+='<details><summary style="cursor:pointer;font-weight:700;margin-bottom:6px;">Lihat semua soal</summary><div class="table-wrap"><table><thead><tr><th>Soal</th><th>Dinilai</th><th>Tuntas</th><th></th></tr></thead><tbody>'+
    baris.map(function(x){
      return '<tr><td><b>'+x.bag+x.no+'</b></td><td>'+x.n+'</td><td>'+x.pct+'%</td><td><span class="kk-bar'+(x.pct<50?' bad':'')+'" style="width:'+Math.max(2,Math.round(x.pct*0.9))+'px"></span> <small>'+esc(x.cat)+'</small></td></tr>';
    }).join('')+'</tbody></table></div></details>';
  h+='<div class="kk-info" style="margin:8px 0 0;">Bagian A: persen siswa yang menjawab benar. Bagian B/C: rata-rata skor dibanding skor maksimal soal itu.</div></div>';
  return h;
}
function tabelHasil(){
  var kd=getKunci(false), el=$('kkHasil'); if(!el||!kd) return;
  var total=0, jml=0;
  var rows=siswaList().map(function(s,i){
    var r=hitung(kd,jawabSiswa(s.id,kd.n)), done=r.terisi>=kd.n, dt=detikWaktu(s.id,done);
    var rb=ringkasBC('B',kd,s.id), rc=ringkasBC('C',kd,s.id), ak=nilaiAkhirSiswa(kd,s.id);
    if(done && dt!=null){ total+=dt; jml++; }
    return '<tr><td>'+(i+1)+'</td><td>'+esc(s.nama)+'</td><td>'+(r.terisi?r.benar+' / '+kd.n:'–')+'</td><td>'+(r.terisi?nilaiA(r.benar,kd.n):'–')+'</td><td>'+(rb.terisi?rb.nilai:'–')+'</td><td>'+(rc.terisi?rc.nilai:'–')+'</td><td><b>'+(ak?ak.akhir:'–')+'</b></td><td>'+(dt==null?'–':fmtWaktu(dt)+(done?'':' …'))+'</td></tr>';
  }).join('');
  var ringkas=jml?('<div class="kk-info">Waktu koreksi Bagian A: total <b>'+fmtWaktu(total)+'</b> untuk '+jml+' siswa · rata-rata <b>'+fmtWaktu(total/jml)+'</b> per siswa (jeda lebih dari '+IDLE_MAX+' dtk dihitung '+IDLE_MAX+' dtk).</div>'):'';
  el.innerHTML='<div class="card kk-hasil"><h3 style="margin:0 0 6px;">Hasil Koreksi</h3><div class="table-wrap"><table><thead><tr><th>No</th><th>Nama</th><th>Benar A</th><th>Nilai A</th><th>Nilai B</th><th>Nilai C</th><th>Nilai Akhir</th><th>Waktu A</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+ringkas+
    '<div class="btn-row" style="margin-top:10px;"><button class="btn" id="kkKirim">Terapkan Nilai A, B &amp; C ke menu Nilai UTS/STS</button></div>'+
    '<div class="kk-info">Hanya bagian yang sudah ada isinya yang dikirim. Nilai dibulatkan ke bilangan bulat karena pilihan di tabel UTS/STS berupa angka bulat. Nilai Akhir = total A+B+C ÷ (maks × 3) × 100, sama seperti di menu UTS/STS (katrol dihitung di sana).</div></div>'+
    analisisSoal(kd);
}
function segarkan(){ daftarSiswa(); panelKoreksi(); tabelHasil(); }

/* ---------- Aksi ---------- */
function pilihSiswa(id){
  var kd=getKunci(false); if(!kd) return;
  K.siswaId=id;
  var jw=jawabSiswa(id,kd.n), i=jw.indexOf('-');
  K.pos = i<0 ? kd.n : i;
  segarkan();
}
function jawab(huruf){
  var kd=getKunci(false), s=siswaAktif(); if(!kd||!s||K.pos>=kd.n) return;
  var jw=jawabSiswa(s.id,kd.n);
  pushUndo(snapA(s,jw));
  catatWaktu(s.id, jw.replace(/-/g,'')==='');
  getJawab()[s.id]=jw.slice(0,K.pos)+huruf+jw.slice(K.pos+1);
  K.pos++; simpan(); segarkan();
}
function mundur(){
  var kd=getKunci(false), s=siswaAktif(); if(!kd||!s||K.pos<=0) return;
  var jw=jawabSiswa(s.id,kd.n);
  pushUndo(snapA(s,jw));
  K.pos--;
  getJawab()[s.id]=jw.slice(0,K.pos)+'-'+jw.slice(K.pos+1);
  simpan(); segarkan();
}
/* siswa berikutnya yang Bagian A-nya belum selesai (dipakai tab A) */
function berikutnya(){
  var kd=getKunci(false), list=siswaList(); if(!kd||!list.length) return;
  var idx=list.findIndex(function(s){return s.id===K.siswaId;}), n=list.length;
  for(var step=1; step<=n; step++){
    var s=list[(idx+step)%n];
    if(hitung(kd,jawabSiswa(s.id,kd.n)).terisi<kd.n){ pilihSiswa(s.id); return; }
  }
  toast('Semua siswa sudah selesai dikoreksi.');
}
/* siswa berikutnya yang BELUM selesai di bagian yang sedang dibuka (A/B/C) */
function berikutnyaBag(){
  var kd=getKunci(false), list=siswaList(); if(!kd||!list.length) return;
  var bag=K.bag, n=list.length;
  if(!nBag(kd,bag)){ toast('Kunci Bagian '+bag+' belum ada.'); return; }
  var idx=list.findIndex(function(s){return s.id===K.siswaId;});
  for(var step=1; step<=n; step++){
    var s=list[(idx+step+n)%n];
    if(!selesaiBag(kd,s.id,bag)){
      pilihSiswa(s.id);
      try{ $('kkPanel').scrollIntoView({block:'start'}); }catch(e){}
      return;
    }
  }
  toast('🎉 Semua siswa sudah selesai di Bagian '+bag+'.');
}
/* pindah siswa urut daftar (tombol "sebelumnya") */
function sebelah(arah){
  var list=siswaList(); if(!list.length) return;
  var idx=list.findIndex(function(s){return s.id===K.siswaId;}), n=list.length;
  pilihSiswa(list[(idx<0?0:(idx+arah+n)%n)].id);
  try{ $('kkPanel').scrollIntoView({block:'start'}); }catch(e){}
}
/* lanjut otomatis setelah soal terakhir sebuah bagian terisi (jeda singkat supaya hasil sempat terlihat) */
function autoLanjut(bag,id){
  if(!K.auto) return;
  setTimeout(function(){
    if(K.siswaId===id && K.bag===bag) berikutnyaBag();
  },450);
}
/* beri skor B/C: ketuk lagi pada pilihan yang sama = hapus */
function beriSkor(j,idxSkor){
  var kd=getKunci(false), s=siswaAktif(); if(!kd||!s) return;
  var p=idxSkor.split(':'), i=parseInt(p[0],10), v=p[1];
  var n=(j==='B'?itemsB(kd):itemsC(kd)).length; if(!(i>=0&&i<n)) return;
  var prev=skorStr(j,s.id,n), lama=prev.charAt(i), baru=(lama===v?'-':v);
  pushUndo({kind:'skor', j:j, key:kJawab(), id:s.id, prev:prev, bag:j});
  setSkor(j,s.id,n,i,baru);
  simpan(); segarkan();
  if(baru!=='-' && selesaiBag(kd,s.id,j)) autoLanjut(j,s.id);
}
/* Bagian B: isi semua soal yang masih kosong dengan nilai maksimal */
function isiKosongB(){
  var kd=getKunci(false), s=siswaAktif(); if(!kd||!s) return;
  var n=itemsB(kd).length; if(!n) return;
  var prev=skorStr('B',s.id,n);
  if(prev.indexOf('-')<0){ toast('Semua soal sudah terisi.'); return; }
  pushUndo({kind:'skor', j:'B', key:kJawab(), id:s.id, prev:prev, bag:'B'});
  for(var i=0;i<n;i++) if(prev.charAt(i)==='-') setSkor('B',s.id,n,i,String(BOBOT_B));
  simpan(); segarkan(); autoLanjut('B',s.id);
}
function kirimKeUts(){
  var kd=getKunci(false); if(!kd) return;
  var d; try{ d=getUtsData(K.mapel,K.kelas); }catch(e){ return alertDialog('Data UTS/STS belum bisa dibuka.'); }
  var daftar=[];
  siswaList().forEach(function(s){
    var r=hitung(kd,jawabSiswa(s.id,kd.n)), rb=ringkasBC('B',kd,s.id), rc=ringkasBC('C',kd,s.id);
    if(!r.terisi && !rb.terisi && !rc.terisi) return;
    var row=d.siswa.find(function(x){return x.id && x.id===s.id;}) || d.siswa.find(function(x){return x.nama===s.nama;});
    if(row) daftar.push({row:row,
      a: r.terisi ? Math.round(nilaiA(r.benar,kd.n)) : null,
      b: rb.terisi ? Math.round(rb.nilai) : null,
      c: rc.terisi ? Math.round(rc.nilai) : null});
  });
  if(!daftar.length) return alertDialog('Belum ada nilai siswa yang bisa dikirim.');
  confirmDialog('Isi nilai A/B/C untuk '+daftar.length+' siswa pada ujian "'+namaUjian()+'" ('+K.mapel+', kelas '+(kelasObj()||{}).nama+')? Nilai yang sudah ada pada bagian yang terisi akan diganti.',{confirmLabel:'Terapkan'}).then(function(ya){
    if(!ya) return;
    daftar.forEach(function(x){
      if(x.a!=null) x.row.a=x.a;
      if(x.b!=null) x.row.b=x.b;
      if(x.c!=null) x.row.c=x.c;
    });
    simpan(); toast('Nilai A/B/C terkirim ke menu Nilai UTS/STS ('+daftar.length+' siswa).');
  });
}

/* ---------- Event ---------- */
sec.addEventListener('change',function(e){
  var t=e.target;
  if(t.id==='kkMapel'||t.id==='kkKelas'){
    K.mapel=$('kkMapel').value; K.kelas=$('kkKelas').value; K.siswaId=''; K.pos=0; UNDO=[];
    lsSet_(SEL_KEY,JSON.stringify({mapel:K.mapel,kelas:K.kelas})); render(); return;
  }
  if(t.id==='kkFilter'){ K.filter=!!t.checked; daftarSiswa(); return; }
  if(t.id==='kkAuto'){ K.auto=!!t.checked; try{ lsSet_(AUTO_KEY, K.auto?'1':'0'); }catch(err){} return; }
  if(t.id==='kkN'){
    var kd=getKunci(true); kd.n=Math.max(1,Math.min(100,parseInt(t.value,10)||kd.n)); kd.a=pad(kd.a,kd.n,'-'); simpan(); render(); return;
  }
  if(t.hasAttribute && t.hasAttribute('data-kk-no')){
    var k2=getKunci(true), i=+t.getAttribute('data-kk-no');
    k2.a=k2.a.slice(0,i)+t.value+k2.a.slice(i+1); simpan(); segarkan(); return;
  }
});
sec.addEventListener('input',function(e){
  if(e.target.id==='kkTa'){
    var p=parseKunci(e.target.value), pv=$('kkPrev');
    pv.innerHTML=p?('Terbaca: A '+p.jmlA+' soal (nomor 1–'+p.n+'), B '+p.jmlB+', C '+p.jmlC+'.'):'Belum terbaca — pastikan ada bagian "A" lalu baris seperti "1 B".';
  }
});
sec.addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b) return;
  if(b.id==='kkSalinPrompt'){
    var tx=promptMaster();
    salin(tx).then(function(ok){ if(ok) toast('Prompt master tersalin. Tempel ke AI bersama soalnya.'); else alertDialog('Salin otomatis gagal. Prompt master:\n\n'+tx); });
    return;
  }
  if(b.id==='kkTempel'){ K.panel=K.panel==='tempel'?'':'tempel'; render(); return; }
  if(b.id==='kkAtur'){ getKunci(true); K.panel=K.panel==='atur'?'':'atur'; render(); return; }
  if(b.id==='kkBatal'||b.id==='kkTutup'){ K.panel=''; render(); return; }
  if(b.id==='kkTerapkan'){
    var p=parseKunci(($('kkTa')||{}).value);
    if(!p) return alertDialog('Kunci belum terbaca. Pastikan hasil AI memuat bagian "A" dengan baris seperti "1 B".');
    var kd=getKunci(false);
    var lanjut=function(){
      var d=getKunci(true); d.n=p.n; d.a=p.a; d.b=p.b; d.c=p.c; simpan(); K.panel=''; K.siswaId=''; K.pos=0; UNDO=[]; render();
      toast('Kunci tersimpan: A '+p.jmlA+' soal.');
    };
    if(kd && /[A-D*]/.test(kd.a)) confirmDialog('Kunci yang sudah ada akan diganti. Lanjutkan?',{confirmLabel:'Ganti'}).then(function(ya){ if(ya) lanjut(); });
    else lanjut();
    return;
  }
  if(b.id==='kkSimpanBC'){
    var d2=getKunci(true); d2.b=($('kkB')||{}).value.trim(); d2.c=($('kkC')||{}).value.trim(); simpan(); render(); toast('Kunci B & C tersimpan.'); return;
  }
  if(b.id==='kkLewati'){
    var kd3=getKunci(false), s3=siswaAktif();
    if(kd3&&s3&&K.pos<kd3.n){
      var jw=jawabSiswa(s3.id,kd3.n);
      pushUndo(snapA(s3,jw));
      if(getWaktu()[s3.id]) catatWaktu(s3.id,false);
      getJawab()[s3.id]=jw.slice(0,K.pos)+'-'+jw.slice(K.pos+1);
      K.pos++; simpan(); segarkan();
    }
    return;
  }
  if(b.id==='kkMundur'){ mundur(); return; }
  if(b.id==='kkNext'){ berikutnya(); return; }
  if(b.id==='kkNextBag'){ berikutnyaBag(); return; }
  if(b.id==='kkUndo'){ undo(); return; }
  if(b.id==='kkBSemua'){ isiKosongB(); return; }
  if(b.id==='kkUlang'){ K.pos=0; segarkan(); return; }
  if(b.id==='kkKirim'){ kirimKeUts(); return; }
  if(b.hasAttribute('data-kk-siswa')){ pilihSiswa(b.getAttribute('data-kk-siswa')); return; }
  if(b.hasAttribute('data-kk-j')){ jawab(b.getAttribute('data-kk-j')); return; }
  if(b.hasAttribute('data-kk-pos')){ K.pos=+b.getAttribute('data-kk-pos'); panelKoreksi(); return; }
  if(b.hasAttribute('data-kk-bag')){ K.bag=b.getAttribute('data-kk-bag'); panelKoreksi(); daftarSiswa(); return; }
  if(b.hasAttribute('data-kk-b')){ beriSkor('B',b.getAttribute('data-kk-b')); return; }
  if(b.hasAttribute('data-kk-c')){ beriSkor('C',b.getAttribute('data-kk-c')); return; }
  if(b.hasAttribute('data-kk-nav')){ sebelah(parseInt(b.getAttribute('data-kk-nav'),10)||1); return; }
});
document.addEventListener('keydown',function(e){
  if(!sec.classList.contains('active')||e.ctrlKey||e.metaKey||e.altKey||e.isComposing) return;
  var t=e.target, tag=t&&t.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable)) return;
  if(document.querySelector('#modalOverlay.show')) return;
  var kd=getKunci(false); if(!kd||!siswaAktif()) return;
  var k=e.key, m={q:'A',w:'B',e:'C',r:'D'}, lk=k.length===1?k.toLowerCase():k;
  /* tab B & C: huruf dimatikan agar tidak salah ketik. Angka mengisi soal kosong pertama,
     Backspace = urungkan, Enter = siswa berikutnya yang belum selesai di bagian ini. */
  if(K.bag!=='A'){
    if(k==='Enter'){ e.preventDefault(); berikutnyaBag(); return; }
    if(k==='Backspace'){ e.preventDefault(); undo(); return; }
    if(/^[0-9]$/.test(k)){
      var maks=(K.bag==='B')?BOBOT_B:4;
      if(+k>maks) return;
      var n=nBag(kd,K.bag), sa=siswaAktif(); if(!n) return;
      var kosong=skorStr(K.bag,sa.id,n).indexOf('-');
      if(kosong>=0){ e.preventDefault(); beriSkor(K.bag,kosong+':'+k); }
    }
    return;
  }
  if(m[lk]){ e.preventDefault(); jawab(m[lk]); }
  else if(k===' '){ e.preventDefault(); var b=$('kkLewati'); if(b) b.click(); }
  else if(k==='Backspace'){ e.preventDefault(); mundur(); }
  else if(k==='ArrowLeft'){ e.preventDefault(); if(K.pos>0){ K.pos--; panelKoreksi(); } }
  else if(k==='ArrowRight'){ e.preventDefault(); if(K.pos<kd.n){ K.pos++; panelKoreksi(); } }
  else if(k==='Enter'){ e.preventDefault(); berikutnya(); }
});

/* ---------- Penghitung waktu berjalan ---------- */
setInterval(function(){
  var el=$('kkTimer'), kd=getKunci(false), s=siswaAktif();
  if(!el||!kd||!s||!sec.classList.contains('active')) return;
  var done=hitung(kd,jawabSiswa(s.id,kd.n)).terisi>=kd.n, dt=detikWaktu(s.id,done);
  if(dt!=null) el.textContent=fmtWaktu(dt);
},1000);

/* ---------- Kaitkan ke navigasi ---------- */
var asli=window.gotoPage;
window.gotoPage=function(p){ asli(p); if(p==='koreksi'){ try{ render(); }catch(err){ console.error(err); $('kkBody').innerHTML='<div class="card"><div class="empty-note">Gagal memuat Koreksi Soal: '+esc(err.message)+'</div></div>'; } } };
})();
