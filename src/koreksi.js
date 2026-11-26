/* =========================================================================
   KOREKSI SOAL — modul tambahan (disisipkan otomatis saat build oleh
   scripts/polish.mjs, tepat sebelum </body>, setelah ui-polish.js).
   Alur: pilih Ujian + Mapel + Kelas -> pilih siswa -> ketik jawaban
   pilihan ganda (Q=A, W=B, E=C, R=D) atau tekan tombol besar A/B/C/D.
   Bagian B & C: hanya menampilkan kunci (dikoreksi manual).
   Data: DB.koreksi = { kunci:{key:{n,a,b,c}}, jawab:{key:{siswaId:"ABCD-.."}} }
   (semua nilai berupa string agar aman digabung oleh mergeDeep_ saat sinkron)
   Kunci lama di fitur Ujian (DB.kunciJawaban) TIDAK dipakai.
   ========================================================================= */
(function(){
'use strict';
if(typeof DB === 'undefined' || typeof PAGES === 'undefined' || document.getElementById('page-koreksi')) return;

var SEL_KEY = 'appRekapNilaiSekolah_v2_koreksiSel';
var K = { ujian:'', mapel:'', kelas:'', siswaId:'', pos:0, panel:'' };

/* ---------- util ---------- */
function esc(s){ return (typeof escapeHtml==='function') ? escapeHtml(s) : String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function seg(s){ return String(s==null?'':s).replace(/[.#$\[\]\/]/g,'_'); }
function toast(m){ try{ showToast(m); }catch(e){} }
function $(id){ return document.getElementById(id); }
function ensure(){
  if(!DB.koreksi || typeof DB.koreksi!=='object') DB.koreksi = {};
  if(!DB.koreksi.kunci || typeof DB.koreksi.kunci!=='object') DB.koreksi.kunci = {};
  if(!DB.koreksi.jawab || typeof DB.koreksi.jawab!=='object') DB.koreksi.jawab = {};
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
    '1 | poin kunci 1 ; poin kunci 2 ; poin kunci 3',
    '#AKHIR',
    '```',
    '',
    'ATURAN:',
    '1. Bagian A = pilihan ganda. Satu baris per nomor: "nomor spasi huruf" (huruf besar A/B/C/D saja).',
    '2. Jika sebuah soal PG ambigu, tidak punya jawaban benar, atau ada dua jawaban benar, tulis BONUS sebagai jawabannya (contoh: "7 BONUS").',
    '3. Bagian B = isian. Satu baris per nomor: "nomor | kunci" (kunci singkat, tanpa baris baru).',
    '4. Bagian C = uraian/esai. Satu baris per nomor: "nomor | poin1 ; poin2 ; poin3" (poin-poin kunci dipisah tanda titik koma, tetap dalam satu baris).',
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
'#page-koreksi .kk-hasil td,#page-koreksi .kk-hasil th{padding:6px 8px;text-align:left;border-bottom:1px solid var(--garis);}'
].join('\n');
document.head.appendChild(css);

/* ---------- Kerangka halaman ---------- */
var sec=document.createElement('section'); sec.className='page'; sec.id='page-koreksi';
sec.innerHTML=
'<div class="card"><h2>Koreksi Soal</h2>'+
'<div class="sub">Pilih ujian, mapel, kelas, lalu siswa. Bagian A diketik cepat dengan keyboard <b>Q=A, W=B, E=C, R=D</b> atau tombol besar. Bagian B &amp; C hanya menampilkan kunci.</div>'+
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
  h+='<div class="kk-info">'+(kd?('Bagian A: <b>'+kd.n+' soal</b>'+(kd.b?' · B: '+kd.b.split('\n').length:'')+(kd.c?' · C: '+kd.c.split('\n').length:'')):'Belum ada kunci untuk ujian/mapel/tingkat ini.')+'</div>';
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
       '<div class="field"><label>Kunci Bagian C</label><textarea class="kk-ta" id="kkC" style="min-height:90px;">'+esc(kd.c)+'</textarea></div></div>'+
       '<div class="btn-row"><button class="btn" id="kkSimpanBC">Simpan Kunci B &amp; C</button><button class="btn secondary" id="kkTutup">Tutup</button></div></div>';
  }
  h+='</div>';
  if(kd){
    h+='<div class="kk-grid"><div class="card"><h3 style="margin:0 0 8px;">Siswa</h3><div class="kk-siswa" id="kkSiswa"></div></div><div id="kkPanel"></div></div>';
    h+='<div id="kkRef"></div><div id="kkHasil"></div>';
  }
  box.innerHTML=h;
  if(kd){ daftarSiswa(); panelKoreksi(); referensiBC(); tabelHasil(); }
}
function daftarSiswa(){
  var kd=getKunci(false), el=$('kkSiswa'); if(!el||!kd) return;
  el.innerHTML=siswaList().map(function(s,i){
    var r=hitung(kd,jawabSiswa(s.id,kd.n)), done=r.terisi>=kd.n;
    return '<button class="kk-sw'+(s.id===K.siswaId?' aktif':'')+(done?' done':'')+'" data-kk-siswa="'+esc(s.id)+'"><span>'+(i+1)+'. '+esc(s.nama)+'</span><small>'+(r.terisi?(done?('✓ '+r.benar+'/'+kd.n):(r.terisi+'/'+kd.n)):'belum')+'</small></button>';
  }).join('');
}
function siswaAktif(){ return siswaList().find(function(s){return s.id===K.siswaId;}); }
function panelKoreksi(){
  var kd=getKunci(false), el=$('kkPanel'); if(!el||!kd) return;
  var s=siswaAktif();
  if(!s){ el.innerHTML='<div class="card"><div class="empty-note">Pilih siswa di sebelah kiri untuk mulai mengoreksi.</div></div>'; return; }
  var jw=jawabSiswa(s.id,kd.n), r=hitung(kd,jw), selesai=K.pos>=kd.n;
  var strip='';
  for(var i=0;i<kd.n;i++){
    var kc=kd.a.charAt(i), j=jw.charAt(i), cls='kk-c';
    if(j!=='-' || kc==='*'){ cls+=(kc==='*' || (kc!=='-' && j===kc))?' ok':' no'; }
    if(i===K.pos) cls+=' cur';
    strip+='<button class="'+cls+'" data-kk-pos="'+i+'" title="Soal '+(i+1)+'">'+(i+1)+(j!=='-'?j:'')+'</button>';
  }
  var h='<div class="card"><p class="kk-nama">'+esc(s.nama)+'</p>'+
    '<div class="kk-info">Benar <span class="kk-skor">'+r.benar+' / '+kd.n+'</span> · Nilai A: <span class="kk-skor">'+nilaiA(r.benar,kd.n)+'</span> (maks '+maksBagian()+')</div>';
  if(selesai){
    h+='<div class="kk-no" style="font-size:34px;">Selesai ✓</div><div class="btn-row"><button class="btn" id="kkNext">Siswa berikutnya (Enter)</button><button class="btn secondary" id="kkUlang">Ulangi dari soal 1</button></div>';
  } else {
    h+='<div class="kk-no">Soal '+(K.pos+1)+' <small>dari '+kd.n+'</small></div>'+
      '<div class="kk-abcd"><button data-kk-j="A">A<small>Q</small></button><button data-kk-j="B">B<small>W</small></button><button data-kk-j="C">C<small>E</small></button><button data-kk-j="D">D<small>R</small></button></div>'+
      '<div class="btn-row"><button class="btn secondary" id="kkLewati">Kosong / lewati (Spasi)</button><button class="btn secondary" id="kkMundur">⌫ Mundur &amp; hapus</button></div>';
  }
  h+='<div class="kk-strip">'+strip+'</div><div class="kk-info">Keyboard: Q W E R = A B C D · Spasi = kosong · Backspace = mundur · ← → pindah soal · Enter = siswa berikutnya</div>';
  if(kd.a.indexOf('-')>=0) h+='<div class="kk-warn">⚠ Ada soal yang kuncinya belum terisi (tanda –). Soal itu dianggap salah untuk semua siswa sampai kuncinya diisi.</div>';
  h+='</div>';
  el.innerHTML=h;
}
function referensiBC(){
  var kd=getKunci(false), el=$('kkRef'); if(!el||!kd) return;
  var h='';
  if(kd.b) h+='<div class="card"><h3 style="margin:0 0 6px;">Kunci Bagian B (isian)</h3><div class="kk-kunci">'+esc(kd.b)+'</div></div>';
  if(kd.c) h+='<div class="card"><h3 style="margin:0 0 6px;">Kunci Bagian C (uraian)</h3><div class="kk-kunci">'+esc(kd.c)+'</div></div>';
  el.innerHTML=h;
}
function tabelHasil(){
  var kd=getKunci(false), el=$('kkHasil'); if(!el||!kd) return;
  var rows=siswaList().map(function(s,i){
    var r=hitung(kd,jawabSiswa(s.id,kd.n));
    return '<tr><td>'+(i+1)+'</td><td>'+esc(s.nama)+'</td><td>'+(r.terisi?r.benar+' / '+kd.n:'–')+'</td><td>'+(r.terisi?nilaiA(r.benar,kd.n):'–')+'</td></tr>';
  }).join('');
  el.innerHTML='<div class="card kk-hasil"><h3 style="margin:0 0 6px;">Hasil Bagian A</h3><div class="table-wrap"><table><thead><tr><th>No</th><th>Nama</th><th>Benar</th><th>Nilai A</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="btn-row" style="margin-top:10px;"><button class="btn" id="kkKirim">Terapkan Nilai A ke menu Nilai UTS/STS</button></div>'+
    '<div class="kk-info">Hanya siswa yang sudah ada jawabannya yang dikirim. Nilai B &amp; C tetap Anda isi sendiri di menu UTS/STS.</div></div>';
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
  getJawab()[s.id]=jw.slice(0,K.pos)+huruf+jw.slice(K.pos+1);
  K.pos++; simpan(); segarkan();
}
function mundur(){
  var kd=getKunci(false), s=siswaAktif(); if(!kd||!s||K.pos<=0) return;
  K.pos--; var jw=jawabSiswa(s.id,kd.n);
  getJawab()[s.id]=jw.slice(0,K.pos)+'-'+jw.slice(K.pos+1);
  simpan(); segarkan();
}
function berikutnya(){
  var kd=getKunci(false), list=siswaList(); if(!kd||!list.length) return;
  var idx=list.findIndex(function(s){return s.id===K.siswaId;}), n=list.length;
  for(var step=1; step<=n; step++){
    var s=list[(idx+step)%n];
    if(hitung(kd,jawabSiswa(s.id,kd.n)).terisi<kd.n){ pilihSiswa(s.id); return; }
  }
  toast('Semua siswa sudah selesai dikoreksi.');
}
function kirimKeUts(){
  var kd=getKunci(false); if(!kd) return;
  var d; try{ d=getUtsData(K.mapel,K.kelas); }catch(e){ return alertDialog('Data UTS/STS belum bisa dibuka.'); }
  var daftar=[];
  siswaList().forEach(function(s){
    var r=hitung(kd,jawabSiswa(s.id,kd.n)); if(!r.terisi) return;
    var row=d.siswa.find(function(x){return x.id && x.id===s.id;}) || d.siswa.find(function(x){return x.nama===s.nama;});
    if(row) daftar.push({row:row, v:nilaiA(r.benar,kd.n)});
  });
  if(!daftar.length) return alertDialog('Belum ada jawaban siswa yang bisa dikirim.');
  confirmDialog('Isi nilai A untuk '+daftar.length+' siswa pada ujian "'+namaUjian()+'" ('+K.mapel+', kelas '+(kelasObj()||{}).nama+')? Nilai A yang sudah ada akan diganti.',{confirmLabel:'Terapkan'}).then(function(ya){
    if(!ya) return;
    daftar.forEach(function(x){ x.row.a=x.v; });
    simpan(); toast('Nilai A terkirim ke menu Nilai UTS/STS ('+daftar.length+' siswa).');
  });
}

/* ---------- Event ---------- */
sec.addEventListener('change',function(e){
  var t=e.target;
  if(t.id==='kkMapel'||t.id==='kkKelas'){
    K.mapel=$('kkMapel').value; K.kelas=$('kkKelas').value; K.siswaId=''; K.pos=0;
    lsSet_(SEL_KEY,JSON.stringify({mapel:K.mapel,kelas:K.kelas})); render(); return;
  }
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
      var d=getKunci(true); d.n=p.n; d.a=p.a; d.b=p.b; d.c=p.c; simpan(); K.panel=''; K.siswaId=''; K.pos=0; render();
      toast('Kunci tersimpan: A '+p.jmlA+' soal.');
    };
    if(kd && /[A-D*]/.test(kd.a)) confirmDialog('Kunci yang sudah ada akan diganti. Lanjutkan?',{confirmLabel:'Ganti'}).then(function(ya){ if(ya) lanjut(); });
    else lanjut();
    return;
  }
  if(b.id==='kkSimpanBC'){
    var d2=getKunci(true); d2.b=($('kkB')||{}).value.trim(); d2.c=($('kkC')||{}).value.trim(); simpan(); render(); toast('Kunci B & C tersimpan.'); return;
  }
  if(b.id==='kkLewati'){ var kd3=getKunci(false),s3=siswaAktif(); if(kd3&&s3&&K.pos<kd3.n){ var jw=jawabSiswa(s3.id,kd3.n); getJawab()[s3.id]=jw.slice(0,K.pos)+'-'+jw.slice(K.pos+1); K.pos++; simpan(); segarkan(); } return; }
  if(b.id==='kkMundur'){ mundur(); return; }
  if(b.id==='kkNext'){ berikutnya(); return; }
  if(b.id==='kkUlang'){ K.pos=0; segarkan(); return; }
  if(b.id==='kkKirim'){ kirimKeUts(); return; }
  if(b.hasAttribute('data-kk-siswa')){ pilihSiswa(b.getAttribute('data-kk-siswa')); return; }
  if(b.hasAttribute('data-kk-j')){ jawab(b.getAttribute('data-kk-j')); return; }
  if(b.hasAttribute('data-kk-pos')){ K.pos=+b.getAttribute('data-kk-pos'); panelKoreksi(); return; }
});
document.addEventListener('keydown',function(e){
  if(!sec.classList.contains('active')||e.ctrlKey||e.metaKey||e.altKey||e.isComposing) return;
  var t=e.target, tag=t&&t.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable)) return;
  if(document.querySelector('#modalOverlay.show')) return;
  var kd=getKunci(false); if(!kd||!siswaAktif()) return;
  var k=e.key, m={q:'A',w:'B',e:'C',r:'D'}, lk=k.length===1?k.toLowerCase():k;
  if(m[lk]){ e.preventDefault(); jawab(m[lk]); }
  else if(k===' '){ e.preventDefault(); var b=$('kkLewati'); if(b) b.click(); }
  else if(k==='Backspace'){ e.preventDefault(); mundur(); }
  else if(k==='ArrowLeft'){ e.preventDefault(); if(K.pos>0){ K.pos--; panelKoreksi(); } }
  else if(k==='ArrowRight'){ e.preventDefault(); if(K.pos<kd.n){ K.pos++; panelKoreksi(); } }
  else if(k==='Enter'){ e.preventDefault(); berikutnya(); }
});

/* ---------- Kaitkan ke navigasi ---------- */
var asli=window.gotoPage;
window.gotoPage=function(p){ asli(p); if(p==='koreksi'){ try{ render(); }catch(err){ console.error(err); $('kkBody').innerHTML='<div class="card"><div class="empty-note">Gagal memuat Koreksi Soal: '+esc(err.message)+'</div></div>'; } } };
})();
