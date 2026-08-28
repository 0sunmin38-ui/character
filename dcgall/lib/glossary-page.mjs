// 은어 사전 — 독립 페이지. 수집 목록은 싣지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { confFile } from './paths.mjs';
import { Glossary } from './glossary.mjs';
import { CSS } from './render.mjs';
import { gnbHtml } from './nav.mjs';

export function buildGlossaryPage(ROOT, opts = {}) {
  const cfg = JSON.parse(fs.readFileSync(confFile(ROOT, 'config.json'), 'utf8'));
  const server = !!opts.server;
  const glos = new Glossary(ROOT);
  const g = glos.data;

  const gl = {
    types: g.types, concepts: g.concepts, terms: g.terms,
    patterns: (g.patterns || []).map((p) => ({ key: p.key, canon: p.canon, gloss: p.gloss })),
    stopwords: (g.stopwords || []).length,
    candidates: Object.entries(g.candidates || {})
      .filter(([, v]) => v.status !== 'rejected')
      .sort((a, b) => (b[1].score || 0) - (a[1].score || 0)).slice(0, 150)
      .map(([w, v]) => ({ w, n: v.count, g: v.guess_type || null, gf: v.guess_from || null,
                          ex: (v.examples || []).slice(0, 2), ctx: (v.context || []).slice(0, 4) })),
  };
  const meta = { gallery: cfg.gallery, server, builtAt: new Date().toISOString() };
  const payload = JSON.stringify({ meta, gl }).replace(/<\/script/gi, '<\\/script');

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>은어 사전 · ${cfg.gallery.id}</title>
<style>
${CSS}
</style></head><body>
<header class="hdr">
  ${gnbHtml('glossary', server,
    '<span class="stat" id="stat"></span>' +
    '<button class="ctl primary" id="mineBtn" title="저장된 글에서 새 은어 후보를 찾아요"><span class="e">⟳</span><span class="t">지금 채굴</span></button>')}
  <div class="hdr-tools">
    <div class="hdr-row search-row">
      <label class="search"><span class="ico">⌕</span>
        <input type="search" id="q" placeholder="용어 · 뜻 · 후보 검색"></label>
    </div>
    <div class="hdr-row tight cat-row">
      <span class="vlabel">보기</span>
      <button class="arrow" id="catPrev" aria-label="왼쪽">‹</button>
      <div class="scrollrow" id="catWrap"><div class="cats" id="cats"></div></div>
      <button class="arrow" id="catNext" aria-label="오른쪽">›</button>
      <span class="count" id="cnt"></span>
    </div>
  </div>
</header>
<main id="main"></main>
<div id="toast"></div>
<script type="application/json" id="data">${payload}</script>
<script>
${APP}
</script></body></html>`;
}

const APP = String.raw`
var D = JSON.parse(document.getElementById('data').textContent);
var meta = D.meta, GL = D.gl;
var esc = function(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] }); };
var toast = function(msg, bad){ var t=document.getElementById('toast');
  t.textContent=msg; t.style.borderLeftColor = bad?'var(--warn)':'var(--ok)';
  t.classList.add('show'); clearTimeout(toast._h); toast._h=setTimeout(function(){t.classList.remove('show')},1900); };

var S = { q:'', view:'cand' };

document.getElementById('sub').textContent =
  meta.gallery.name + ' · 확정 ' + Object.keys(GL.terms).length + '개 · 후보 ' + GL.candidates.length + '개'
  + (meta.server ? '' : ' · 정적 모드 (편집할 수 없어요)');
document.getElementById('stat').textContent = '기각 ' + GL.stopwords + '개';

function wireScroll(wrapId, railId, prevId, nextId){
  var wrap=document.getElementById(wrapId), rail=document.getElementById(railId);
  var prev=document.getElementById(prevId), next=document.getElementById(nextId);
  if(!wrap||!rail) return function(){};
  function upd(){ var over=rail.scrollWidth-rail.clientWidth, can=over>4;
    prev.classList.toggle('show',can); next.classList.toggle('show',can);
    wrap.classList.toggle('l', can && rail.scrollLeft>2);
    wrap.classList.toggle('r', can && rail.scrollLeft<over-2); }
  rail.addEventListener('scroll',upd); window.addEventListener('resize',upd);
  prev.addEventListener('click',function(){ rail.scrollBy({left:-rail.clientWidth*0.7,behavior:'smooth'}) });
  next.addEventListener('click',function(){ rail.scrollBy({left: rail.clientWidth*0.7,behavior:'smooth'}) });
  return upd;
}
var updCats = wireScroll('catWrap','cats','catPrev','catNext');

var VIEWS = [
  {key:'cand', label:'미확인 후보'},
  {key:'terms', label:'확정 용어'},
  {key:'concepts', label:'개념 묶음'},
  {key:'patterns', label:'조어 규칙'},
];

function renderTabs(){
  var n = {cand:GL.candidates.length, terms:Object.keys(GL.terms).length,
           concepts:Object.keys(GL.concepts).length, patterns:GL.patterns.length};
  document.getElementById('cats').innerHTML = VIEWS.map(function(v){
    return '<span class="cat'+(S.view===v.key?' on':'')+'" data-view="'+v.key+'">'
      + v.label+'<span class="n">'+n[v.key]+'</span></span>' }).join('');
  requestAnimationFrame(updCats);
}

function hit(s){ return !S.q || String(s||'').toLowerCase().indexOf(S.q.toLowerCase())>=0 }

function render(){
  var h='', shown=0;
  if (S.view === 'cand') {
    var list = GL.candidates.filter(function(c){ return hit(c.w)||hit((c.ex||[]).join(' ')) });
    shown = list.length;
    h += '<div class="glbox"><p class="d">채굴기가 찾아낸, 아직 뜻을 달지 않은 말이에요. '
       + '확정하면 분류에 바로 반영되고, 기각하면 다시 후보에 오르지 않아요.</p>';
    h += list.slice(0,80).map(function(c){
      var opts = Object.keys(GL.types).map(function(k){
        return '<option value="'+k+'"'+(c.g===k?' selected':'')+'>'+esc(GL.types[k])+'</option>' }).join('');
      return '<div class="cand" data-w="'+esc(c.w)+'">'
        + '<span class="word">'+esc(c.w)+' <span class="g">'+c.n+'</span></span>'
        + '<span class="meta" title="'+esc((c.ex||[]).join(' / '))+'">'+esc(c.ex[0]||c.ctx.join(', ')||'')
        + (c.g?' · 추정 '+esc(GL.types[c.g]||c.g):'')+'</span>'
        + '<span class="act"><select class="ct">'+opts+'</select>'
        + '<input class="cg" placeholder="뜻"><button class="ok">확정</button><button class="no">기각</button></span></div>';
    }).join('') || '<div class="empty">후보가 없어요. <b>지금 채굴</b> 을 눌러보세요.</div>';
    h += '</div>';
  } else if (S.view === 'terms') {
    var byType = {};
    Object.keys(GL.terms).forEach(function(t){ var v=GL.terms[t];
      if(!hit(t)&&!hit(v.canon)&&!hit(v.gloss)) return;
      (byType[v.type]=byType[v.type]||[]).push([t,v]); });
    Object.keys(byType).forEach(function(ty){
      shown += byType[ty].length;
      h += '<div class="glbox"><h3>'+esc(GL.types[ty]||ty)+' <span class="g">'+byType[ty].length+'</span></h3><div class="glgrid">'
        + byType[ty].sort(function(a,b){return a[0].localeCompare(b[0],'ko')}).map(function(kv){
            var t=kv[0], v=kv[1];
            // 표제어와 같은 말을 한 번 더 쓰지 않는다
            var head = (v.canon && v.canon !== t) ? esc(v.canon) : '';
            var desc = [head, v.gloss ? esc(v.gloss) : ''].filter(Boolean).join('. ');
            return '<div class="gterm"><b>'+esc(t)+'</b>'+(v.confirmed?'':' <span class="g">확인 대기</span>')
              +(desc?'<br><span class="g">'+desc+'</span>':'')
              +((v.aliases&&v.aliases.length)?'<br><span class="g">같은 말 '+esc(v.aliases.join(', '))+'</span>':'')
              +'</div>' }).join('')
        + '</div></div>';
    });
    if(!shown) h='<div class="empty">찾는 용어가 없어요.</div>';
  } else if (S.view === 'concepts') {
    h += '<div class="glbox"><p class="d">플랫폼마다 이름만 다른 같은 개념이에요. '
       + '분류 규칙은 낱말이 아니라 이 묶음을 참조하므로, 여기에 표면형을 늘리면 분류가 같이 좋아져요.</p><div class="glgrid">';
    Object.keys(GL.concepts).forEach(function(k){
      var c=GL.concepts[k];
      var mem=Object.keys(GL.terms).filter(function(t){ return GL.terms[t].concept===k });
      if(!hit(c.label)&&!hit(mem.join(' '))) return;
      shown++;
      h += '<div class="gterm"><b>'+esc(c.label)+'</b> <span class="g">'+esc(k)+'</span>'
        + '<br><span class="g">'+esc(c.desc||'')+'</span>'
        + '<br><span class="g">표면형 · '+esc(mem.join(', ')||'-')+'</span></div>';
    });
    h += '</div></div>';
  } else {
    h += '<div class="glbox"><p class="d">낱말이 아니라 조어 규칙이에요. 새 버전이 나와도 자동으로 잡혀요.</p><div class="glgrid">';
    GL.patterns.forEach(function(p){ if(!hit(p.canon)&&!hit(p.gloss)) return; shown++;
      h += '<div class="gterm"><b>'+esc(p.canon)+'</b><br><span class="g">'+esc(p.gloss)+'</span></div>'; });
    h += '</div></div>';
  }
  document.getElementById('cnt').textContent = shown + '개';
  document.getElementById('main').innerHTML = h;
}

function glCall(payload, okMsg){
  if (!meta.server) { toast('서버 모드에서만 편집할 수 있어요. node dcgall/serve.mjs 로 실행해 주세요.', true); return; }
  fetch('/api/glossary', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)})
    .then(function(r){ return r.json() })
    .then(function(j){ if(j.error) throw new Error(j.error);
      GL.terms=j.terms; GL.candidates=j.candidates; toast(okMsg); renderTabs(); render(); })
    .catch(function(e){ toast('사전을 저장하지 못했어요: '+(e.message||''), true) });
}

document.getElementById('cats').addEventListener('click', function(e){
  var c=e.target.closest('.cat'); if(!c) return;
  S.view=c.dataset.view; renderTabs(); render();
});
document.getElementById('main').addEventListener('click', function(e){
  var row=e.target.closest('.cand'); if(!row) return;
  var w=row.dataset.w;
  if (e.target.classList.contains('ok'))
    glCall({promote:{word:w, type:row.querySelector('.ct').value, gloss:row.querySelector('.cg').value}},
           "'"+w+"' 을 확정했어요. 분류에 바로 반영돼요.");
  else if (e.target.classList.contains('no'))
    glCall({reject:w}, "'"+w+"' 을 기각했어요. 다시 후보에 오르지 않아요.");
});
document.getElementById('mineBtn').addEventListener('click', function(e){
  if (!meta.server) { toast('서버 모드에서만 채굴할 수 있어요. node dcgall/serve.mjs 로 실행해 주세요.', true); return; }
  var b=e.target.closest('button'); b.disabled=true;
  fetch('/api/mine', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'})
    .then(function(r){ return r.json() })
    .then(function(j){ GL.candidates=j.candidates;
      toast('채굴을 마쳤어요. 글 '+j.posts+'건에서 새 후보 '+j.added+'개를 찾았어요.');
      S.view='cand'; renderTabs(); render(); })
    .catch(function(err){ toast('채굴하지 못했어요: '+err.message, true) })
    .finally(function(){ b.disabled=false; });
});
var deb=function(f,ms){var h;return function(){var a=arguments;clearTimeout(h);h=setTimeout(function(){f.apply(null,a)},ms)}};
document.getElementById('q').addEventListener('input', deb(function(e){ S.q=e.target.value.trim(); render() },180));
document.addEventListener('keydown', function(e){
  if(e.key==='/' && e.target.tagName!=='INPUT'){ e.preventDefault(); document.getElementById('q').focus(); }});


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

renderTabs(); render();
`;
