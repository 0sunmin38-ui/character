/* ─────────────────────────────────────────────
   luvheilassistant 뷰어: 공용 뼈대

   화면은 둘로 갈렸다. 에셋(index.html)과 캐릭터(character.html).
   여기 있는 것은 두 쪽이 똑같이 쓰는 것뿐이다: 저장소 읽기, 마크다운, 저장·초안,
   생성기, 탭·토스트·패널.

   각 페이지는 아래 하나를 정의해 두고 이 파일을 나중에 불러 붙인다.

     const PAGE = {
       side : 'img' | 'bot',        저장·생성기가 어느 쪽 것을 보는가
       tabs : [[키, 이름], …],       상단 서브탭
       views: { 키: 그리는 함수 },
       load : async () => {}         (선택) 그 페이지가 더 읽어야 할 자료
     };
   ───────────────────────────────────────────── */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SKIP = /^(\.|dcgall\/|viewer\/|node_modules)/;
/* 뷰어가 viewer/ 안에 있으므로 저장소 루트를 기준으로 잡는다. */
const ROOT = location.pathname.replace(/viewer\/[^/]*$/, '');

/* 초안이 사는 곳: 만들어진 쪽을 따라 갈라 둔다. */
const DRAFT_DIR = { img:'99_작업중/이미지/', bot:'99_작업중/챗봇/' };
const SAMPLE_DIR = '01_자료/이미지/작가샘플';
const isDraft = f => f.startsWith('99_작업중/');
/* 화면에는 확장자를 내보내지 않는다. */
const pretty = p => String(p).replace(/\.(md|csv)$/i,'');

const S = { files:[], md:{}, dict:[], style:[], artist:[], links:[],
            tagset:new Set(), preset_vocab:new Set(), presets:{Q:{},N:{}}, presetTitle:{},
            tags:[], tagP:'', pick:{}, asm:{detail:'',main:'',neg:'',set:''},
            samples:[], asset:false,
            cart:[], tab:'', static:false, img:{} };

/* 화면 안쪽 두 번째 줄 탭. 사전·태그조합이 저마다 갈래를 더 가진다. */
const subGet = (k,def) => localStorage.getItem('char.sub.'+k) || def;
const subSet = (k,v) => localStorage.setItem('char.sub.'+k, v);
function segHTML(id, items, cur){
  return `<div class="seg seg2" id="${id}">${items.map(([k,n])=>
    `<button data-k="${k}"${k===cur?' class="on"':''}>${esc(n)}</button>`).join('')}</div>`;
}

/* ── 저장소 훑기 ────────────────────────────── */
async function listDir(path){
  const r = await fetch(path);
  if(!r.ok) throw new Error(path+' '+r.status);
  const html = await r.text();
  const out = [];
  for(const m of html.matchAll(/href="([^"]+)"/g)){
    let h = decodeURIComponent(m[1]);
    if(h.startsWith('/')||h.startsWith('?')||h.startsWith('..')||h==='./') continue;
    out.push(path + h);
  }
  return out;
}
async function walk(path, depth=0){
  if(depth > 4) return [];
  let items;
  try{ items = await listDir(path); }catch{ return []; }
  const files = [];
  for(const it of items){
    const rel = it.slice(ROOT.length);
    if(SKIP.test(rel.replace(/^\//,''))) continue;
    if(it.endsWith('/')) files.push(...await walk(it, depth+1));
    else if(/\.(md|csv)$/i.test(it)) files.push(rel);
  }
  return files;
}

/* ── CSV ────────────────────────────────────── */
function parseCSV(text){
  const rows=[]; let row=[], cell='', q=false;
  text = text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cell+='"';i++;} else q=false; } else cell+=c; }
    else if(c==='"') q=true;
    else if(c===','){ row.push(cell); cell=''; }
    else if(c==='\n'){ row.push(cell); rows.push(row); row=[]; cell=''; }
    else cell+=c;
  }
  if(cell||row.length){ row.push(cell); rows.push(row); }
  const hdr = rows.shift().map(h=>h.trim());
  return rows.filter(r=>r.some(c=>c.trim()))
             .map(r=>Object.fromEntries(hdr.map((h,i)=>[h,(r[i]??'').trim()])));
}

/* ── 아주 작은 마크다운 렌더러 ─────────────────
   CDN 의존 없이 저장소 문서를 렌더한다.
   원문 글(포스타입 전재)이 쓰는 표기까지 받아내야 해서 링크·이미지는 직접 훑는다:
     · `![](url)`            대체 텍스트가 빈 이미지
     · `[[Nai] 제목](url)`   링크 글자 안에 대괄호가 또 있는 경우
     · `[` … `](url)`        여러 줄에 걸친 링크 (포스타입 링크 카드)
     · 맨 URL                자동 링크
   정규식 하나로는 이 중 앞의 둘을 못 잡아 통째로 글자로 새어 나왔다. */
const SAFE = /^(?:https?:\/\/|mailto:|#|\/|\.\/|\.\.\/)/i;
const safeURL = u => { u=String(u||'').trim(); return SAFE.test(u) ? u : ''; };
const hostOf = u => { try{ return new URL(u, location.href).host.replace(/^www\./,''); }catch{ return ''; } };
/* 링크 글자 안에서는 강조까지만 본다. 링크 안의 링크는 만들지 않는다 */
const label = s => esc(s).replace(/`([^`]+)`/g,'<code>$1</code>')
                         .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');

function anchor(url, text){
  const u = safeURL(url), t = String(text||'').trim();
  if(!u) return label(t || url);
  return `<a href="${esc(u)}" target="_blank" rel="noopener">${t ? label(t) : esc(url)}</a>`;
}
function imgTag(url, alt){
  const u = safeURL(url);
  if(!u) return label(alt||'');
  const a = String(alt||'').trim();
  /* 원문 글의 그림은 남의 CDN 에 있고 그쪽이 핫링크를 막는다 (포스타입 CDN 은 403).
     브라우저는 <img> 에 가짜 Referer 를 실을 수 없으니 세 단계로 내려간다.
       ① viewer/img/ 에 보존해 둔 사본: 어디서나 되고 원본이 죽어도 남는다
       ② 서버의 /_img 통로: 아직 보존 안 한 그림 (archive-images.mjs 를 안 돌린 것)
       ③ 원본 주소: 정적 호스팅. 막히면 링크 자리로 바뀐다 */
  const local = S.img[url] || S.img[u];
  const src = local ? ROOT+'viewer/'+local
            : (!S.static && /^https?:\/\//i.test(u)) ? ROOT+'_img?u='+encodeURIComponent(u)
            : u;
  return `<figure><a class="imglink" href="${esc(u)}" target="_blank" rel="noopener">`
       + `<img src="${esc(src)}" alt="${esc(a)}" loading="lazy" decoding="async" onerror="imgFail(this)"></a>`
       + (a?`<figcaption>${esc(a)}</figcaption>`:'') + `</figure>`;
}
/* 못 받아온 그림은 깨진 아이콘 대신 원본으로 가는 자리를 남긴다 */
function imgFail(el){
  const a = el.closest('a'); el.remove();
  if(a && !a.querySelector('.imgdead')){
    a.classList.add('dead');
    a.insertAdjacentHTML('beforeend','<span class="imgdead">🖼 그림을 불러오지 못했습니다. 원본 열기</span>');
  }
}

/* `[텍스트](주소)` · `![대체](주소)` 를 대괄호·괄호 짝을 세며 찾는다.
   짝이 맞지 않으면 링크로 치지 않고 글자 그대로 흘려보낸다. */
function linkify(src, keep){
  let out='', i=0;
  while(i < src.length){
    const c = src[i];
    const img = c==='!' && src[i+1]==='[';
    if(c!=='[' && !img){ out+=c; i++; continue; }
    const start = img ? i+1 : i;
    let d=0, j=start;
    for(; j<src.length; j++){
      if(src[j]==='[') d++;
      else if(src[j]===']'){ d--; if(!d) break; }
    }
    if(d!==0 || src[j+1]!=='('){ out+=c; i++; continue; }
    const text = src.slice(start+1, j);
    let k=j+2, p=1, url='';
    for(; k<src.length; k++){
      const ch=src[k];
      if(ch==='(') p++;
      else if(ch===')'){ p--; if(!p) break; }
      url += ch;
    }
    if(p!==0){ out+=c; i++; continue; }
    out += keep(img ? imgTag(url, text) : anchor(url, text));
    i = k+1;
  }
  return out;
}

function inline(s){
  /* 완성된 HTML 조각은 자리표시자로 빼 둔다. 뒤 단계가 다시 건드리지 않도록 */
  const slot=[]; const keep = h => { slot.push(h); return '\u0000'+(slot.length-1)+'\u0000'; };
  let t = String(s);
  t = t.replace(/`([^`]+)`/g, (_,c)=> keep('<code>'+esc(c)+'</code>'));   /* 코드 먼저 */
  /* `\#` 처럼 백슬래시로 막아둔 기호: 코드 안에서는 escape 가 아니므로 코드 다음에 본다 */
  t = t.replace(/\\([\\`*_{}\[\]()#+\-.!~>])/g, (_,c)=> keep(esc(c)));
  t = linkify(t, keep);                                                   /* 이미지·링크 */
  t = esc(t);                                                             /* 남은 글자만 */
  t = t.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
       .replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>')
       .replace(/~~([^~\n]+)~~/g,'<del>$1</del>');
  /* 마크다운 표기 없이 그냥 적힌 주소도 눌리게 한다 */
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])/g,
        (m,pre,u)=> pre + keep(`<a href="${u}" target="_blank" rel="noopener">${u}</a>`));
  return t.replace(/\u0000(\d+)\u0000/g, (_,n)=> slot[+n]);
}

function renderMD(src){
  const L = src.split('\n'), out=[]; let i=0;
  const flushList = (tag, items)=> out.push(`<${tag}>`+items.map(x=>`<li>${inline(x)}</li>`).join('')+`</${tag}>`);
  while(i<L.length){
    const l = L[i];
    if(/^```/.test(l)){
      const buf=[]; i++;
      while(i<L.length && !/^```/.test(L[i])) buf.push(L[i++]);
      i++; out.push('<pre><code>'+esc(buf.join('\n'))+'</code></pre>'); continue;
    }
    /* 여러 줄에 걸친 링크: `[` 만 있는 줄로 열고 `](주소)` 로 닫는다.
       포스타입이 두 가지로 쓴다:
         · 안이 그림뿐   → 그림에 원본 링크를 건 것. 그림으로 낸다
         · 안이 글       → 링크 카드. 제목 + 부연으로 낸다 */
    if(l.trim()==='['){
      let j=i+1; const inner=[];
      while(j<L.length && !/^\]\(/.test(L[j].trim()) && j-i < 16) inner.push(L[j++]);
      /* 닫는 줄이 `](주소)[` 처럼 다음 블록과 붙어 나오기도 한다. 그 `[` 는 되돌려 준다 */
      const m = (L[j]||'').trim().match(/^\]\((.*)\)\s*(\[)?\s*$/);
      if(m){
        const u = safeURL(m[1]);
        const rows = inner.map(x=>x.trim()).filter(Boolean);
        const pics = rows.filter(r=>/^!\[[^\]]*\]\(/.test(r));
        const txt  = rows.filter(r=>!/^!\[[^\]]*\]\(/.test(r)).map(x=>x.replace(/^#{1,6}\s+/,''));
        if(pics.length) out.push(pics.map(r=>inline(r)).join(''));
        if(txt.length || !pics.length){
          const ttl = txt.shift() || hostOf(m[1]) || m[1];
          out.push(`<a class="linkcard" href="${esc(u||'#')}" ${u?'target="_blank" rel="noopener"':''}>`
            + `<b>${label(ttl)}</b>`
            + (txt.length?`<span>${label(txt.join(' · '))}</span>`:'')
            + `<em>${esc(hostOf(m[1])||m[1])}</em></a>`);
        }
        if(m[2]){ L[j]='['; i = j; } else i = j+1;
        continue;
      }
    }
    if(/^\s*\|/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(L[i+1]||'')){
      const cells = r => r.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
      const head = cells(l); i+=2; const body=[];
      while(i<L.length && /^\s*\|/.test(L[i])) body.push(cells(L[i++]));
      out.push('<table><thead><tr>'+head.map(h=>`<th>${inline(h)}</th>`).join('')+'</tr></thead><tbody>'
        +body.map(r=>'<tr>'+r.map(c=>`<td>${inline(c)}</td>`).join('')+'</tr>').join('')+'</tbody></table>');
      continue;
    }
    let m;
    /* 포스타입 글은 ##### 를 본문 소제목으로 쓴다 (71회로 제일 많다): 6단계까지 받는다 */
    if(m=l.match(/^(#{1,6})\s+(.*)$/)){ out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
    if(/^\s*(---|===)\s*$/.test(l)){ out.push('<hr>'); i++; continue; }
    if(/^>\s?/.test(l)){
      const buf=[]; while(i<L.length && /^>\s?/.test(L[i])) buf.push(L[i++].replace(/^>\s?/,''));
      out.push('<blockquote>'+renderMD(buf.join('\n'))+'</blockquote>'); continue;
    }
    if(/^\s*[-*]\s+/.test(l)){
      const buf=[]; while(i<L.length && /^\s*[-*]\s+/.test(L[i])) buf.push(L[i++].replace(/^\s*[-*]\s+/,''));
      flushList('ul',buf); continue;
    }
    if(/^\s*\d+\.\s+/.test(l)){
      const buf=[]; while(i<L.length && /^\s*\d+\.\s+/.test(L[i])) buf.push(L[i++].replace(/^\s*\d+\.\s+/,''));
      flushList('ol',buf); continue;
    }
    if(l.trim()===''){ i++; continue; }
    /* 이미지만 있는 줄은 문단으로 묶지 않는다. figure 가 <p> 안에 들어가면 안 된다 */
    if(/^!\[[^\]]*\]\(/.test(l.trim())){ out.push(inline(l.trim())); i++; continue; }
    const buf=[];
    while(i<L.length && L[i].trim()
          && !/^(#{1,6}\s|>|\s*[-*]\s|\s*\d+\.\s|```|\s*\|)/.test(L[i])
          && !/^!\[[^\]]*\]\(/.test(L[i].trim())
          && L[i].trim()!=='[') buf.push(L[i++]);
    if(!buf.length){ out.push(inline(L[i])); i++; continue; }
    out.push('<p>'+inline(buf.join(' '))+'</p>');
  }
  return out.join('\n');
}
const gradeOf = src => (src.split('\n')[0].match(/\[(원문|정리|작업|도구)\]/)||[])[1] || '';

/* ── 로드 ───────────────────────────────────── */
const norm = t => t.replace(/_/g,' ').trim().toLowerCase();
async function boot(){
  /* GitHub Pages 처럼 디렉터리 목록을 주지 않는 곳에서는 manifest.json 을 쓴다. */
  try{
    const r = await fetch(ROOT+'viewer/manifest.json', {cache:'no-store'});
    if(r.ok){ const j = await r.json(); S.files = j.files; S.samples = j.samples||[]; }
  }catch{}
  /* 저장소에 보존해 둔 그림 지도: 원본 주소 → viewer/img/<파일>. */
  try{
    const r = await fetch(ROOT+'viewer/images.json', {cache:'no-store'});
    if(r.ok) S.img = await r.json();
  }catch{}
  /* 쓰기가 되는지는 서버에 직접 묻는다. manifest 유무로 판단하면 로컬을 정적으로 오인한다. */
  try{
    const r = await fetch(ROOT+'_ping', {cache:'no-store'});
    S.static = !r.ok;
    if(r.ok) S.asset = !!(await r.json()).asset;
  }catch{ S.static = true; }
  /* 견본은 확장자가 달라 walk() 가 안 줍는다. 서버에서는 폴더를 직접 훑는다. */
  if(!S.static && !(S.samples||[]).length){
    try{
      const list = await listDir(ROOT+SAMPLE_DIR+'/');
      S.samples = list.map(x=>decodeURIComponent(x.split('/').pop()))
                      .filter(n=>/\.(webp|png|jpe?g|gif|avif)$/i.test(n));
    }catch{ S.samples=[]; }
  }
  if(!S.files.length){ try{ S.files = await walk(ROOT); }catch{} }
  if(!S.files.length){
    $('#main').innerHTML='<p class="res no">파일 목록을 읽지 못했습니다.<br>'
      +'로컬이면 저장소 루트에서 <code>node viewer/serve.mjs</code> 로 열고,<br>'
      +'정적 호스팅이면 <code>node viewer/build-manifest.mjs</code> 로 목록을 만들어 커밋하세요.</p>';
    return;
  }

  const get = async p => (await fetch(ROOT + p)).text();
  await Promise.all(S.files.filter(f=>f.endsWith('.md')).map(async f=>{ S.md[f]=await get(f); }));
  for(const f of S.files.filter(f=>/참고링크\.csv$/.test(f)))
    S.links.push(...parseCSV(await get(f)).map(r=>({...r, _file:f})));

  loadPresets();
  if(PAGE.load) await PAGE.load(get);

  /* 개수는 헤더에 두지 않는다. 저장이 안 되는 상태일 때만 그 사실을 알린다. */
  $('#sub').textContent = S.static ? '정적 모드: 저장할 수 없어요' : '';
  initTabs();
}

/* 퀄리티·부정 프리셋을 정본 파일에서 읽는다. 고친 뒤에도 다시 부른다. */
function loadPresets(){
  S.presets={Q:{},N:{}}; S.presetTitle={};
  for(const f of S.files.filter(f=>/스타일프리셋\/.*\.md$/.test(f))){
    const src=S.md[f]||'', kind=/부정/.test(f)?'N':'Q';
    for(const m of src.matchAll(/^## ([QN]\d+)([^\n]*)\n(?:[\s\S]*?)```\n([\s\S]*?)```/gm)){
      S.presets[kind][m[1]] = m[3].trim();
      S.presetTitle[m[1]] = (m[2]||'').replace(/^\s*[:-]\s*/,'').replace(/★/g,'').trim();
    }
  }
}

/* ── 생성기 ──────────────────────────────────
   Gem 에 넣을 지시문과 Gem 링크가 각각 다른 파일에 흩어져 있었다.
   쓸 때는 '링크를 열고 지시문을 복사한다' 한 동작이라 한 화면에 모은다.

   지시문의 정본은 04_생성기/ 다. 여기서는 읽어 와서 펼칠 뿐 따로 갖고 있지 않는다. */
const genSide = f => /이미지/.test(f) ? 'img' : 'bot';
function drawGen(side){
  const gems = S.links.filter(r => r['분류']==='생성 도구'
    && (side==='img' ? /\/이미지\// : /\/챗봇\//).test(r._file));
  const docs = S.files.filter(f => f.startsWith('04_생성기/') && !isChore(f) && genSide(f)===side).sort();

  $('#main').innerHTML =
    (gems.length ? `<div class="gemrow">${gems.map(x=>`
      <a class="gem" href="${esc(x['URL'])}" target="_blank" rel="noopener">
        <b>${esc(x['이름'])}</b><span>${esc(x['용도']||'')}</span><em>열기 ↗</em></a>`).join('')}</div>` : '')
    + (docs.length ? docs.map((f,i)=>{
        const src = (S.md[f]||'').replace(/^> `\[[^\]]+\][\s\S]*?\n/,'');
        const title = (src.match(/^#\s+(.*)$/m)||[])[1] || docName(f);
        return `<details class="genbox"${i===0?' open':''} data-f="${esc(f)}">
          <summary>${esc(title)}</summary>
          <div class="md">${renderMD(src.replace(/^#\s+.*$/m,''))}</div></details>`;
      }).join('')
      : '<p class="empty">이 갈래의 생성기가 없습니다.</p>');

  /* 코드블록이 곧 붙여넣을 지시문이다. 하나씩 복사할 수 있게 한다 */
  $('#main').querySelectorAll('.genbox .md pre').forEach((pre,i)=>{
    const b=document.createElement('button');
    b.className='cp'; b.textContent='⧉'; b.title='지시문 복사';
    b.onclick=()=>copy(pre.querySelector('code')?.textContent ?? pre.textContent, `지시문 ${i+1}`);
    pre.appendChild(b);
  });
}

/* ── 초안 저장 · 수정 · 삭제 (99_작업중/) ────────
   정적 서버(python http.server · GitHub Pages)에는 쓰기 엔드포인트가 없다.
   저장은 내려받기로 대체하고, 수정·삭제 버튼은 아예 내린다. */
async function post(url, body){
  const r = await fetch(ROOT+url, {method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify(body)});
  return r;
}
/* 서버가 아는 갈래는 이미지·챗봇 둘뿐이다. 파츠 종류는 전부 이미지 쪽에 떨어진다. */
const SIDE = k => k==='bot' ? 'bot' : 'img';
async function saveDraft(name, content, kind){
  if(!name){ toast('이름을 입력하세요', true); return; }
  const side = SIDE(kind);
  try{
    let r = await post('_save', {kind:side, name, content});
    if(r.status===409){
      const j=await r.json();
      if(!confirm(`${pretty(j.path)} 가 이미 있습니다. 덮어쓸까요?`)) return;
      r = await post('_save', {kind:side, name, content, overwrite:true});
    }
    if(r.ok){
      const j=await r.json();
      addFile(j.path, content);
      toast(pretty(j.path)+' 저장됨');
      if(PAGE.afterSave) PAGE.afterSave();   /* 방금 저장한 것이 아래 목록에 바로 보이게 */
      return;
    }
    toast('저장 실패: '+ await r.text(), true);
  }catch{
    /* 정적 서버: 내려받기로 */
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([content],{type:'text/markdown'}));
    a.download=name+'.md'; a.click(); URL.revokeObjectURL(a.href);
    toast('서버가 쓰기를 지원하지 않아 내려받았습니다');
  }
}
/* id 에는 '#' 을 넣지 않는다. 선택자는 wireSave 에서 만든다. */
function saveBar(id, ph){
  if(S.static) return '';        /* 정적 호스팅에는 쓰기 엔드포인트가 없다 */
  return `<input class="ctl" type="text" id="${id}-name" placeholder="${ph}" style="min-width:140px">
          <button class="btn i pri" id="${id}-save" title="저장">⤓</button>`;
}
function wireSave(id, build, kind){
  const key='char.name.'+id;
  const nameEl=$('#'+id+'-name'), btn=$('#'+id+'-save');
  if(!nameEl||!btn) return;      /* 정적 모드에서는 바 자체가 없다 */
  nameEl.value = localStorage.getItem(key) || '';
  nameEl.oninput = () => localStorage.setItem(key, nameEl.value);   /* 재렌더에도 이름 유지 */
  nameEl.onkeydown = e => { if(e.key==='Enter') btn.click(); };
  btn.onclick = () => saveDraft(nameEl.value.trim(), build(), kind);
}
/* 파일 머리말: 03_프롬프트/README 의 규칙 */
function head(o){
  return ['플랫폼: '+(o.platform||''), '언어: '+(o.lang||'한국어'), '형식: '+(o.fmt||''),
          (o.limit?'글자수: '+o.count+' / '+o.limit:'글자수: '+o.count),
          '최종 수정: '+new Date().toISOString().slice(0,10)].join('\n');
}

/* ── 초안 카드 ─────────────────────────────── */
const len = t => (t||'').length.toLocaleString()+'자';
function cardHTML(path){
  const name = pretty(path.split('/').pop());
  const src  = S.md[path]||'';
  const kind = (src.match(/^종류:\s*(.+)$/m)||[])[1] || '';
  return `<div class="card" data-p="${esc(path)}" data-n="${esc(name)}">
    <div class="row">
      ${kind?`<span class="kindbadge">${esc(kind)}</span>`:''}
      <span class="nm" title="${esc(pretty(path))}">${esc(name)}</span>
      <span class="meta">${len(src)}</span>
      <span class="acts">
        <button data-a="open" title="${S.static?'보기':'수정'}">✎</button>
        <button data-a="copy" title="복사">⧉</button>
        ${S.static?'':'<button class="del" data-a="del" title="삭제">✕</button>'}
      </span>
    </div>
    <div class="edit">
      <textarea ${S.static?'readonly':''}>${esc(src)}</textarea>
      <div class="editbar">
        ${S.static?'':'<button class="btn pri" data-a="save">저장</button>'}
        <button class="btn" data-a="close">닫기</button>
        <span class="muted" style="font-size:12px">${esc(pretty(path))}</span>
      </div>
    </div>
  </div>`;
}

/* ── 문서 목록 보조 ──────────────────────────
   문서 열람 화면은 껐지만, 생성기가 04_생성기/ 를 훑을 때 이 둘이 필요하다. */
const CHORE = /(^|\/)(README\.md|CLAUDE\.md|문서구분표\.md)$/;
const isChore = f => CHORE.test(f);
const docName = f => pretty(f).split('/').pop()
  .replace(/^\d+(?:[-.]\d+)*[_-]/,'')   /* 앞의 정렬용 번호 */
  .replace(/_/g,' ');

/* 저장된 파일을 목록에 넣는다.
   부팅 때 한 번만 훑기 때문에 이걸 안 하면 저장해도 목록에 안 나온다. */
function addFile(path, content){
  S.md[path] = content;
  if(!S.files.includes(path)){ S.files.push(path); S.files.sort(); }
}
function dropFile(path){
  delete S.md[path];
  S.files = S.files.filter(f=>f!==path);
  if(S.cur===path) S.cur=null;
}
/* 저장소를 다시 훑는다. 터미널에서 파일을 만들었을 때 */
async function reload(){
  const before=S.files.length;
  try{
    const r=await fetch(ROOT+'viewer/manifest.json',{cache:'no-store'});
    S.files = r.ok ? (await r.json()).files : await walk(ROOT);
  }catch{ S.files = await walk(ROOT); }
  await Promise.all(S.files.filter(f=>f.endsWith('.md') && !(f in S.md))
    .map(async f=>{ S.md[f]=await (await fetch(ROOT+f)).text(); }));
  if(S.tab==='combo') drawCombo();
  PAGE.views[S.tab]();   /* 지금 보고 있는 화면을 다시 그린다 */
  toast(`${S.files.length}개 파일${S.files.length>before?` (+${S.files.length-before})`:''}`);
}


/* ── 탭 · 알림 ──────────────────────────────── */
function initTabs(){
  $('#subs').innerHTML = PAGE.tabs.map(([k,n])=>`<button data-t="${k}">${esc(n)}</button>`).join('');
  $('#subs').querySelectorAll('button').forEach(b=>b.onclick=()=>setTab(b.dataset.t));
  setTab(subGet('tab.'+PAGE.side, PAGE.tabs[0][0]));
}
function setTab(t){
  if(!PAGE.views[t]) t = PAGE.tabs[0][0];
  S.tab=t; subSet('tab.'+PAGE.side, t);
  $('#subs').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
  PAGE.views[t]();
}
function copy(text,label){
  navigator.clipboard.writeText(text).then(()=>toast((label||'')+' 복사됨'),()=>toast('복사 실패', true));
}
let tt; function toast(m, bad){ const e=$('#toast'); e.textContent=m;
  e.classList.toggle('bad', !!bad); e.classList.add('on');
  clearTimeout(tt); tt=setTimeout(()=>e.classList.remove('on'), bad?2600:1300); }

/* ── 담은 태그 패널 ──────────────────────────
   에셋에만 있다. 캐릭터 화면에는 이 칸 자체가 없다. */
const app=$('#app'), LS={cw:'char.cw', ps:'char.ps'};
const MINW=150, MAXW=560;
const hasCart = () => !!$('#cart');
function cartPref(){ try{ return !!(JSON.parse(localStorage.getItem(LS.ps))||{}).c; }catch{ return false; } }
const savePanels=()=>localStorage.setItem(LS.ps, JSON.stringify({c:app.classList.contains('noc')}));
if(hasCart()){
  const cw=localStorage.getItem(LS.cw);
  if(cw) app.style.setProperty('--cw',cw);
  if(cartPref()) app.classList.add('noc');
}
const narrow = () => matchMedia('(max-width:900px)').matches;
function closeDrawers(){ if(hasCart()) $('#cart').classList.remove('open'); $('#scrim').classList.remove('on'); }
function toggleDrawer(el){
  const open = !el.classList.contains('open');
  closeDrawers();
  if(open){ el.classList.add('open'); $('#scrim').classList.add('on'); }
}
$('#scrim').onclick = closeDrawers;
addEventListener('keydown', e=>{ if(e.key==='Escape') closeDrawers(); });

if(hasCart()){
  const el=$('#rzR');
  el.onmousedown = e => {
    e.preventDefault();
    if(app.classList.contains('noc')){ app.classList.remove('noc'); savePanels(); }
    el.classList.add('drag'); document.body.classList.add('resizing');
    const move = ev => {
      const v = Math.max(MINW, Math.min(MAXW, window.innerWidth - ev.clientX)) + 'px';
      app.style.setProperty('--cw', v); localStorage.setItem(LS.cw, v);
    };
    const up = () => {
      el.classList.remove('drag'); document.body.classList.remove('resizing');
      removeEventListener('mousemove',move); removeEventListener('mouseup',up);
    };
    addEventListener('mousemove',move); addEventListener('mouseup',up);
  };
  el.ondblclick = () => { app.classList.toggle('noc'); savePanels(); };
  $('#tgCartM').onclick = () => narrow() ? toggleDrawer($('#cart'))
                                         : (app.classList.toggle('noc'), savePanels());
  $('#clear').onclick = () => { if(S.cart.length && confirm('담은 태그를 모두 비울까요?')){ S.cart=[]; saveCart(); } };
}
$('#reload').onclick = reload;

/* 패널 폭에 따라 data-w 를 붙인다. 드래그 중에도 갱신된다. */
function widthClass(el, bp){
  if(!el) return;
  const set=()=>{ const w=el.getBoundingClientRect().width;
    el.dataset.w = w>=bp[0] ? 'lg' : (w>=bp[1] ? 'md' : 'sm'); };
  new ResizeObserver(set).observe(el); set();
}
widthClass($('#hdr'),  [700,500]);
widthClass($('#cart'), [230,165]);
widthClass($('#main'), [620,440]);
