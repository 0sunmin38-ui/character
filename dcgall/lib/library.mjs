// 내 서재 — 북마크한 글만. 수집 데이터가 아니라 아카이브에서 읽으므로
// 원문이 지워져도 그대로 남는다.
import fs from 'node:fs';
import path from 'node:path';
import { Store } from './store.mjs';
import { Labels } from './labels.mjs';
import { Archive } from './archive.mjs';
import { Bookmarks } from './bookmarks.mjs';
import { compile, classify } from './classify.mjs';
import { Glossary } from './glossary.mjs';
import { CSS } from './render.mjs';
import { gnbHtml } from './nav.mjs';

export function buildLibrary(ROOT, opts = {}) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  const taxRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'taxonomy.json'), 'utf8'));
  const glos = new Glossary(ROOT);
  const tax = compile(taxRaw, glos);
  const galleryId = opts.gallery || cfg.gallery.id;
  const server = !!opts.server;
  const imgBase = opts.imgBase || (server ? '/archive/' : `../data/${galleryId}/archive/`);

  const store = new Store(ROOT, galleryId);
  const labels = new Labels(ROOT, galleryId);
  const arc = new Archive(ROOT, galleryId);
  const bmk = new Bookmarks(ROOT, galleryId);
  const crawled = store.load();

  const items = bmk.list().map((b) => {
    const snap = arc.load(b.no);
    const base = crawled.get(b.no) || {};
    // 분류는 아카이브 본문 기준으로 다시 매긴다 (수집 당시엔 본문이 없었을 수 있다)
    const forClass = {
      no: b.no, title: snap?.title || base.title || '', headtext: snap?.headtext || base.headtext || '',
      detail: snap ? { body_text: snap.body_text } : base.detail || null,
    };
    const auto = classify(forClass, tax);
    const man = labels.get(b.no);
    return {
      no: b.no,
      t: forClass.title, h: forClass.headtext,
      u: snap?.url || base.url || '',
      a: (snap?.author || base.author)?.nick || '',
      d: snap?.date || base.date || null,
      v: snap?.views ?? base.views ?? null,
      rc: snap?.recommend ?? base.recommend ?? null,
      cc: snap?.comment_count ?? base.comment_count ?? 0,
      c: auto.category, ml: man ? man.category : null,
      note: b.note || '', tags: b.tags || [],
      bat: b.at, arch: snap?.archived_at || null,
      gone: snap?.gone ? 1 : 0,
      has: snap ? 1 : 0,
      b: snap?.body_text || base.detail?.body_text || null,
      img: (snap?.local_images || []).filter((i) => i.file).map((i) => imgBase + b.no + '/' + i.file),
      imgMiss: (snap?.local_images || []).filter((i) => !i.file).length,
      cm: (snap?.comments || []).filter((c) => c.text).slice(0, 300)
            .map((c) => ({ n: c.nick, x: c.text, dp: c.depth, dt: c.date })),
    };
  }).sort((a, b) => String(b.bat).localeCompare(String(a.bat)));

  const cats = [...taxRaw.categories.map((c) => ({ key: c.key, label: c.label, emoji: c.emoji || '', desc: c.desc || '' })),
                { key: 'etc', label: '기타', emoji: '·', desc: '분류되지 않음' }];
  const { bytes, files } = arc.size();
  const meta = {
    gallery: cfg.gallery, builtAt: new Date().toISOString(), server,
    count: items.length, gone: items.filter((i) => i.gone).length,
    notArchived: items.filter((i) => !i.has).length,
    archiveFiles: files, archiveBytes: bytes,
  };
  const payload = JSON.stringify({ meta, cats, items }).replace(/<\/script/gi, '<\\/script');

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>내 서재 · ${cfg.gallery.id}</title>
<style>
${CSS}
</style></head><body>
<header class="hdr">
  ${gnbHtml('library', server,
    '<span class="stat" id="storage"></span>' +
    '<button class="ctl" id="export" title="내가 고친 분류를 labels.json 으로 내려받아요"><span class="e">↓</span><span class="t">분류 내보내기</span></button>')}
  <div class="hdr-tools">
  <div class="hdr-row search-row">
    <label class="search"><span class="ico">⌕</span>
      <input type="search" id="q" placeholder="서재 안에서 검색 (제목 · 본문 · 댓글 · 메모)"></label>
    <div class="filters">
    <select class="ctl" id="sort">
      <option value="bat">담은 순</option><option value="d">글 작성순</option>
      <option value="rc">추천순</option><option value="cc">댓글순</option>
    </select>
    </div>
  </div>

  <div class="hdr-row tight cat-row">
    <span class="vlabel">분류</span>
    <button class="arrow" id="catPrev" aria-label="왼쪽">‹</button>
    <div class="scrollrow" id="catWrap"><div class="cats" id="cats"></div></div>
    <button class="arrow" id="catNext" aria-label="오른쪽">›</button>
  </div>

  <div class="hdr-row tight cat-row" id="tagRow">
    <span class="vlabel">태그</span>
    <button class="arrow" id="tagPrev" aria-label="왼쪽">‹</button>
    <div class="scrollrow" id="tagWrap"><div class="cats" id="tags"></div></div>
    <button class="arrow" id="tagNext" aria-label="오른쪽">›</button>
  </div>
  </div>
<div id="selbar">
    <span class="selcount"><span class="n" id="selN">0</span><span class="t2">건 선택</span></span>
    <button id="selAll" title="지금 보이는 글 전체 선택"><span class="t">전체선택</span></button>
    <button id="selNone" title="선택 모두 해제"><span class="t">선택해제</span></button>
    <span class="divider">|</span>
    <input id="selTag" placeholder="태그 입력 후 Enter">
    <select id="selCat"><option value="">분류…</option></select>
    <button id="selRm" title="선택한 글을 서재에서 빼요"><span class="t">빼기</span></button>
  </div>
</header>

<main id="list"></main>
<div id="toast"></div>
<script type="application/json" id="data">${payload}</script>
<script>
${APP}
</script></body></html>`;
}

const APP = String.raw`
var D = JSON.parse(document.getElementById('data').textContent);
var meta = D.meta, cats = D.cats, items = D.items;
var CAT = {}; cats.forEach(function(c){ CAT[c.key]=c });
var esc = function(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] }); };
var pad = function(n){ return String(n).padStart(2,'0') };
var fmtD = function(s){ if(!s) return ''; var d=new Date(s);
  return pad(d.getFullYear()%100)+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes()); };
var hl = function(s,q){ var e=esc(s); if(!q) return e;
  return e.replace(new RegExp(q.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&'),'gi'), function(m){return '<mark>'+m+'</mark>'}); };
var fin = function(p){ return p.ml || p.c; };
var mb = function(b){ return (b/1048576).toFixed(1)+'MB' };

document.getElementById('h1').textContent = '갤수집기';
document.getElementById('sub').textContent =
  meta.gallery.name + ' · 보관 ' + meta.count + '건 · 원문 삭제 ' + meta.gone + '건'
  + (meta.notArchived ? ' · 아직 보존 안 한 글 ' + meta.notArchived + '건' : '')
  + (meta.server ? '' : ' · 정적 모드 (편집할 수 없어요)');
document.getElementById('storage').textContent = '보존 ' + meta.archiveFiles + '개 파일 · ' + mb(meta.archiveBytes);

var S = {q:'', sort:'bat', cat:'', tag:'', flag:''};

var toast = function(msg, bad){ var t=document.getElementById('toast');
  t.textContent=msg; t.style.borderLeftColor = bad?'var(--warn)':'var(--ok)';
  t.classList.add('show'); clearTimeout(toast._h); toast._h=setTimeout(function(){t.classList.remove('show')},1800); };

function save(no, patch, msg){
  if (!meta.server) { toast('서버 모드에서만 편집할 수 있어요. node dcgall/serve.mjs 로 실행해 주세요.', true); return; }
  var body = {no:no}; for (var k in patch) body[k]=patch[k];
  fetch('/api/bookmark', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)})
    .then(function(r){ return r.json() })
    .then(function(j){ if(j.error) throw new Error(j.error); if(msg) toast(msg); })
    .catch(function(e){ toast('저장하지 못했어요: '+e.message, true) });
}

/* ---------- 다중 선택 ---------- */
var SEL = new Set(), lastIdx = null, visible = [];
function syncSel(){
  document.getElementById('selN').textContent = SEL.size;
  document.getElementById('selbar').classList.toggle('show', SEL.size>0);
}
function toggleSel(no,on){
  if(on) SEL.add(no); else SEL.delete(no);
  var cb=document.querySelector('.sel[data-no="'+no+'"]');
  if(cb) cb.closest('.card').classList.toggle('picked',on);
  syncSel();
}
function selected(){ return Array.from(SEL); }

function match(p){
  if (S.cat && fin(p) !== S.cat) return false;
  if (S.tag && p.tags.indexOf(S.tag) < 0) return false;
  if (S.flag === 'gone' && !p.gone) return false;
  if (!S.q) return true;
  var q = S.q.toLowerCase();
  return (p.t||'').toLowerCase().indexOf(q)>=0 || (p.b||'').toLowerCase().indexOf(q)>=0
      || (p.note||'').toLowerCase().indexOf(q)>=0 || p.tags.join(' ').toLowerCase().indexOf(q)>=0
      || p.cm.some(function(c){ return (c.x||'').toLowerCase().indexOf(q)>=0 });
}

function renderChips(){
  var cc = {}; items.forEach(function(p){ var k=fin(p); cc[k]=(cc[k]||0)+1 });
  var h = '<span class="cat'+(S.cat===''?' on':'')+'" data-cat="">전체<span class="n">'+items.length+'</span></span>';
  cats.forEach(function(c){
    if (!cc[c.key]) return;
    h += '<span class="cat'+(S.cat===c.key?' on':'')+'" data-cat="'+c.key+'" title="'+esc(c.desc)+'">'
       + esc(c.label)+'<span class="n">'+cc[c.key]+'</span></span>';
  });
  document.getElementById('cats').innerHTML = h;

  var tc = {}; items.forEach(function(p){ p.tags.forEach(function(t){ tc[t]=(tc[t]||0)+1 }) });
  var keys = Object.keys(tc).sort();
  document.getElementById('tagRow').style.display = keys.length ? '' : 'none';
  document.getElementById('tags').innerHTML = keys.map(function(t){
    return '<span class="cat'+(S.tag===t?' on':'')+'" data-tag="'+esc(t)+'">'+esc(t)+'<span class="n">'+tc[t]+'</span></span>' }).join('');
  if (typeof updCats === 'function') requestAnimationFrame(function(){ updCats(); updTags(); });
}

function card(p){
  var cm = p.cm.map(function(c){
    return '<div class="cmt'+(c.dp?' re':'')+'"><span class="n">'+esc(c.n)+'</span>'+hl(c.x,S.q)+'</div>' }).join('');
  var opts = cats.map(function(c){
    return '<option value="'+c.key+'"'+(c.key===fin(p)?' selected':'')+'>'+esc(c.label)+'</option>' }).join('');
  return '<article class="card'+(p.gone?' gone':'')+(SEL.has(p.no)?' picked':'')+'" data-no="'+p.no+'">'
    + '<div class="row r1">'
      + '<input type="checkbox" class="sel" data-no="'+p.no+'"'+(SEL.has(p.no)?' checked':'')+'>'
      + '<span class="ttl" title="'+esc(p.t)+'">'+hl(p.t,S.q)+'</span>'
      + (p.gone ? '<span class="gonebadge">원문 삭제됨</span>'
                : '<a class="go" href="'+esc(p.u)+'" target="_blank" rel="noopener" title="디시 원문으로 이동해요">원문 ↗</a>')
    + '</div>'
    + '<div class="row r2">'
      + '<select class="pick" data-no="'+p.no+'">'+opts+'</select>'
      + (p.h ? '<span class="chip">'+esc(p.h)+'</span>' : '')
      + '<span class="metrics date" title="작성 시각">'+fmtD(p.d)+'</span>'
      + '<span class="metrics kept" title="서재에 담은 시각">담음 '+fmtD(p.bat)+'</span>'
      + '<span class="metrics nums">'
        + '<span class="m-rec">추천 '+(p.rc==null?'-':p.rc)+'</span>'
        + '<span class="m-cmt"> · 댓글 '+(p.cc||0)+'</span>'
      + '</span>'
    + '</div>'
    + '<div class="tagbar">' + p.tags.map(function(t){
        return '<span class="tag" data-del="'+esc(t)+'">'+esc(t)+'<span class="x">×</span></span>' }).join('')
      + '<input class="tagin" placeholder="+ 태그" data-no="'+p.no+'"></div>'
    + '<textarea class="note" placeholder="이 글을 왜 담아뒀는지 적어두세요" data-no="'+p.no+'">'+esc(p.note)+'</textarea>'
    + '<div class="body">'
      + (p.b ? '<div class="txt">'+hl(p.b,S.q)+'</div>'
             : '<div class="metrics">본문을 아직 보존하지 않았어요. node dcgall/archive.mjs --sync 를 실행해 주세요.</div>')
      + (p.img.length ? '<div class="imgs">'+p.img.map(function(s){
            return '<img loading="lazy" src="'+esc(s)+'" alt="">' }).join('')+'</div>' : '')
      + (p.imgMiss ? '<div class="why">이미지 '+p.imgMiss+'개는 받지 못했어요.</div>' : '')
      + (cm ? '<div class="cmts">'+cm+'</div>' : '')
    + '</div></article>';
}

function render(){
  var rows = items.filter(match).sort(function(a,b){
    return S.sort==='bat' ? String(b.bat).localeCompare(String(a.bat))
         : S.sort==='d'   ? String(b.d).localeCompare(String(a.d))
         : (b[S.sort]||0)-(a[S.sort]||0) });
  visible = rows.map(function(r){ return r.no });
  document.getElementById('cnt').textContent = rows.length+'건';
  document.getElementById('list').innerHTML = rows.length ? rows.map(card).join('')
    : '<div class="empty">서재가 비어 있어요.<br>수집 페이지에서 글을 골라 <b>서재에 담기</b> 하면 본문·댓글·이미지를 통째로 보존해요.</div>';
  syncSel();
}

function wireScroll(wrapId, railId, prevId, nextId){
  var wrap=document.getElementById(wrapId), rail=document.getElementById(railId);
  var prev=document.getElementById(prevId), next=document.getElementById(nextId);
  if(!wrap||!rail) return function(){};
  function upd(){
    var over = rail.scrollWidth - rail.clientWidth, can = over > 4;
    prev.classList.toggle('show',can); next.classList.toggle('show',can);
    wrap.classList.toggle('l', can && rail.scrollLeft>2);
    wrap.classList.toggle('r', can && rail.scrollLeft < over-2);
  }
  rail.addEventListener('scroll',upd); window.addEventListener('resize',upd);
  prev.addEventListener('click',function(){ rail.scrollBy({left:-rail.clientWidth*0.7,behavior:'smooth'}) });
  next.addEventListener('click',function(){ rail.scrollBy({left: rail.clientWidth*0.7,behavior:'smooth'}) });
  rail.addEventListener('wheel',function(e){
    if(Math.abs(e.deltaY)<=Math.abs(e.deltaX)) return;
    if(rail.scrollWidth<=rail.clientWidth) return;
    e.preventDefault(); rail.scrollLeft += e.deltaY; },{passive:false});
  return upd;
}
var updCats = wireScroll('catWrap','cats','catPrev','catNext');
var updTags = wireScroll('tagWrap','tags','tagPrev','tagNext');

document.getElementById('cats').addEventListener('click', function(e){
  var c=e.target.closest('.cat'); if(!c) return;
  if (c.dataset.flag !== undefined) S.flag = (S.flag===c.dataset.flag)?'':c.dataset.flag;
  else S.cat = (S.cat===c.dataset.cat)?'':c.dataset.cat;
  renderChips(); render(); });
document.getElementById('tags').addEventListener('click', function(e){
  var c=e.target.closest('.cat'); if(!c) return;
  S.tag = (S.tag===c.dataset.tag)?'':c.dataset.tag; renderChips(); render(); });
document.getElementById('export').addEventListener('click', function(){
  var out = {version:1, updated_at:new Date().toISOString(), manual:{}};
  items.forEach(function(p){ if(p.ml) out.manual[p.no] = {category:p.ml, by:'library', at:new Date().toISOString()} });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out,null,2)], {type:'application/json'}));
  a.download = 'labels.json'; a.click();
  toast('labels.json 을 내려받았어요. node dcgall/classify.mjs --import <파일> 로 반영해 주세요.');
});

document.getElementById('selAll').addEventListener('click', function(){
  visible.forEach(function(n){ SEL.add(n) }); render(); syncSel(); });
document.getElementById('selNone').addEventListener('click', function(){
  SEL.clear(); lastIdx=null; render(); syncSel(); });

document.getElementById('selTag').addEventListener('keydown', function(e){
  if (e.key !== 'Enter') return;
  var v = e.target.value.trim(); if(!v || !SEL.size) return;
  if (!meta.server) { toast('서버 모드에서만 편집할 수 있어요. node dcgall/serve.mjs 로 실행해 주세요.', true); return; }
  var nos = selected();
  fetch('/api/bookmark/tag', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({nos:nos, add:v})})
    .then(function(r){ return r.json() })
    .then(function(j){
      items.forEach(function(p){ if (SEL.has(p.no) && p.tags.indexOf(v)<0) p.tags.push(v) });
      toast(j.changed+'건에 태그 \''+v+'\' 를 추가했어요.');
      e.target.value=''; renderChips(); render();
    })
    .catch(function(err){ toast('처리하지 못했어요: '+err.message, true) });
});

document.getElementById('selCat').addEventListener('change', function(e){
  var cat=e.target.value; if(!cat) return; e.target.value='';
  if (!meta.server) { toast('서버 모드에서만 편집할 수 있어요. node dcgall/serve.mjs 로 실행해 주세요.', true); return; }
  var manual={}, now=new Date().toISOString();
  selected().forEach(function(no){ manual[no]={category:cat,by:'bulk',at:now} });
  fetch('/api/labels', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({manual:manual})})
    .then(function(){ items.forEach(function(p){ if(SEL.has(p.no)) p.ml=cat });
      toast(SEL.size+'건을 '+CAT[cat].label+' 로 바꿨어요.'); renderChips(); render(); })
    .catch(function(err){ toast('처리하지 못했어요: '+err.message, true) });
});

document.getElementById('selRm').addEventListener('click', function(){
  if (!meta.server) { toast('서버 모드에서만 편집할 수 있어요. node dcgall/serve.mjs 로 실행해 주세요.', true); return; }
  var nos = selected(); if(!nos.length) return;
  if (!confirm(nos.length+'건을 서재에서 뺄까요? 보존한 파일은 디스크에 그대로 남아 있어요.')) return;
  fetch('/api/bookmark/bulk', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({nos:nos, on:false})})
    .then(function(r){ return r.json() })
    .then(function(j){
      items = items.filter(function(p){ return !SEL.has(p.no) });
      meta.count = items.length;
      toast(j.removed+'건을 서재에서 뺐어요.'); SEL.clear(); lastIdx=null; renderChips(); render(); syncSel();
    })
    .catch(function(err){ toast('처리하지 못했어요: '+err.message, true) });
});



// 로우 어디를 눌러도 선택된다. 제목·드롭다운·태그·메모·링크만 예외.
var NOSEL = '.ttl,.pick,a,input,textarea,select,button,.tag,.body';
document.getElementById('list').addEventListener('click', function(e){
  var card = e.target.closest('.card');
  var onBox = !!e.target.closest('.sel');
  if (card && (onBox || !e.target.closest(NOSEL))) {
    var cb = card.querySelector('.sel');
    var cno = Number(cb.dataset.no), idx = visible.indexOf(cno);
    var want = onBox ? cb.checked : !SEL.has(cno);
    if (!onBox) cb.checked = want;
    if (e.shiftKey && lastIdx !== null && idx >= 0) {
      var a=Math.min(lastIdx,idx), b=Math.max(lastIdx,idx);
      for (var i=a;i<=b;i++) toggleSel(visible[i], want);
    } else toggleSel(cno, want);
    lastIdx = idx; return;
  }
  var no = Number((e.target.closest('[data-no]')||{dataset:{}}).dataset.no);
  var p = items.filter(function(x){ return x.no===no })[0];
  var del = e.target.closest('.tag[data-del]');
  if (del && p) {
    p.tags = p.tags.filter(function(t){ return t!==del.dataset.del });
    save(no, {tags:p.tags}, '태그를 지웠어요.'); renderChips(); render(); return;
  }
  var t = e.target.closest('.ttl'); if (t) t.closest('.card').classList.toggle('open');
});
document.getElementById('list').addEventListener('change', function(e){
  var no = Number(e.target.dataset.no);
  var p = items.filter(function(x){ return x.no===no })[0]; if(!p) return;
  if (e.target.classList.contains('pick')) {
    p.ml = e.target.value;
    fetch('/api/labels', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({manual:(function(){var o={};o[no]={category:e.target.value,by:'library',at:new Date().toISOString()};return o})()})})
      .then(function(){ toast(CAT[e.target.value].label+' 로 바꿨어요.'); renderChips(); render(); });
  } else if (e.target.classList.contains('note')) {
    p.note = e.target.value; save(no, {note:p.note}, '메모를 저장했어요.');
  }
});
document.getElementById('list').addEventListener('keydown', function(e){
  if (e.key!=='Enter' || !e.target.classList.contains('tagin')) return;
  e.preventDefault();
  var no = Number(e.target.dataset.no);
  var p = items.filter(function(x){ return x.no===no })[0];
  var v = e.target.value.trim(); if(!v||!p) return;
  if (p.tags.indexOf(v)<0) p.tags.push(v);
  save(no, {tags:p.tags}, '태그 \''+v+'\' 를 추가했어요.');
  e.target.value=''; renderChips(); render();
});
var deb=function(f,ms){var h;return function(){var a=arguments;clearTimeout(h);h=setTimeout(function(){f.apply(null,a)},ms)}};
document.getElementById('q').addEventListener('input', deb(function(e){ S.q=e.target.value.trim(); render() },180));
document.getElementById('sort').addEventListener('change', function(e){ S.sort=e.target.value; render() });
document.addEventListener('keydown', function(e){
  if(e.key==='/' && e.target.tagName!=='INPUT' && e.target.tagName!=='TEXTAREA'){
    e.preventDefault(); document.getElementById('q').focus(); }});

cats.forEach(function(c){
  document.getElementById('selCat').insertAdjacentHTML('beforeend',
    '<option value="'+c.key+'">'+esc(c.label)+'</option>'); });

/* 좁은 화면에서 검색·필터 영역 접기 — GNB 는 항상 보인다 */
(function(){
  var btn = document.getElementById('toolsBtn'), hdr = document.querySelector('.hdr');
  if (!btn || !hdr) return;
  btn.addEventListener('click', function(){
    var open = hdr.classList.toggle('open');
    btn.title = open ? '검색·필터 접기' : '검색·필터 펼치기';
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
})();

renderChips(); render();
`;
