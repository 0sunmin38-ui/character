/* ─────────────────────────────────────────────
   에셋: 사전 → 태그조합 → 최종 → 생성기
   core.js 가 먼저 실행된 뒤에 붙는다.
   ───────────────────────────────────────────── */
const SLOTS = ['00 카메라·구도','01 성별','02 캐릭터','03 시선','04 얼굴','05 머리','06 상체','07 하체',
'08 신체 상태','09 직업·종족','10 캐릭터 상황','11 자세','12 동작','13 감정','14 장르','15 재질','16 구조',
'17 상의','18 겉옷·팔','19 하의·다리','20 머리·목','21 팔·허리','22 다리·메인','23 신발','24 배경',
'25 소품','26 분위기'];

/* 26슬롯 예시: 02_템플릿/이미지/01 의 예시 열 */
const SLOT_EG = ['portrait, cowboy shot, from below','1girl, solo','mash kyrielight',
'looking at viewer','lips, eyelashes, sharp eyes','long hair, blonde hair','large breasts',
'thick thighs','sweaty, wet','knight, elf, maid','fighting, restrained','standing, sitting',
'holding sword','happy, smiling','bunny girl, school uniform','leather, latex','sleeveless, open back',
'shirt, jacket','coat, gloves','skirt, thighhighs','hairpin, choker','bracelet, belt',
'anklet','boots, heels','classroom, ruined castle','window, dust','sunlight, fog, bokeh'];

/* ── 태그 ───────────────────────────────────
   태그사전·스타일태그·작가태그를 한 표로 합친다. 셋은 파일이 다를 뿐 쓰는 자리는 같다.
   맨 위 갈래는 '어느 파일에서 왔나' 가 아니라 **지금 무엇을 짜고 있나** 로 잡는다.
   시트 이름은 내용과 어긋나기도 한다 (`태그동작2` 안은 전부 옷을 다루는 동작이다). */
const PURPOSE = [
  ['scene',  '장면·구도', '배경 · 장소 · 연출 · 초점 · 품질'],
  ['who',    '캐릭터',    '인원 · 인종 · 종족 · 직업 · 특징'],
  ['look',   '외형',      '얼굴 · 머리 · 피부 · 체형'],
  ['wear',   '의상',      '상의 · 하의 · 속옷 · 신발 · 장신구'],
  ['act',    '동작·표정', '신체 동작 · 옷을 다루는 동작 · 동사'],
  ['artist', '작가',      '그림체를 정하는 작가 태그'],
  ['style',  '스타일',    '매체 · 아트스타일 · 색상 · 특수효과'],
  ['cast',   '등장·원작', '관계 · 원작 · 등장 캐릭터'],
  ['adult',  '성인',      'NSFW'],
];
const PNAME = Object.fromEntries(PURPOSE.map(([k,n])=>[k,n]));
const SHEET2P = {
  '태그기본':'scene', '태그인물':'who', '태그외모':'look', '태그체형':'look',
  '태그의상':'wear',  '태그장신구':'wear',
  '태그동작1':'act',  '태그동작2':'act', '태그행동':'act',
  '태그작품':'cast',  '태그섹스':'adult',
};
/* 시트만으로는 안 갈리는 것.
   `태그인물 / 인물` 은 전부 관계 태그(father_and_daughter · aunt_and_nephew)다.
   그 캐릭터의 외형이 아니라 '이 그림에 누가 같이 나오는가' 라서 장면 쪽이다. */
const P_OVERRIDE = { '태그인물|인물':'cast' };

/* 세 CSV 를 한 모양으로 눕힌다.
   ko 는 '이 태그가 한국어로 무엇인가': 사전은 한글명, 스타일태그는 설명이 그 자리다. */
function buildTags(){
  const T=[];
  /* src 에 원본 행을 그대로 물려 둔다. 화면에서 고친 값을 CSV 로 되쓰려면 필요하다 */
  for(const r of S.dict) T.push({
    p: P_OVERRIDE[r['시트']+'|'+r['분류1']] || SHEET2P[r['시트']] || 'scene',
    g: r['분류1']||'', s: r['분류2']||'',
    ko: r['한글명']||'', tags: (r['태그']||'').split(',').map(t=>t.trim()).filter(Boolean),
    nsfw: r['NSFW']==='TRUE', note: r['비고']||'', src: r, from:'태그사전' });
  for(const r of S.style) T.push({
    p:'style', g: r['분류']||'', s: r['세부']||'',
    ko: r['설명']||'', tags: [r['태그']].filter(Boolean),
    nsfw:false, note: r['비고']||'', src: r, from:'스타일태그' });
  for(const r of S.artist) T.push({
    /* CSV 값에 이미 `artist:` 가 붙어 있고, '기타_artist 태그 X' 섹션은 붙이면 안 되는 것들이다.
       예전에는 여기서 한 번 더 붙여 `artist:artist: …` 를 만들고 있었다. 값을 그대로 쓴다. */
    p:'artist', g: /X$/.test(r['섹션']||'') ? 'artist 안 붙임' : '작가태그', s:'',
    ko:'', tags: [r['태그']].filter(Boolean), nsfw:false,
    note: r['네거티브_추천']==='Y' ? '네거티브 추천' : '', src: r, from:'작가태그' });
  S.tags = T;
}



/* ── 표 열 너비 ──────────────────────────────
   사전은 사람마다 넓게 보고 싶은 칸이 다르다. 머리글 경계선을 끌어 조절하고,
   조절한 값은 표마다 기억한다. */
function gridWidths(key){ try{ return JSON.parse(localStorage.getItem('char.col.'+key))||{}; }catch{ return {}; } }
function gridHidden(key){ try{ return JSON.parse(localStorage.getItem('char.hide.'+key))||[]; }catch{ return []; } }
const setHidden = (key,set) => localStorage.setItem('char.hide.'+key, JSON.stringify([...set]));
/* 숨긴 열은 머리글과 모든 줄에서 함께 지운다. 표를 다시 그려도 남는다. */
function applyHidden(table, key){
  const hide = new Set(gridHidden(key));
  for(const row of table.rows)
    [...row.cells].forEach((c,i)=>{ c.style.display = hide.has(i) ? 'none' : ''; });
}
const colLabel = (labels,i) => labels[i] || `${i+1}번째 열`;

/* 열 목록: ▥ 버튼과 머리글 팝오버가 같은 내용을 쓴다.
   clicked 가 있으면 그 열을 바로 숨기는 항목을 맨 위에 얹는다. */
function colListHTML(key, labels, clicked){
  const h = new Set(gridHidden(key));
  return (clicked!=null && !h.has(clicked)
      ? `<button class="colitem" data-a="one">「${esc(colLabel(labels,clicked))}」 숨기기</button><i class="sep"></i>` : '')
    + labels.map((t,i)=>`<label><input type="checkbox" data-i="${i}"${h.has(i)?'':' checked'}>${esc(colLabel(labels,i))}</label>`).join('')
    + `<i class="sep"></i><button class="colitem" data-a="all">전부 보기</button>`;
}
/* 목록에서 일어난 일을 한 곳에서 처리한다. 마지막 한 열은 남긴다 */
function colAct(e, table, key, labels, clicked, close){
  const h = new Set(gridHidden(key));
  const cb = e.target.closest('input[type=checkbox]');
  const a  = e.target.closest('[data-a]')?.dataset.a;
  if(cb){ cb.checked ? h.delete(+cb.dataset.i) : h.add(+cb.dataset.i); }
  else if(a==='one'){ h.add(clicked); }
  else if(a==='all'){ h.clear(); }
  else return;
  if(h.size >= labels.length){ toast('열을 전부 숨길 수는 없습니다', true); return; }
  setHidden(key, h); applyHidden(table, key); syncColMenus(key, labels);
  if(a) close && close();
}
/* 열려 있는 두 곳(버튼 메뉴·팝오버)의 체크 상태를 맞춘다 */
function syncColMenus(key, labels){
  const h = new Set(gridHidden(key));
  document.querySelectorAll(`#colmenu-${key} input[data-i], .colpop input[data-i]`)
    .forEach(cb=>{ cb.checked = !h.has(+cb.dataset.i); });
  const sum = document.querySelector(`#colmenu-${key} > summary`);
  if(sum) sum.title = `볼 열 고르기 (${labels.length-h.size}/${labels.length}) · 머리글 우클릭`;
}

/* ── 머리글 팝오버 ─ 우클릭 · 길게 누르기 ────── */
let colpop = null;
function closeColPop(){ if(colpop){ colpop.remove(); colpop = null; } }
addEventListener('mousedown', e => { if(colpop && !colpop.contains(e.target)) closeColPop(); }, true);
addEventListener('keydown',   e => { if(e.key==='Escape') closeColPop(); });
addEventListener('scroll',    closeColPop, true);
function openColPop(x, y, table, key, labels, i){
  closeColPop();
  colpop = document.createElement('div');
  colpop.className = 'colpop';
  colpop.innerHTML = colListHTML(key, labels, i);
  document.body.appendChild(colpop);
  const r = colpop.getBoundingClientRect();
  colpop.style.left = Math.max(6, Math.min(x, innerWidth  - r.width  - 8)) + 'px';
  colpop.style.top  = Math.max(6, Math.min(y, innerHeight - r.height - 8)) + 'px';
  colpop.onclick = e => colAct(e, table, key, labels, i, closeColPop);
}

/* ▥ 버튼. 표를 다시 그릴 때마다 같은 자리에 새로 단다. */
function mountColMenu(bar, table, key, labels){
  const id = 'colmenu-'+key;
  const old = document.getElementById(id); if(old) old.remove();
  const el = document.createElement('details');
  el.className = 'colmenu'; el.id = id;
  el.innerHTML = `<summary class="iconsum">▥</summary>
    <div class="colmenu-body">${colListHTML(key, labels, null)}</div>`;
  el.onclick = e => { if(!e.target.closest('summary')) colAct(e, table, key, labels, null, null); };
  bar.appendChild(el);
  syncColMenus(key, labels);
}

function wireGrid(host, key, barSel){
  const table = host.querySelector('table.grid'); if(!table) return;
  const ths = [...table.tHead.rows[0].cells];
  const saved = gridWidths(key);
  ths.forEach((th,i)=>{ if(saved[i]) th.style.width = saved[i]+'px'; });
  applyHidden(table, key);
  const labels = ths.map(th=>th.textContent.trim());
  if(barSel && $(barSel)) mountColMenu($(barSel), table, key, labels);

  ths.forEach((th,i)=>{
    /* 머리글에서 바로 고른다. 메뉴를 찾아 들어가는 것보다 '이 열' 을 가리키는 게 빠르다.
       다만 누르자마자 숨기지는 않는다. 무엇을 숨길지는 팝오버에서 고른다. */
    th.oncontextmenu = e => { e.preventDefault(); openColPop(e.clientX, e.clientY, table, key, labels, i); };
    let timer = null, pt = null;
    th.ontouchstart = e => {
      pt = e.touches[0];
      timer = setTimeout(()=>{ timer=null; openColPop(pt.clientX, pt.clientY, table, key, labels, i); }, 500);
    };
    const cancel = () => { if(timer){ clearTimeout(timer); timer=null; } };
    th.ontouchend = th.ontouchmove = th.ontouchcancel = cancel;
  });

  ths.forEach((th,i)=>{
    if(i===ths.length-1) return;                 /* 마지막 칸은 남는 폭을 먹는다 */
    const g=document.createElement('span'); g.className='cgrip'; th.appendChild(g);
    g.onmousedown = e => {
      e.preventDefault(); e.stopPropagation();
      g.classList.add('drag'); document.body.classList.add('resizing');
      const x0=e.clientX, w0=th.getBoundingClientRect().width;
      const move = ev => { th.style.width = Math.max(46, Math.round(w0+ev.clientX-x0))+'px'; };
      const up = () => {
        g.classList.remove('drag'); document.body.classList.remove('resizing');
        const o=gridWidths(key); o[i]=parseInt(th.style.width,10);
        localStorage.setItem('char.col.'+key, JSON.stringify(o));
        removeEventListener('mousemove',move); removeEventListener('mouseup',up);
      };
      addEventListener('mousemove',move); addEventListener('mouseup',up);
    };
    g.ondblclick = e => {                        /* 더블클릭이면 그 칸만 초기화 */
      e.stopPropagation(); th.style.width='';
      const o=gridWidths(key); delete o[i];
      localStorage.setItem('char.col.'+key, JSON.stringify(o));
    };
  });
}

/* head 항목은 '이름' 또는 '이름|클래스': 클래스가 붙으면 좁을 때 접힌다 */
function tbl(head,body,grid){
  const th=head.map(h=>{ const [t,c]=String(h).split('|');
    return `<th${c?` class="${c}"`:''}>${t}</th>`; }).join('');
  return `<table class="${grid?'grid':''}"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}
/* ── 북마크 ──────────────────────────────────
   담기(카트)와 다른 것이다. 카트는 지금 짜는 한 장을 위한 임시 더미이고,
   북마크는 4천 줄에서 건진 '내가 계속 쓰는 것' 으로 남는다. */
const MARKS = new Set((()=>{ try{ return JSON.parse(localStorage.getItem('char.marks'))||[]; }
                             catch{ return []; } })());
const marked = t => MARKS.has(t);
let onlyMark = localStorage.getItem('char.onlymark')==='1';

function toggleMark(t){
  MARKS.has(t) ? MARKS.delete(t) : MARKS.add(t);
  localStorage.setItem('char.marks', JSON.stringify([...MARKS]));
  /* 표를 다시 그리지 않는다. 같은 태그를 그린 칩만 골라 갈아끼운다 */
  document.querySelectorAll('.tag').forEach(el=>{
    if(el.dataset.t!==t) return;
    el.classList.toggle('mk', MARKS.has(t));
    const b = el.querySelector('.bm'); if(b) b.textContent = MARKS.has(t) ? '★' : '☆';
  });
  toast(t + (MARKS.has(t) ? ' 북마크' : ' 북마크 해제'));
}

/* 별은 칩 안에 있다. 칩을 누르면 담기고, 별을 누르면 북마크다.
   캡처 단계에서 잡아 칩의 onclick(담기) 까지 내려가지 않게 막는다. */
document.addEventListener('click', e => {
  const b = e.target.closest?.('.bm'); if(!b) return;
  const chip = b.closest('.tag'); if(!chip) return;
  e.stopPropagation(); e.preventDefault();
  toggleMark(chip.dataset.t);
}, true);

/* 거르개는 거르는 자리에 둔다. NSFW 숨김 옆, 각 사전의 바에.
   상태는 사전 갈래를 옮겨도 남는다 — 북마크만 보다가 탭을 옮겼는데
   갑자기 전체가 나오면 그건 거르개가 아니다. */
const markBox = () => `<label class="muted" title="북마크한 태그만 보기">
    <input type="checkbox" class="bmk"${onlyMark?' checked':''}> ★ 북마크만</label>`;

function wireMarkBox(run){
  document.querySelectorAll('.bmk').forEach(el=>{
    el.onchange = () => {
      onlyMark = el.checked;
      localStorage.setItem('char.onlymark', onlyMark?'1':'0');
      if(onlyMark && !MARKS.size) toast('아직 북마크한 태그가 없습니다', true);
      run();
    };
  });
}

/* 담는 자리(태그 탭)와 바로 넣는 자리(파츠 피커)가 다르다. 후자는 상위에서 클릭을 받는다 */
function tagCell(t, mode){
  const a = `class="tag${marked(t)?' mk':''}" data-t="${esc(t)}"`;
  const star = `<i class="bm" title="북마크 (별을 누른다)">${marked(t)?'★':'☆'}</i>`;
  return mode==='pick'
    ? `<span ${a}>${star}${esc(t)}</span>`
    : `<span ${a} onclick="add('${esc(t).replace(/'/g,"\\'")}')">${star}${esc(t)}</span>`;
}

/* ── 에셋 화면 구성 ──────────────────────────
   사전에서 찾고 → 태그조합에서 파츠를 짜고 → 최종에서 합친다.
   저장한 것은 만든 자리 아래에 둔다. 따로 '작업중' 을 두면 만든 곳과 여는 곳이 갈린다. */
const COMBO = [['style','그림체'],['look','외형'],['wear','의상'],['scene','장면']];
const DICTS = [['plain','일반'],['artist','작가'],['style','스타일'],['preset','프리셋']];

/* ── 사전 ─ 찾는 자리. 여기서는 조립하지 않는다 ── */
function drawDict(){
  const cur = subGet('dict','plain');
  $('#main').innerHTML = `<div class="bar">
      ${segHTML('dseg', DICTS, cur)}
    </div><div id="dbody"></div>`;
  $('#dseg').onclick = e => { const b=e.target.closest('button'); if(!b) return;
    subSet('dict', b.dataset.k); drawDict(); };
  ({plain:dictPlain, artist:dictArtist, style:dictStyle, preset:drawPresets})[cur]();
}

function dictPlain(){
  const P = PURPOSE.filter(([k])=>k!=='artist' && k!=='style');
  const keys = P.map(([k])=>k);
  $('#dbody').innerHTML = `<div class="bar" id="dbar">
      <input class="ctl" type="search" id="q" placeholder="한글명 · 태그 검색 (예: 안경, twin)">
      <select class="ctl" id="p"><option value="">목적 전체</option>
        ${P.map(([k,n,d])=>`<option value="${k}" title="${esc(d)}">${esc(n)}</option>`).join('')}</select>
      <select class="ctl" id="c1"></select>
      <select class="ctl" id="c2"></select>
      <label class="muted"><input type="checkbox" id="sfw" checked> NSFW 숨김</label>
      ${markBox()}
      <span class="sp"></span>
      ${S.static?'':'<button class="btn i" id="padd" title="추가 (줄을 더블클릭하면 고칩니다)">＋</button>'}
    </div>
    <div id="form"></div>
    <div id="rows"></div>`;
  const fill=(el,list,keep,ph)=>{ const cur=keep&&list.includes(keep)?keep:'';
    el.innerHTML=`<option value="">${ph}</option>`+list.map(v=>`<option${v===cur?' selected':''}>${esc(v)}</option>`).join('');
    el.value=cur; el.style.display=list.length?'':'none'; };
  const scope=()=>{ const p=$('#p').value; return S.tags.filter(r=>p?r.p===p:keys.includes(r.p)); };
  const syncCats=()=>{ const k1=$('#c1').value,k2=$('#c2').value;
    fill($('#c1'), [...new Set(scope().map(r=>r.g).filter(Boolean))].sort(), k1, '분류 전체');
    const c1=$('#c1').value;
    fill($('#c2'), [...new Set(scope().filter(r=>!c1||r.g===c1).map(r=>r.s).filter(Boolean))].sort(), k2, '세부 전체');
  };
  const run=()=>{
    const q=$('#q').value.trim().toLowerCase(), c1=$('#c1').value, c2=$('#c2').value, sfw=$('#sfw').checked;
    let r=scope();
    if(c1) r=r.filter(x=>x.g===c1);
    if(c2) r=r.filter(x=>x.s===c2);
    if(q) r=r.filter(x=>(x.ko+' '+x.tags.join(' ')+' '+x.g+' '+x.s+' '+x.note).toLowerCase().includes(q));
    if(sfw) r=r.filter(x=>!x.nsfw);
    if(onlyMark) r=r.filter(x=>x.tags.some(marked));
    $('#rows').innerHTML = tbl(['목적|opt2 meta','분류|opt meta','세부|opt2 meta','뜻','태그','NSFW|meta','비고|opt meta'],'',true);
    const table = $('#rows').querySelector('table');
    wireGrid($('#rows'), 'plain', '#dbar');
    lazyRows($('#rows'), r, (x,i)=>`<tr data-i="${i}">
        <td class="muted opt2 meta">${esc(PNAME[x.p]||'')}</td>
        <td class="muted opt meta">${esc(x.g)}</td>
        <td class="muted opt2 meta">${esc(x.s)}</td>
        <td class="wrap">${esc(x.ko)}</td>
        <td class="wrap">${x.tags.map(t=>tagCell(t)).join(' ')}</td>
        <td class="meta">${x.nsfw?'<span class="nsfw">NSFW</span>':''}</td>
        <td class="muted opt meta wrap">${esc(x.note)}</td></tr>`,
      120, ()=>applyHidden(table,'plain'));   /* 이어 붙인 줄에도 숨긴 열을 적용한다 */
    /* 고치기는 줄을 더블클릭한다. 버튼 하나 때문에 빈 열을 세우면 자리만 먹는다.
       태그는 한 번 눌러 담는 것이라 더블클릭과 겹치지 않게 비켜준다. */
    $('#rows').ondblclick = e => {
      if(S.static || e.target.closest('.tag')) return;
      const tr = e.target.closest('tr'); if(!tr) return;
      openRowForm($('#form'), 'plain', r[+tr.dataset.i].src, ()=>dictPlain());
    };
  };
  if($('#padd')) $('#padd').onclick = ()=>openRowForm($('#form'), 'plain', null, ()=>dictPlain());
  $('#p').onchange=()=>{syncCats();run();};
  $('#c1').onchange=()=>{syncCats();run();};
  ['#q','#c2','#sfw'].forEach(x=>{const e=$(x); e.oninput=e.onchange=run;});
  wireMarkBox(run);
  syncCats(); run(); $('#q').focus();
}

/* ── 작가 사전 ───────────────────────────────
   140개를 글자만 보고 고를 수는 없다. 그림체는 눈으로 고르는 것이다.
   태그마다 남캐·여캐 견본을 붙인다. */
const slugOf = t => String(t).replace(/^artist\s*:\s*/i,'').trim().toLowerCase()
  .replace(/[^a-z0-9가-힣]+/g,'-').replace(/^-+|-+$/g,'');
const SEXES = [['남', /_(남|m|male)$/i], ['여', /_(여|f|female)$/i]];
function sampleIndex(){
  const idx = {};
  for(const f of S.samples||[]){
    const base = f.replace(/\.[^.]+$/,'');
    for(const [sex, re] of SEXES)
      if(re.test(base)){ (idx[base.replace(re,'')] ||= {})[sex] = f; break; }
  }
  return idx;
}
function dictArtist(){
  const idx = sampleIndex();
  const rows = S.tags.filter(r=>r.p==='artist');
  const have = rows.filter(r=>idx[slugOf(r.tags[0])]).length;
  $('#dbody').innerHTML = `<div class="bar" id="abar">
      <input class="ctl" type="search" id="aq" placeholder="작가 태그 검색">
      <label class="muted"><input type="checkbox" id="aonly"> 견본 있는 것만</label>
      ${markBox()}
      ${S.asset || !FS_OK ? '' :
        `<button class="btn i" id="pdir" title="${DIR?'폴더 연결됨 · 다시 고르기':'작가샘플 폴더를 열어 서버 없이 저장하기'}">${DIR?'📂':'📁'}</button>`}
      <span class="sp"></span>
      ${S.static?'':'<button class="btn i" id="padd" title="추가 (줄을 더블클릭하면 고칩니다)">＋</button>'}
    </div>
    <div id="form"></div>
    <div id="arows"></div>`;
  const run=()=>{
    const q=$('#aq').value.trim().toLowerCase(), only=$('#aonly').checked;
    let r=rows;
    if(q) r=r.filter(x=>x.tags.join(' ').toLowerCase().includes(q));
    if(only) r=r.filter(x=>idx[slugOf(x.tags[0])]);
    if(onlyMark) r=r.filter(x=>x.tags.some(marked));
    $('#arows').innerHTML = tbl(['태그','남캐','여캐','비고|opt meta'], '', true);
    const table = $('#arows').querySelector('table');
    wireGrid($('#arows'), 'artist', '#abar');
    /* 견본 그림이 무거워 한 번에 30줄씩 */
    lazyRows($('#arows'), r, (x,i)=>{
      const tag=x.tags[0], sl=slugOf(tag), got=idx[sl]||{};
      const cell=sex=>`<td class="samp" tabindex="0" data-slug="${esc(sl)}" data-sex="${sex}">`
        + (got[sex]
            ? (DIR ? `<img data-f="${esc(got[sex])}" alt="${esc(tag)} ${sex}">`
                   : `<img src="${esc(ROOT+SAMPLE_DIR+'/'+got[sex])}" alt="${esc(tag)} ${sex}" loading="lazy">`)
            : `<span class="drop">${esc(sl)}_${sex}<br><span class="muted">끌어놓기 · 눌러서 ${PASTE_KEY}</span></span>`)
        + `</td>`;
      return `<tr data-i="${i}"><td class="wrap">${tagCell(tag)}</td>${cell('남')}${cell('여')}
        <td class="muted opt meta">${esc(x.note)}</td></tr>`;
    }, 30, ()=>{ applyHidden(table,'artist'); wireDrop(idx); });
    $('#arows').ondblclick = e => {
      if(S.static || e.target.closest('.tag') || e.target.closest('.samp')) return;
      const tr = e.target.closest('tr'); if(!tr) return;
      openRowForm($('#form'), 'artist', r[+tr.dataset.i].src, ()=>dictArtist());
    };
  };
  ['#aq','#aonly'].forEach(x=>{const e=$(x); e.oninput=e.onchange=run;});
  wireMarkBox(run);
  if($('#padd')) $('#padd').onclick=()=>openRowForm($('#form'),'artist',null,()=>dictArtist());
  if($('#pdir')) $('#pdir').onclick=dirPick;
  run();
}
/* 견본을 칸에 넣는 길은 둘이다: 끌어놓기, 그리고 칸을 눌러 고른 뒤 붙여넣기.
   화면 갈무리는 클립보드에만 있다. 끌어놓을 파일이 아예 없다. */
const PASTE_KEY = /Mac|iP(hone|ad)/.test(navigator.platform||'') ? '⌘V' : 'Ctrl+V';
/* 붙여넣은 그림에는 파일명이 없다. 확장자를 MIME 에서 되찾는다 */
const EXT_OF = {'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp',
                'image/gif':'.gif','image/avif':'.avif'};
const SAMPLE_MAX = 10 * 1024 * 1024;   /* serve.mjs 의 SAMPLE_MAX 와 같은 값 */
let PICK = null;   /* 붙여넣기를 받을 칸 {slug,sex} · 표를 다시 그려도 남는다 */
let SAMP = null;   /* 지금 그려진 표의 견본 색인 */

/* 표에서는 158px 로 보이고, 이 파일은 저장소에 커밋된다.
   화면 갈무리 PNG 를 원본 그대로 넣을 이유가 없다. 보내기 전에 줄인다. */
const SAMPLE_PX = 900;          /* 긴 변 · 보이는 크기의 대여섯 배면 충분하다 */
const SAMPLE_Q  = 0.86;
const kb = n => (n/1024).toFixed(0)+'KB';

/* 브라우저가 못 굽는 형식을 넘기면 toBlob 은 말없이 PNG 를 돌려준다.
   달라는 걸 줬는지 blob.type 으로 확인한다. 이름만 .webp 인 PNG 를 만들지 않으려고. */
async function encode(cv, type){
  const blob = await new Promise(r => cv.toBlob(r, type, SAMPLE_Q));
  return blob && blob.type === type ? blob : null;
}

async function shrink(file){
  if(file.type === 'image/gif') return null;      /* 움직이는 걸 한 장으로 뭉개지 않는다 */
  try{
    const bmp = await createImageBitmap(file, {imageOrientation:'from-image'});
    const k = Math.min(1, SAMPLE_PX / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width*k), h = Math.round(bmp.height*k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    /* webp 가 제일 작다. 못 구우면 jpeg. PNG 로 흘러가게 두지 않는다 — 사진에는 최악이다 */
    const blob = await encode(cv,'image/webp') || await encode(cv,'image/jpeg');
    /* 이미 작고 잘 눌린 원본을 굳이 다시 굽지 않는다 */
    return blob && blob.size < file.size ? blob : null;
  }catch{ return null; }                          /* 못 줄이면 원본으로 간다 */
}

/* ── 폴더 권한 ────────────────────────────────
   웹페이지는 제 마음대로 디스크에 못 쓴다. 서버가 대신 받아 주거나,
   사람이 폴더를 열어 주거나 둘 중 하나다. 후자가 File System Access API 다.
   한 번 고르면 권한이 남아서, 다음부터는 서버 없이 붙여넣기만 하면 된다.
   Chrome·Edge 에만 있다. Safari·Firefox 는 서버로 띄워야 한다. */
const FS_OK = typeof window.showDirectoryPicker === 'function';
let DIR = null;                 /* 작가샘플 폴더 손잡이 */
const BLOB = {};                /* 파일이름 → blob URL · 폴더 모드에서 그림을 그린다 */

/* 손잡이는 문자열이 아니라 객체다. localStorage 가 아니라 IndexedDB 에 넣는다 */
function idb(mode, fn){
  return new Promise((res, rej) => {
    const r = indexedDB.open('luvheil', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const q = fn(r.result.transaction('kv', mode).objectStore('kv'));
      q.onsuccess = () => res(q.result);
      q.onerror   = () => rej(q.error);
    };
  });
}

async function dirScan(){                      /* 폴더에 실제로 있는 견본 목록 */
  const names = [];
  for await (const [n, h] of DIR.entries())
    if(h.kind === 'file' && /\.(webp|png|jpe?g|gif|avif)$/i.test(n)) names.push(n);
  S.samples = names;
}

async function dirUse(h, ask){
  const mode = {mode:'readwrite'};
  let ok = await h.queryPermission(mode);
  if(ok !== 'granted' && ask) ok = await h.requestPermission(mode);   /* 클릭 안에서만 통한다 */
  if(ok !== 'granted') return false;
  DIR = h; await dirScan(); return true;
}

async function dirPick(){
  try{
    const h = await showDirectoryPicker({id:'luvheil-samples', mode:'readwrite'});
    if(!await dirUse(h, true)) return toast('쓰기 권한을 못 받았습니다', true);
    await idb('readwrite', st => st.put(h, 'sampledir'));
    toast(`폴더 연결됨 · 견본 ${S.samples.length}장 · 이제 서버 없이 저장한다`);
    drawDict();
  }catch(e){ if(e.name !== 'AbortError') toast('폴더를 열지 못했습니다: '+e.message, true); }
}

/* 새로고침하면 권한이 'prompt' 로 돌아와 있을 수 있다. 그때는 버튼을 다시 눌러 줘야 한다 */
async function dirRestore(){
  if(!FS_OK || S.asset) return;
  try{
    const h = await idb('readonly', st => st.get('sampledir'));
    if(h) await dirUse(h, false);
  }catch{}
}

/* 커밋 전 그림은 주소로 못 부른다. 폴더에서 읽어 blob 으로 건다 */
async function sampSrc(name, known){
  if(!DIR) return ROOT + SAMPLE_DIR + '/' + name + '?t=' + Date.now();
  if(BLOB[name]) URL.revokeObjectURL(BLOB[name]);
  const blob = known || await (await DIR.getFileHandle(name)).getFile();
  return BLOB[name] = URL.createObjectURL(blob);
}

/* 서버가 하던 뒷정리를 폴더 모드에서도 한다: 같은 칸의 옛 확장자 파일을 치운다 */
async function dirWrite(name, blob){
  const w = await (await DIR.getFileHandle(name, {create:true})).createWritable();
  await w.write(blob); await w.close();
  const stem = name.slice(0, name.lastIndexOf('.'));
  const gone = [];
  for await (const [n, h] of DIR.entries()){
    if(n === name || h.kind !== 'file') continue;
    const i = n.lastIndexOf('.');
    if(i > 0 && n.slice(0, i) === stem && /\.(webp|png|jpe?g|gif|avif)$/i.test(n)){
      await DIR.removeEntry(n); gone.push(n);
    }
  }
  return gone;
}

async function putSample(td, file){
  if(!file || !SAMP) return;
  if(!S.asset && !DIR){
    toast(FS_OK ? '먼저 「폴더 연결」 을 눌러 작가샘플 폴더를 열어 주세요'
                : '이 브라우저는 폴더 쓰기가 안 됩니다. Chrome 으로 열거나 서버로 띄우세요', true);
    return;
  }
  const small = await shrink(file);
  const src   = small || file;
  const ext   = EXT_OF[src.type]
              || (String(src.name||'').match(/\.[^.]+$/)||['.png'])[0].toLowerCase();
  const name  = `${td.dataset.slug}_${td.dataset.sex}${ext}`;
  if(src.size > SAMPLE_MAX){ toast(`${kb(src.size)} · 10MB 를 넘어 못 넣습니다`, true); return; }
  let removed;
  if(S.asset){
    const data = await new Promise(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(src); });
    const res  = await post('_asset', {name, data});
    if(!res.ok){ toast('저장 실패: '+await res.text(), true); return; }
    removed = (await res.json().catch(()=>({}))).removed || [];
  } else {
    try{ removed = await dirWrite(name, src); }
    catch(e){ toast('저장 실패: '+e.message, true); return; }
  }
  /* 같은 칸의 옛 확장자 파일이 치워졌다면 목록에서도 뺀다 */
  const dead = new Set([name, ...removed]);
  S.samples = (S.samples||[]).filter(f=>!dead.has(f)).concat(name);
  (SAMP.idx[td.dataset.slug] ||= {})[td.dataset.sex] = name;
  /* 표를 다시 그리면 30줄씩 새로 깔리면서 스크롤이 맨 위로 튄다.
     바뀐 건 이 칸 하나다. 이 칸만 바꾼다. */
  td.innerHTML = `<img alt="${esc(name)}">`;
  td.querySelector('img').src = await sampSrc(name, src);
  toast(name + ' 저장됨 · ' + (small ? `${kb(file.size)} → ${kb(small.size)}` : kb(file.size)));
}

/* 붙여넣기는 칸이 아니라 문서가 받는다. 표를 다시 그려도 살아 있게 한 번만 건다.
   조용히 실패하지 않는다: 그림이 없으면 없다고, 칸을 안 골랐으면 고르라고 말한다. */
document.addEventListener('paste', onPaste, true);

function onPaste(e){
  if(e.defaultPrevented) return;        /* 문서가 먼저 받아 처리했다. 두 번 올리지 않는다 */
  const list = [...(e.clipboardData?.items||[])];
  const item = list.find(i=>i.kind==='file' && i.type.startsWith('image/'));
  const kinds = list.map(i=>i.kind+':'+(i.type||'?')).join(' ') || '빈 클립보드';
  console.log('[견본] 붙여넣기', {칸:PICK, 클립보드:kinds});
  if(!item){
    if(PICK) toast('클립보드에 그림이 없습니다 — '+kinds, true);
    return;                             /* 검색창에 글자 붙여넣는 건 그냥 지나간다 */
  }
  if(!PICK){ toast('넣을 칸을 먼저 누르세요', true); return; }
  const td = $(`#arows td.samp[data-slug="${PICK.slug}"][data-sex="${PICK.sex}"]`);
  if(!td){ toast('고른 칸이 화면에서 사라졌습니다. 다시 누르세요', true); PICK=null; return; }
  e.preventDefault();
  putSample(td, item.getAsFile());
}
document.addEventListener('keydown', e => { if(e.key==='Escape') unpick(); });

function unpick(){
  PICK = null;
  document.querySelectorAll('#arows td.samp.pick').forEach(x=>x.classList.remove('pick'));
}

function wireDrop(idx){
  SAMP = {idx};
  /* 폴더 모드의 그림은 주소가 없다. 줄이 깔린 뒤에 하나씩 blob 을 물린다 */
  if(DIR) $('#arows').querySelectorAll('img[data-f]').forEach(async img=>{
    const f = img.dataset.f; delete img.dataset.f;
    try{ img.src = BLOB[f] || await sampSrc(f); }catch{}
  });
  $('#arows').querySelectorAll('td.samp').forEach(td=>{
    if(PICK && td.dataset.slug===PICK.slug && td.dataset.sex===PICK.sex) td.classList.add('pick');
    td.ondragover  = e => { e.preventDefault(); td.classList.add('over'); };
    td.ondragleave = () => td.classList.remove('over');
    td.ondrop = e => {
      e.preventDefault(); td.classList.remove('over');
      putSample(td, (e.dataTransfer.files||[])[0]);
    };
    /* 한 번 누르면 붙여넣을 칸이 되고, 두 번 누르면 그림을 새 탭에서 연다 */
    td.onclick = () => {
      unpick();
      td.classList.add('pick');
      td.focus();                       /* 붙여넣기가 어디로 갈지 브라우저에게 못박는다 */
      PICK = {slug:td.dataset.slug, sex:td.dataset.sex};
      toast(`${PICK.slug}_${PICK.sex} · ${PASTE_KEY} 로 붙여넣기`);
    };
    td.onpaste = onPaste;               /* 칸이 포커스를 쥔 경우의 지름길 */
    td.ondblclick = () => {
      const img = td.querySelector('img'); if(img) window.open(img.src,'_blank');
    };
  });
}

function dictStyle(){
  const rows = S.tags.filter(r=>r.p==='style');
  $('#dbody').innerHTML = `<div class="bar" id="sbar">
      <input class="ctl" type="search" id="sq" placeholder="태그 · 뜻 검색">
      ${markBox()}
      <select class="ctl" id="sg"><option value="">분류 전체</option>
        ${[...new Set(rows.map(r=>r.g))].sort().map(g=>`<option>${esc(g)}</option>`).join('')}</select>
      <span class="sp"></span>
      ${S.static?'':'<button class="btn i" id="padd" title="추가 (줄을 더블클릭하면 고칩니다)">＋</button>'}
    </div><div id="form"></div><div id="srows"></div>`;
  const run=()=>{
    const q=$('#sq').value.trim().toLowerCase(), g=$('#sg').value;
    let r=rows;
    if(g) r=r.filter(x=>x.g===g);
    if(q) r=r.filter(x=>(x.tags.join(' ')+' '+x.ko).toLowerCase().includes(q));
    if(onlyMark) r=r.filter(x=>x.tags.some(marked));
    $('#srows').innerHTML = tbl(['분류|opt2 meta','세부|opt meta','태그','뜻'], '', true);
    const table = $('#srows').querySelector('table');
    wireGrid($('#srows'), 'style', '#sbar');
    lazyRows($('#srows'), r, (x,i)=>`<tr data-i="${i}">
      <td class="muted opt2 meta">${esc(x.g)}</td><td class="muted opt meta">${esc(x.s)}</td>
      <td class="wrap">${x.tags.map(t=>tagCell(t)).join(' ')}</td>
      <td class="wrap">${esc(x.ko)}</td></tr>`,
      120, ()=>applyHidden(table,'style'));
    $('#srows').ondblclick = e => {
      if(S.static || e.target.closest('.tag')) return;
      const tr = e.target.closest('tr'); if(!tr) return;
      openRowForm($('#form'), 'style', r[+tr.dataset.i].src, ()=>dictStyle());
    };
  };
  ['#sq','#sg'].forEach(x=>{const e=$(x); e.oninput=e.onchange=run;});
  wireMarkBox(run);
  if($('#padd')) $('#padd').onclick=()=>openRowForm($('#form'),'style',null,()=>dictStyle());
  run();
}

/* ── 저장한 것: 만든 자리 바로 아래 ────────── */
function draftSection(kind, host){
  const label = kind==='final' ? '완성본' : PART_NAME[kind];
  const list = savedParts().filter(p=>kind==='final' ? p.kind==='final' : p.kind===kind);
  $(host).innerHTML = `<h3>저장한 ${label} <span class="muted" style="font-weight:400">${list.length}개</span></h3>`
    + (list.length ? list.map(p=>cardHTML(p.path)).join('')
       : '<p class="empty">아직 없습니다.</p>');
  wireDraftCards($(host), ()=>draftSection(kind, host));
}
/* 카드의 열기·복사·저장·삭제: 작업중 탭과 같은 동작 */
function wireDraftCards(host, redraw){
  host.onclick = e => {
    const card = e.target.closest('.card'); if(!card) return;
    const path = card.dataset.p, act = e.target.dataset.a;
    if(act==='copy'){ copy(S.md[path]||'', card.dataset.n); return; }
    if(act==='del'){
      if(!confirm(`${pretty(path)} 를 지울까요? 되돌릴 수 없습니다.`)) return;
      post('_delete',{path}).then(async r=>{
        if(r.ok){ dropFile(path); redraw(); toast(pretty(path)+' 삭제됨'); }
        else toast('삭제 실패: '+await r.text(), true);
      }).catch(()=>toast('삭제 실패: 쓰기를 지원하지 않는 서버입니다', true));
      return;
    }
    if(act==='save'){
      const ta = card.querySelector('textarea');
      post('_edit',{path, content:ta.value}).then(async r=>{
        if(r.ok){ S.md[path]=ta.value; toast(pretty(path)+' 저장됨'); }
        else toast('저장 실패: '+await r.text(), true);
      }).catch(()=>toast('저장 실패: 쓰기를 지원하지 않는 서버입니다', true));
      return;
    }
    if(act==='close'){ card.classList.remove('open'); return; }
    if(e.target.closest('.nm') || act==='open') card.classList.toggle('open');
  };
}


/* ── 사전 고치기 ─────────────────────────────
   AI가 지어낸 태그를 걸러내려면 사전이 맞아야 하고, 맞추려면 여기서 고칠 수 있어야 한다.
   CSV 를 그대로 다시 써내므로 터미널에서 연 것과 같은 파일이 된다. */
const CSV_OF = { plain:'1-태그사전', style:'1-스타일태그', artist:'1-작가태그' };
const CSV_COLS = {
  plain:  ['시트','분류1','분류2','한글명','태그','NSFW','비고'],
  style:  ['분류','세부','태그','설명','비고'],
  artist: ['섹션','태그','네거티브_추천'],
};
const csvPath = which => S.files.find(f=>f.endsWith(CSV_OF[which]+'.csv')) || '';

function toCSV(cols, rows){
  const q = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
  return '﻿' + [cols.join(','), ...rows.map(r=>cols.map(c=>q(r[c])).join(','))].join('\n') + '\n';
}
/* 원본 배열(S.dict·S.style·S.artist)을 고쳐 파일로 되쓴다 */
async function csvSave(which){
  const path = csvPath(which);
  const src = ({plain:S.dict, style:S.style, artist:S.artist})[which];
  if(!path){ toast('원본 파일을 못 찾았습니다', true); return false; }
  const r = await post('_edit', {path, content: toCSV(CSV_COLS[which], src)});
  if(!r.ok){ toast('저장 실패: '+await r.text(), true); return false; }
  buildTags();                       /* 통합 표를 다시 만든다 */
  toast(pretty(path)+' 저장됨');
  return true;
}

/* 한 줄을 고치거나 새로 넣는 폼. row 가 없으면 새 줄. */
function rowForm(which, row){
  const cols = CSV_COLS[which];
  const pick = { '시트':[...new Set(S.dict.map(r=>r['시트']))],
                 '분류':[...new Set(S.style.map(r=>r['분류']))],
                 '섹션':[...new Set(S.artist.map(r=>r['섹션']))] };
  return `<div class="rowform">
    ${cols.map(c=>{
      const v = row ? (row[c]||'') : '';
      if(c==='NSFW'||c==='네거티브_추천')
        return `<label class="rf"><span>${esc(c)}</span>
          <select class="ctl" data-c="${esc(c)}">
            <option value=""></option>
            <option${v==='TRUE'?' selected':''}>TRUE</option>
            <option${v==='FALSE'?' selected':''}>FALSE</option>
            <option${v==='Y'?' selected':''}>Y</option></select></label>`;
      if(pick[c]) return `<label class="rf"><span>${esc(c)}</span>
          <input class="ctl" list="dl-${esc(c)}" data-c="${esc(c)}" value="${esc(v)}">
          <datalist id="dl-${esc(c)}">${pick[c].map(x=>`<option>${esc(x)}</option>`).join('')}</datalist></label>`;
      return `<label class="rf"><span>${esc(c)}</span>
          <input class="ctl" data-c="${esc(c)}" value="${esc(v)}"></label>`;
    }).join('')}
    <div class="rfbar">
      <button class="btn pri" data-a="ok">${row?'고치기':'추가'}</button>
      <button class="btn" data-a="cancel">취소</button>
      ${row?'<button class="btn danger" data-a="rm">이 줄 삭제</button>':''}
    </div>
  </div>`;
}
/* 폼을 열고 저장까지: done() 은 목록을 다시 그린다 */
function openRowForm(host, which, row, done){
  host.innerHTML = rowForm(which, row);
  host.onclick = async e => {
    const b = e.target.closest('button[data-a]'); if(!b) return;
    if(b.dataset.a==='cancel'){ host.innerHTML=''; return; }
    const src = ({plain:S.dict, style:S.style, artist:S.artist})[which];
    if(b.dataset.a==='rm'){
      if(!confirm('이 줄을 지울까요?')) return;
      const i=src.indexOf(row); if(i>=0) src.splice(i,1);
      if(await csvSave(which)){ host.innerHTML=''; done(); }
      return;
    }
    const o = {};
    host.querySelectorAll('[data-c]').forEach(el=>o[el.dataset.c]=el.value.trim());
    if(!o['태그']){ toast('태그는 비울 수 없습니다', true); return; }
    if(row) Object.assign(row, o); else src.push(o);
    if(await csvSave(which)){ host.innerHTML=''; done(); }
  };
  const first = host.querySelector('input'); if(first) first.focus();
}

/* ── 퀄리티·부정 프리셋 ───────────────────────
   Q·N 은 그림체의 절반인데 그동안 문서로만 볼 수 있었다. 여기서 고치고 더한다.
   정본은 03_프롬프트/이미지/스타일프리셋/ 두 파일이다. 그 파일을 직접 다시 쓴다. */
const PRESET_FILE = {
  Q: f=>/스타일프리셋\/퀄리티/.test(f),
  N: f=>/스타일프리셋\/부정/.test(f),
};
const presetPath = k => S.files.find(PRESET_FILE[k]) || '';

function drawPresets(){
  const cur = subGet('preset','Q');
  const name = cur==='Q' ? '퀄리티' : '부정';
  const map = S.presets[cur];
  const keys = Object.keys(map);
  $('#dbody').innerHTML = `<div class="bar">
      ${segHTML('pseg', [['Q','퀄리티 Q'],['N','부정 N']], cur)}
      <span class="sp"></span>
      ${S.static?'':`<button class="btn i" id="padd" title="추가 (줄을 더블클릭하면 고칩니다)">＋</button>`}
    </div>
    <div id="pform"></div>
    ${keys.map(k=>`<div class="card preset" data-k="${esc(k)}">
      <div class="row">
        <span class="kindbadge">${esc(k)}</span>
        <span class="nm">${esc((S.presetTitle||{})[k]||'')}</span>
        <span class="acts">
          <button data-a="copy" title="복사">⧉</button>
          ${S.static?'':'<button data-a="edit" title="수정">✎</button><button class="del" data-a="rm" title="삭제">✕</button>'}
        </span>
      </div>
      <pre>${esc(map[k])}</pre>
    </div>`).join('') || '<p class="empty">프리셋이 없습니다.</p>'}`;
  $('#pseg').onclick = e => { const b=e.target.closest('button'); if(!b) return;
    subSet('preset', b.dataset.k); drawPresets(); };
  if($('#padd')) $('#padd').onclick = ()=>presetForm(cur, '');
  $('#dbody').addEventListener('click', e=>{
    const card=e.target.closest('.card.preset'); if(!card) return;
    const k=card.dataset.k, a=e.target.dataset.a;
    if(a==='copy') copy(map[k], k);
    if(a==='edit') presetForm(cur, k);
    if(a==='rm' && confirm(`${k} 를 지울까요?`)) presetWrite(cur, k, null, null);
  });
}
function presetForm(kind, key){
  const map=S.presets[kind];
  const next = key || (kind+((Math.max(0,...Object.keys(map).map(k=>+k.slice(1)||0)))+1));
  $('#pform').innerHTML = `<div class="rowform">
    <label class="rf"><span>번호</span><input class="ctl" id="pk" value="${esc(key||next)}"></label>
    <label class="rf"><span>이름</span><input class="ctl" id="pt"
      value="${esc((S.presetTitle||{})[key]||'')}" placeholder="예: 눈·피부 강조형"></label>
    <label class="rf" style="flex:1 1 100%"><span>프롬프트</span>
      <textarea id="pv" spellcheck="false">${esc(key?map[key]:'')}</textarea></label>
    <div class="rfbar">
      <button class="btn pri" id="pok">${key?'고치기':'추가'}</button>
      <button class="btn" id="pcancel">취소</button>
    </div></div>`;
  $('#pcancel').onclick=()=>{ $('#pform').innerHTML=''; };
  $('#pok').onclick=()=>presetWrite(kind, key, $('#pk').value.trim(), $('#pv').value.trim(), $('#pt').value.trim());
}
/* 파일을 다시 쓴다. body 가 null 이면 그 절을 지운다. */
async function presetWrite(kind, oldKey, newKey, body, title){
  const path = presetPath(kind);
  if(!path){ toast('정본 파일을 못 찾았습니다', true); return; }
  let src = S.md[path]||'';
  const sec = k => new RegExp(`^## ${k}\\\\b[\\\\s\\\\S]*?(?=\\\\n## |$)`, 'm');
  if(body===null){
    src = src.replace(sec(oldKey), '').replace(/\\n{3,}/g,'\n\n');
  } else {
    const block = `## ${newKey}${title?': '+title:''}\n\`\`\`\n${body}\n\`\`\`\n`;
    src = oldKey && sec(oldKey).test(src) ? src.replace(sec(oldKey), block)
                                          : src.replace(/\s*$/, '\n\n'+block);
  }
  const r = await post('_edit', {path, content: src});
  if(!r.ok){ toast('저장 실패: '+await r.text(), true); return; }
  S.md[path]=src; loadPresets(); $('#pform').innerHTML=''; drawPresets();
  toast(body===null ? `${oldKey} 삭제됨` : `${newKey} 저장됨`);
}


/* ── 태그조합 ─ 파츠를 짜는 자리 ───────────── */
function drawCombo(){
  const cur = subGet('combo','style');
  $('#main').innerHTML = `<div class="bar">${segHTML('cseg', COMBO, cur)}
    </div>
    <div id="cbody"></div>
    <div id="cdrafts" style="margin-top:26px"></div>`;
  $('#cseg').onclick = e => { const b=e.target.closest('button'); if(!b) return;
    subSet('combo', b.dataset.k); drawCombo(); };
  if(cur==='style') drawStyle('#cbody'); else drawPart(cur, '#cbody');
  draftSection(cur, '#cdrafts');
}

/* ── 최종 ─ 파츠를 합치는 자리 ─────────────── */
function drawFinal(){
  $('#main').innerHTML = `<div id="fbody"></div><div id="fdrafts" style="margin-top:26px"></div>`;
  drawAssemble('#fbody');
  draftSection('final', '#fdrafts');
}

/* ── 파츠 ────────────────────────────────────
   프롬프트는 한 덩어리로 짜지 않는다. 성격이 다른 네 묶음을 따로 만들어 두고 조립한다.

     ① 그림체  작가태그 6단 + 모델·설정 + 퀄리티/부정: 한 번 깎으면 계속 쓴다
     ② 외형    그 캐릭터를 그 캐릭터이게 하는 것: 캐릭터당 하나
     ③ 의상    옷 + 장신구: 같은 캐릭터라도 자주 바뀐다
     ④ 장면    구도 · 상황 · 행동 · 마무리: 캐릭터를 안 가리고 재사용

   ②③④ 는 26슬롯을 갈라 가진다. 슬롯 번호가 곧 최종 태그 순서라,
   조립할 때는 묶음을 이어 붙이는 게 아니라 **슬롯 번호로 다시 섞어야** 한다
   (장면의 00·03 은 외형의 04 보다 앞에 와야 한다).
   근거: 02_템플릿/이미지/01 (26슬롯) · 03_프롬프트/이미지/README (조립 공식) */
const PART_SLOTS = {
  look:  [1,4,5,6,7,9],
  /* 02 캐릭터는 장면 쪽이다. 원작 캐릭터 이름(mash kyrielight)이나 관계는
     내 캐릭터의 고정 외형이 아니라 이 그림에서만 쓰는 것이다.
     같은 캐릭터를 두고 그림마다 갈아끼운다. */
  wear:  [14,15,16,17,18,19,20,21,22,23],
  scene: [0,2,3,8,10,11,12,13,24,25,26],
};
const PART_NAME = { style:'그림체', look:'외형', wear:'의상', scene:'장면', final:'완성본' };
const SLOT_PART = {};
for(const [k,ns] of Object.entries(PART_SLOTS)) for(const n of ns) SLOT_PART[n]=k;

/* 작가 태그 출력 구조: 02_템플릿/이미지/02. 순서 변경 금지. */
const STYLE_ROWS = [
  ['meta',  '메타',  'Art style 계열 · 스타일태그에서'],
  ['tone',  '화풍',  'Medium · Art style · 스타일태그에서'],
  ['artist','작가',  'artist:이름 · 쉼표로 나열'],
  ['year',  '년도',  'year 2023 · late 2023'],
  ['comp',  '구도',  '⚠ 시험용: 최종 조립에서는 장면이 이 자리를 맡는다'],
];

/* ── 파츠별 태그 사전 ─────────────────────────
   파츠마다 쓰는 태그 갈래가 정해져 있다. 의상을 짜는 중에 작가 태그가 보일 이유가 없고,
   그림체를 깎는 중에 의상 태그가 보일 이유도 없다. 목적을 파츠에 붙여 사전을 갈라 둔다. */
const PART_PURPOSE = {
  style: ['artist','style'],              /* 그림체: 작가 · 매체 · 색상 · 특수효과 */
  look:  ['who','look'],                  /* 외형: 인원·인종·직업 · 얼굴·머리·체형 */
  wear:  ['wear'],                        /* 의상: 옷 · 장신구 */
  scene: ['scene','act','adult','cast'],  /* 장면: 배경·연출 · 동작·표정 · 상황 · 등장·원작 */
};

/* 파츠 화면 위쪽에 붙는 사전. 누르면 담지 않고 **그 자리에 바로 넣는다.** */
function pickerHTML(kind){
  const ps = PART_PURPOSE[kind];
  return `<details class="pick-wrap" ${localStorage.getItem('char.pk.'+kind)==='0'?'':'open'} id="pkw">
    <summary>태그 찾기</summary>
    <div class="bar" style="margin:10px 0 8px">
      <input class="ctl" type="search" id="pq" placeholder="한글명 · 태그 검색">
      ${ps.length>1?`<select class="ctl" id="pp"><option value="">갈래 전체</option>${
        ps.map(k=>`<option value="${k}">${esc(PNAME[k])}</option>`).join('')}</select>`:''}
      <select class="ctl" id="pg"></select>
      ${S.tags.some(r=>ps.includes(r.p) && r.nsfw)
        ? '<label class="muted"><input type="checkbox" id="psfw" checked> NSFW 숨김</label>' : ''}
    </div>
    <div class="pickrows" id="prows"></div>
  </details>`;
}
/* onPick(태그, 슬롯): 파츠가 어디에 넣을지 정한다 */
function wirePicker(kind, onPick){
  const ps = PART_PURPOSE[kind];
  const el = id => $('#'+id);
  el('pkw').ontoggle = () => localStorage.setItem('char.pk.'+kind, el('pkw').open?'1':'0');
  const scope = () => {
    const p = el('pp') ? el('pp').value : '';
    return S.tags.filter(r=>(p?r.p===p:ps.includes(r.p)));
  };
  const syncG = () => {
    const cur = el('pg').value;
    const list = [...new Set(scope().map(r=>r.g).filter(Boolean))].sort();
    el('pg').innerHTML = '<option value="">분류 전체</option>'
      + list.map(v=>`<option${v===cur?' selected':''}>${esc(v)}</option>`).join('');
  };
  const run = () => {
    const q = el('pq').value.trim().toLowerCase(), g = el('pg').value;
    const sfw = el('psfw') ? el('psfw').checked : false;
    let r = scope();
    if(g) r = r.filter(x=>x.g===g);
    if(q) r = r.filter(x=>(x.ko+' '+x.tags.join(' ')+' '+x.g+' '+x.s).toLowerCase().includes(q));
    if(sfw) r = r.filter(x=>!x.nsfw);
    el('prows').innerHTML = r.length ? ''
      : '<p class="muted" style="padding:12px">해당하는 태그가 없습니다.</p>';
    lazyRows(el('prows'), r, (x,i)=>`<div class="pr" data-i="${i}">
        <span class="pk">${esc(x.g)}${x.s?' · '+esc(x.s):''}</span>
        <span class="pv">${esc(x.ko)}</span>
        <span class="pt">${x.tags.map(t=>tagCell(t,'pick')).join(' ')}</span>
        ${x.nsfw?'<span class="nsfw">NSFW</span>':''}
      </div>`, 60);
    /* 누른 행을 그대로 넘긴다. 글자로 다시 찾으면 같은 이름의 다른 행을 집는다 */
    el('prows').onclick = e => {
      const t = e.target.closest('.tag'); if(!t) return;
      onPick(t.dataset.t, slotOf(r[+e.target.closest('.pr').dataset.i]));
    };
  };
  if(el('pp')) el('pp').onchange = () => { syncG(); run(); };
  el('pg').onchange = run;
  el('pq').oninput = run;
  if(el('psfw')) el('psfw').onchange = run;
  syncG(); run();
}

/* ── 담기 ───────────────────────────────────
   태그를 누르면 26슬롯 중 어디로 갈지 추측해 담는다.
   목적·분류를 이미 알고 있으므로 태그 글자를 훑을 필요가 없다. */
const SLOT_BY_CAT = {
  scene:{ '배경':24,'장소':24,'테마':24,'연출':26,'작화':26,'품질':26,'초점':0 },
  who:  { '인원':1,'인종':9,'종족':9,'직업':9,'특징':9 },
  cast: { '인물':2,'작품':2,'캐릭터':2 },
  look: { '얼굴':4,'눈':4,'입':4,'코':4,'귀':4,'피부':4,'머리':5,'머리카락':5,
          '가슴':6,'몸':6,'팔':6,'손':6,'날개':6,'다리':7,'발':7,'꼬리':7 },
  wear: { '상의':17,'하의':19,'속옷':19,'신발':23,'의상':14,
          '머리 장식':20,'목 장식':20,'귀 장식':20,'눈 장식':20,'얼굴 장식':20,
          '손 장식':21,'기타':21 },
  act:  { '동명사':12,'동사':12,'얼굴':13,'눈':13,'입':13,'혀':13,'코':13 },
  ip:   { '작품':2,'캐릭터':2 },
  adult:{ },
};
/* 행을 알고 있을 때: 목적과 분류가 그대로 있으므로 이게 정확하다 */
function slotOf(r){
  if(r.p==='artist' || r.p==='style') return -1;      /* 그림체로 간다 */
  if(r.p==='adult') return 10;
  const m = (SLOT_BY_CAT[r.p]||{})[r.g];
  if(m!=null) return m;
  return r.p==='act' ? 12 : r.p==='wear' ? 14 : r.p==='look' ? 4
       : r.p==='who' ? 9 : r.p==='cast' ? 2 : 0;
}
/* 태그 글자만 아는 경우(담기). 같은 글자가 여러 시트에 있으면 첫 행을 쓴다.
   그래서 파츠 피커는 이걸 쓰지 않고 누른 행을 그대로 넘긴다
   (`face` 는 외형에도 장면에도 있어서 글자만 보면 엉뚱한 슬롯이 나온다). */
function guessSlot(t){
  const r = S.tags.find(x=>x.tags.includes(t));
  return r ? slotOf(r) : 0;
}
function add(t){
  if(!S.cart.some(c=>c.t===t)){ S.cart.push({t, s:guessSlot(t)}); saveCart(); }
  /* 담는 김에 클립보드에도 넣는다. 한 개만 쓸 거면 패널까지 갈 이유가 없다.
     담긴 것과 복사된 것이 어긋나지 않게, 앱이 내보내는 그대로(언더바 포함) 복사한다. */
  if(navigator.clipboard)
    navigator.clipboard.writeText(t).then(()=>toast(t+' 담음 · 복사됨'),
                                          ()=>toast(t+' 담음'));
  else toast(t+' 담음');
}
function drawCart(){
  $('#cn').textContent=S.cart.length;
  $('#clist').innerHTML = S.cart.map((c,i)=>`<div class="ci">
    <select onchange="S.cart[${i}].s=+this.value;saveCart()">
      <option value="-1"${c.s===-1?' selected':''}>: 그림체</option>
      ${SLOTS.map((s,n)=>`<option value="${n}"${c.s===n?' selected':''}>${esc(s)}</option>`).join('')}
    </select><span class="t" title="${esc(c.t)}">${esc(c.t)}</span>
    <button class="x" onclick="S.cart.splice(${i},1);saveCart()">✕</button></div>`).join('')
    || '<p class="muted" style="padding:14px">태그 탭에서 태그를 눌러 담으세요.</p>';
  if(S.tab==='combo') drawCombo();
}
const saveCart=()=>{ localStorage.setItem('char.cart',JSON.stringify(S.cart)); drawCart(); };
const loadCart=()=>{ try{ S.cart=JSON.parse(localStorage.getItem('char.cart'))||[]; }catch{ S.cart=[]; } drawCart(); };

/* ── 파츠 편집 상태 ─────────────────────────── */
const partKey = k => 'char.part.'+k;
const partLoad = k => { try{ return JSON.parse(localStorage.getItem(partKey(k)))||{}; }catch{ return {}; } };
const partSave = (k,o) => localStorage.setItem(partKey(k), JSON.stringify(o));
/* 담은 태그를 이 파츠가 가진 슬롯으로 옮긴다. 옮긴 것은 담은 목록에서 뺀다. */
function pullCart(kind){
  const d = partLoad(kind), own = new Set(PART_SLOTS[kind]);
  let n = 0;
  S.cart = S.cart.filter(c=>{
    if(!own.has(c.s)) return true;
    const cur = (d[c.s]||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(!cur.includes(c.t)) cur.push(c.t);
    d[c.s] = cur.join(', '); n++; return false;
  });
  partSave(kind,d); saveCart();
  toast(n ? `${n}개를 ${PART_NAME[kind]}에 넣었습니다` : '이 파츠가 가진 슬롯에 담긴 태그가 없습니다');
}
const partText = (kind,d) => PART_SLOTS[kind].slice().sort((a,b)=>a-b)
  .map(n=>(d[n]||'').trim()).filter(Boolean).join(', ');

/* host 를 받는 이유: 태그조합 화면은 두 번째 줄 탭 아래에 편집기를 끼워 넣는다.
   #main 에 직접 그리면 그 탭 줄까지 지워진다. */
function drawPart(kind, host){
  const M = $(host || '#main');
  const d = partLoad(kind);
  const rows = PART_SLOTS[kind].slice().sort((a,b)=>a-b);
  const waiting = S.cart.filter(c=>PART_SLOTS[kind].includes(c.s)).length;
  M.innerHTML = `<div class="bar">
      <strong>${PART_NAME[kind]}</strong>
      <span class="sp"></span>
      <button class="btn" id="pull">담은 태그 넣기${waiting?` (${waiting})`:''}</button>
      <button class="btn i" id="pcopy" title="복사">⧉</button>
      ${saveBar(kind, PART_NAME[kind]+' 이름')}
      <button class="btn i danger" id="pclear" title="비우기">✕</button>
    </div>
    ${pickerHTML(kind)}
    ${rows.map(n=>`<div class="blk">
      <label><span class="cnt">${String(n).padStart(2,'0')}</span> ${esc(SLOTS[n].slice(3))}</label>
      <input class="ctl" style="width:100%" data-s="${n}" value="${esc(d[n]||'')}"
             placeholder="${esc(SLOT_EG[n]||'')}">
    </div>`).join('')}
    <h3>이 파츠</h3><pre id="pout"></pre>`;

  const sync=()=>{
    const o={};
    M.querySelectorAll('input[data-s]').forEach(i=>{ if(i.value.trim()) o[i.dataset.s]=i.value.trim(); });
    partSave(kind,o);
    $('#pout').textContent = partText(kind,o) || ': ';
  };
  M.querySelectorAll('input[data-s]').forEach(i=>i.oninput=sync);
  /* 누른 태그는 그 태그가 속한 슬롯 칸에 바로 들어간다.
     이 파츠가 안 가진 슬롯이면 이 파츠 것이 아니라는 뜻이라 넣지 않는다. */
  wirePicker(kind, (tag, slot)=>{
    const own = PART_SLOTS[kind];
    const n = own.includes(slot) ? slot : null;
    if(n===null){ toast(`${tag} 는 ${PART_NAME[SLOT_PART[slot]]||'다른 파츠'} 쪽입니다`, true); return; }
    const box = M.querySelector(`input[data-s="${n}"]`);
    const cur = box.value.split(',').map(x=>x.trim()).filter(Boolean);
    if(cur.includes(tag)){ toast('이미 있습니다'); return; }
    cur.push(tag); box.value = cur.join(', '); sync();
    toast(`${SLOTS[n].slice(3)} ← ${tag}`);
  });
  $('#pull').onclick  = ()=>pullCart(kind);
  $('#pcopy').onclick = ()=>copy(partText(kind,partLoad(kind)), PART_NAME[kind]);
  $('#pclear').onclick= ()=>{ if(confirm(`${PART_NAME[kind]} 내용을 비울까요?`)){ partSave(kind,{}); drawPart(kind); } };
  wireSave(kind, ()=>partMD(kind, partLoad(kind)), kind);
  sync();
}

/* ── 그림체 ─────────────────────────────────
   작가태그 6단 + 모델·설정 + 퀄리티/부정. 여기까지가 '그깎' 한 판이다. */
const styleKey='char.style';
const styleLoad=()=>{ try{ return JSON.parse(localStorage.getItem(styleKey))||{}; }catch{ return {}; } };
const styleSave=o=>localStorage.setItem(styleKey,JSON.stringify(o));
/* 최종 조립에 들어가는 부분: 구도는 장면이 맡으므로 뺀다 */
function styleText(d, withComp){
  const artists=(d.artist||'').split(',').map(x=>x.trim()).filter(Boolean);
  const collab = d.collab!==false && artists.length>=2 ? '-3::artist collaboration ::' : '';
  return [d.meta, d.tone, artists.join(', '), collab, d.year,
          withComp?d.comp:'', S.presets.Q[d.q]||''].map(x=>(x||'').trim()).filter(Boolean).join(', ');
}
function drawStyle(host){
  const M = $(host || '#main');
  const d = styleLoad();
  const waiting = S.cart.filter(c=>c.s===-1).length;
  const sel=(id,cur,keys,ph)=>`<select class="ctl" id="${id}"><option value="">${ph}</option>${
    keys.map(k=>`<option${k===cur?' selected':''}>${k}</option>`).join('')}</select>`;
  M.innerHTML = `<div class="bar">
      <strong>그림체</strong>
      <span class="sp"></span>
      <button class="btn" id="pull">담은 태그 넣기${waiting?` (${waiting})`:''}</button>
      ${saveBar('style','그림체 이름')}
    </div>
    ${pickerHTML('style')}
    ${STYLE_ROWS.map(([k,n,hint],i)=>`<div class="blk">
      <label><span class="cnt">${i+1}</span> ${n}<span class="hint">${esc(hint)}</span></label>
      <input class="ctl" style="width:100%" data-k="${k}" value="${esc(d[k]||'')}">
    </div>`).join('')}
    <div class="blk"><label><input type="checkbox" id="collab" ${d.collab===false?'':'checked'}>
      작가를 2명 이상 쓰면 <code>-3::artist collaboration ::</code> 붙이기
      <span class="hint">NAI 규칙 · 작가 나열 맨 뒤</span></label></div>
    <div class="sum">
      <div class="it"><span class="k">모델</span>
        <input id="model" style="width:150px" value="${esc(d.model||'')}" placeholder="NAI V4.5 Full"></div>
      <div class="it"><span class="k">Steps</span>
        <input id="steps" type="number" style="width:70px" value="${esc(d.steps||'')}" placeholder="28"></div>
      <div class="it"><span class="k">Guidance</span>
        <input id="cpg" type="number" step="0.1" style="width:70px" value="${esc(d.cpg||'')}" placeholder="5"></div>
      <div class="it"><span class="k">Seed</span>
        <input id="seed" style="width:110px" value="${esc(d.seed||'')}"></div>
      <div class="it"><span class="k">퀄리티</span>${sel('q',d.q,Object.keys(S.presets.Q),'없음')}</div>
      <div class="it"><span class="k">부정</span>${sel('n',d.n,Object.keys(S.presets.N),'없음')}</div>
    </div>
    <h3>결과
      <button class="btn i" id="scopy" style="margin-left:6px" title="복사">⧉</button>
      <button class="btn" id="stest" style="display:none"
              title="⑤구도까지 붙인 6단 전체: 작가 조합만 혼자 돌려볼 때">시험용 ⧉</button>
    </h3>
    <pre id="sout"></pre>

    <h3>부정 프롬프트</h3><pre id="sneg"></pre>`;

  const sync=()=>{
    const o={};
    M.querySelectorAll('input[data-k]').forEach(i=>o[i.dataset.k]=i.value);
    o.collab=$('#collab').checked;
    for(const id of ['model','steps','cpg','seed','q','n']) o[id]=$('#'+id).value;
    styleSave(o);
    $('#sout').textContent = styleText(o,false) || ': ';
    $('#sneg').textContent = S.presets.N[o.n] || ': ';
    /* ⑤구도는 최종 조립에 안 들어간다. 그 줄이 비어 있으면 '시험용' 이란 것도 없으므로
       버튼도 설명도 내보내지 않는다. 늘 띄워두면 아무 차이 없는 선택지가 하나 생긴다. */
    const hasComp = !!(o.comp||'').trim();
    $('#stest').style.display = hasComp ? '' : 'none';
  };
  M.querySelectorAll('input[data-k],#collab,#model,#steps,#cpg,#seed,#q,#n')
    .forEach(e=>{ e.oninput=sync; e.onchange=sync; });
  /* artist: 로 시작하면 ③작가, 아니면 ②화풍 */
  wirePicker('style', tag=>{
    const key = /^artist[:\s]/i.test(tag) ? 'artist' : 'tone';
    const box = M.querySelector(`input[data-k="${key}"]`);
    const cur = box.value.split(',').map(x=>x.trim()).filter(Boolean);
    if(cur.includes(tag)){ toast('이미 있습니다'); return; }
    cur.push(tag); box.value = cur.join(', '); sync();
    toast(`${key==='artist'?'작가':'화풍'} ← ${tag}`);
  });
  $('#pull').onclick=()=>{
    const d2=styleLoad(); let n=0;
    S.cart = S.cart.filter(c=>{
      if(c.s!==-1) return true;
      const key = /^artist[:\s]/i.test(c.t) ? 'artist' : 'tone';
      const cur=(d2[key]||'').split(',').map(x=>x.trim()).filter(Boolean);
      if(!cur.includes(c.t)) cur.push(c.t);
      d2[key]=cur.join(', '); n++; return false;
    });
    styleSave(d2); saveCart(); drawStyle();
    toast(n?`${n}개를 그림체에 넣었습니다`:'그림체로 담긴 태그가 없습니다');
  };
  $('#scopy').onclick = ()=>copy(styleText(styleLoad(),false),'그림체');
  $('#stest').onclick = ()=>copy(styleText(styleLoad(),true),'작가 시험용 프롬프트');
  wireSave('style', ()=>partMD('style', styleLoad()), 'style');
  sync();
}

/* ── 저장 형식 ──────────────────────────────
   조립기가 다시 읽어야 하므로 슬롯 번호를 살려 적는다.
   태그만 한 줄로 적어두면 어느 슬롯 것인지 잃어버려 순서대로 다시 섞을 수 없다. */
function partMD(kind, d){
  const today=new Date().toISOString().slice(0,10);
  if(kind==='style'){
    const body=styleText(d,false), neg=S.presets.N[d.n]||'';
    return ['플랫폼: NovelAI','언어: 영어','형식: 태그','종류: 그림체',
      '모델: '+(d.model||''),'Steps: '+(d.steps||''),'Guidance: '+(d.cpg||''),'Seed: '+(d.seed||''),
      '퀄리티: '+(d.q||''),'부정: '+(d.n||''),
      '글자수: '+body.length,'최종 수정: '+today].join('\n')
      + '\n\n## 6단\n```\n'
      + STYLE_ROWS.map(([k,n])=>`${n}:${(d[k]||'').trim()?' '+d[k].trim():''}`).join('\n')
      + `\ncollab: ${d.collab===false?'off':'on'}\n\`\`\`\n`
      + '\n## 프롬프트\n```\n'+body+'\n```\n\n## 부정 프롬프트\n```\n'+neg+'\n```\n';
  }
  const body=partText(kind,d);
  return ['플랫폼: NovelAI','언어: 영어','형식: 태그','종류: '+PART_NAME[kind],
    '글자수: '+body.length,'최종 수정: '+today].join('\n')
    + '\n\n## 슬롯\n```\n'
    + PART_SLOTS[kind].slice().sort((a,b)=>a-b)
        .map(n=>`${String(n).padStart(2,'0')} ${SLOTS[n].slice(3)}:${(d[n]||'').trim()?' '+d[n].trim():''}`).join('\n')
    + '\n```\n\n## 프롬프트\n```\n'+body+'\n```\n';
}
/* 저장된 파일을 파츠로 되돌린다 */
/* `\s` 는 줄바꿈까지 먹는다. 값이 빈 줄(`02 캐릭터:`)에서 다음 줄을 통째로 삼키므로
   줄 안에서만 도는 `[ \t]` 로 잡는다. 라벨도 줄을 넘지 않게 `[^:\n]` 로 막는다. */
const LINE = (label) => new RegExp('^'+label+':[ \t]*(.*)$','m');
function parsePart(path, src){
  const kind = Object.entries(PART_NAME).find(([,n])=>new RegExp('^종류:[ \t]*'+n+'[ \t]*$','m').test(src));
  if(!kind) return null;
  const k = kind[0];
  const get = re => (src.match(re)||[])[1] || '';
  const o = { path, kind:k, name: pretty(path.split('/').pop()) };
  if(k==='style'){
    const six = get(/## 6단\n```\n([\s\S]*?)```/);
    for(const [key,n] of STYLE_ROWS) o[key] = (six.match(LINE(n))||[])[1]||'';
    o.collab = !/^collab:\s*off/m.test(six);
    for(const [key,label] of [['model','모델'],['steps','Steps'],['cpg','Guidance'],['seed','Seed'],['q','퀄리티'],['n','부정']])
      o[key] = get(LINE(label)).trim();
    o.text = get(/## 프롬프트\n```\n([\s\S]*?)```/).trim();
    o.neg  = get(/## 부정 프롬프트\n```\n([\s\S]*?)```/).trim();
  } else if(k==='final'){
    o.detail = get(/## 세부 프롬프트\n```\n([\s\S]*?)```/).trim();
    o.main   = get(/## 추가 프롬프트\n```\n([\s\S]*?)```/).trim();
    o.neg    = get(/## 부정 프롬프트\n```\n([\s\S]*?)```/).trim();
    o.text   = o.detail;
  } else {
    o.slots = {};
    for(const m of get(/## 슬롯\n```\n([\s\S]*?)```/).matchAll(/^(\d{2})[^:\n]*:[ \t]*(.*)$/gm))
      if(m[2].trim()) o.slots[+m[1]] = m[2].trim();
    o.text = get(/## 프롬프트\n```\n([\s\S]*?)```/).trim();
  }
  return o;
}
const savedParts = () => S.files.filter(f=>f.startsWith(DRAFT_DIR.img))
  .map(f=>parsePart(f, S.md[f]||'')).filter(Boolean);

/* ── 조립 ───────────────────────────────────
   슬롯 번호로 다시 섞는다. 묶음을 이어 붙이면 순서가 깨진다.
   칸 나누기는 03_프롬프트/이미지/README 의 조립 공식을 따른다. */
function assembleParts(sel){
  const by={};
  for(const k of ['look','wear','scene']){
    const p=sel[k]; if(!p) continue;
    for(const [n,v] of Object.entries(p.slots||{})) (by[+n] ||= []).push(v);
  }
  const main = SLOTS.map((_,n)=>(by[n]||[]).join(', ')).filter(Boolean).join(', ');
  const st = sel.style;
  return { detail: st ? st.text : '', main, neg: st ? st.neg : '',
           set: st ? [st.model && '모델 '+st.model, st.steps && 'Steps '+st.steps,
                      st.cpg && 'Guidance '+st.cpg, st.seed && 'Seed '+st.seed]
                      .filter(Boolean).join(' · ') : '' };
}
function drawAssemble(host){
  const M = $(host || '#main');
  const parts = savedParts();
  const pick = k => {
    const list = parts.filter(p=>p.kind===k);
    const cur = (S.pick||{})[k]||'';
    return `<div class="it"><span class="k">${PART_NAME[k]}</span>
      <select class="ctl" data-p="${k}" style="min-width:150px">
        <option value="">: 없음</option>
        ${list.map(p=>`<option value="${esc(p.path)}"${p.path===cur?' selected':''}>${esc(p.name)}</option>`).join('')}
      </select></div>`;
  };
  M.innerHTML = `<div class="bar">
      <strong>조립</strong>
      <span class="sp"></span>
      <button class="btn i" id="aReset" title="고친 내용을 버리고 파츠에서 다시 만든다">↺</button>
      ${saveBar('scene2','완성본 이름')}
    </div>
    ${parts.length?'':'<p class="res">아직 저장한 파츠가 없습니다. 그림체 · 외형 · 의상 · 장면 탭에서 만들어 저장하세요.</p>'}
    <div class="sum">${['style','look','wear','scene'].map(pick).join('')}</div>
    <div id="aout"></div>`;
  /* 조립 결과는 손댈 수 있어야 한다. 가중치를 얹거나 한 태그를 빼는 건
     파츠로 돌아가 고칠 일이 아니라 이 자리에서 할 일이다.
     고친 내용은 파츠 선택이 그대로인 동안 남는다. */
  const sig = () => JSON.stringify(S.pick);
  const boxes = [['detail','세부 프롬프트','그림체 + 퀄리티'],
                 ['main','추가 프롬프트','외형 + 의상 + 장면 · 26슬롯 순서'],
                 ['neg','부정 프롬프트','']];
  const paint = a => {
    $('#aout').innerHTML = `
      ${a.set?`<p class="muted" style="margin:0 0 10px">${esc(a.set)}</p>`:''}
      ${boxes.map(([k,t,d])=>`<h3>${t}${d?` <span class="muted" style="font-weight:400">${d}</span>`:''}
          <button class="btn i" data-c="${k}" style="margin-left:6px" title="복사">⧉</button></h3>
        <textarea class="pbox" data-a="${k}" spellcheck="false">${esc(a[k]||'')}</textarea>`).join('')}
`;
    $('#aout').querySelectorAll('textarea[data-a]').forEach(t=>t.oninput=()=>{
      S.asm[t.dataset.a]=t.value;
      localStorage.setItem('char.asm', JSON.stringify({sig:sig(), asm:S.asm}));
    });
    $('#aout').onclick = e => {
      const b=e.target.closest('button[data-c]'); if(!b) return;
      copy(S.asm[b.dataset.c]||'', (boxes.find(x=>x[0]===b.dataset.c)||[,''])[1]);
    };
  };
  const run=(keepEdits)=>{
    S.pick={}; M.querySelectorAll('select[data-p]').forEach(s=>S.pick[s.dataset.p]=s.value);
    localStorage.setItem('char.pick', JSON.stringify(S.pick));
    const sel={}; for(const k of ['style','look','wear','scene'])
      sel[k]=parts.find(p=>p.path===S.pick[k]);
    const fresh=assembleParts(sel);
    let use=fresh;
    if(keepEdits){
      try{ const saved=JSON.parse(localStorage.getItem('char.asm')||'null');
        if(saved && saved.sig===sig()) use={...fresh, ...saved.asm, set:fresh.set}; }catch{}
    } else localStorage.removeItem('char.asm');
    S.asm=use; paint(use);
  };
  M.querySelectorAll('select[data-p]').forEach(s=>s.onchange=()=>run(false));
  $('#aReset').onclick =()=>{ if(confirm('고친 내용을 버리고 파츠에서 다시 만들까요?')) run(false); };
  wireSave('scene2', ()=>{
    const a=S.asm;
    return ['플랫폼: NovelAI','언어: 영어','형식: 태그','종류: 완성본',
      a.set&&'설정: '+a.set,'글자수: '+(a.detail.length+a.main.length),
      '최종 수정: '+new Date().toISOString().slice(0,10)].filter(Boolean).join('\n')
      + '\n\n## 세부 프롬프트\n```\n'+a.detail+'\n```\n\n## 추가 프롬프트\n```\n'+a.main
      + '\n```\n\n## 부정 프롬프트\n```\n'+a.neg+'\n```\n';
  }, 'img');
  try{ S.pick=JSON.parse(localStorage.getItem('char.pick'))||{}; }catch{ S.pick={}; }
  M.querySelectorAll('select[data-p]').forEach(s=>{ if(S.pick[s.dataset.p]) s.value=S.pick[s.dataset.p]; });
  run(true);
}


/* ── 이 페이지 ──────────────────────────────── */
const PAGE = {
  side: 'img',
  tabs: [['dict','사전'],['combo','태그조합'],['final','최종'],['gen','생성기']],
  views: { dict:drawDict, combo:drawCombo, final:drawFinal, gen:()=>drawGen('img') },
  afterSave(){                      /* 방금 저장한 것이 아래 목록에 바로 보이게 */
    if(S.tab==='combo') draftSection(subGet('combo','style'), '#cdrafts');
    if(S.tab==='final') draftSection('final', '#fdrafts');
  },
  /* 사전이 쓸 자료. 캐릭터 쪽은 이걸 안 읽는다. */
  async load(get){
    const find = re => S.files.find(f=>re.test(f));
    const d=find(/1-태그사전\.csv$/), st=find(/1-스타일태그\.csv$/), ar=find(/1-작가태그\.csv$/);
    if(d)  S.dict   = parseCSV(await get(d));
    if(st) S.style  = parseCSV(await get(st));
    if(ar) S.artist = parseCSV(await get(ar));
    for(const r of S.dict) for(const t of (r['태그']||'').split(',')) if(t.trim()) S.tagset.add(norm(t));
    for(const r of S.style) if(r['태그']) S.tagset.add(norm(r['태그']));
    for(const r of S.artist) if(r['태그']) S.tagset.add(norm(r['태그']));
    /* 프리셋 어휘도 '아는 태그'로 친다. 태그사전은 2022년 danbooru 기준이라
       8k · dramatic contrast 같은 퀄리티·조명 어휘가 아예 없다. */
    for(const kind of ['Q','N'])
      for(const body of Object.values(S.presets[kind]))
        for(const t of body.replace(/-?[\d.]+::/g,'').replace(/::/g,'').split(','))
          if(t.trim()) S.preset_vocab.add(norm(t));
    buildTags(); loadCart();
    await dirRestore();       /* 지난번에 열어 준 폴더가 있으면 그대로 쓴다 */
  },
};
