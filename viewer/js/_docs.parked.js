/* 문서 보기 화면: 지금은 쓰지 않는다.
   에셋·캐릭터를 따로 떼면서 인앱 문서 열람을 껐다.
   되살리려면 이 파일과 css/_docs.parked.css 를 셸에 다시 걸고,
   core.js 의 S 에 files·md 가 이미 있으므로 drawSide()/show() 만 부르면 된다. */

/* ── 사이드바 ───────────────────────────────────
   초안(99_작업중)은 여기 넣지 않는다. 만들어진 그룹의 '작업중' 탭에서 다룬다.
   README·CLAUDE·문서구분표는 저장소를 굴리기 위한 문서라 기본으로 접어둔다. */
const foldKey='char.fold';
let FOLD = (()=>{ try{ return new Set(JSON.parse(localStorage.getItem(foldKey))||[]); }catch{ return new Set(); } })();
const foldSave=()=>localStorage.setItem(foldKey,JSON.stringify([...FOLD]));
S.chore = localStorage.getItem('char.chore')==='1';

const readList = () => S.files.filter(f=>!isDraft(f) && !HIDDEN_DIR.test(f)
  && (S.chore || (!isChore(f) && !ABSORBED.has(f))));

function drawSide(){
  const files = readList();
  /* 하위 폴더까지 그룹으로 올린다. 그래야 파일 줄에 '이미지/' 같은 접두어가 안 붙고
     이름만 남는다. 목록을 훑을 때 읽어야 할 글자가 절반이 된다. */
  const groups={};
  for(const f of files){ const g=f.includes('/')?f.slice(0,f.lastIndexOf('/')):'· 루트'; (groups[g] ||= []).push(f); }
  $('#side').innerHTML = Object.keys(groups).sort().map(g=>{
    const fold=FOLD.has(g);
    return `<div class="grp${fold?' fold':''}" data-g="${esc(g)}">
        <span class="ar">▼</span>${esc(dirName(g))}<span class="n">${groups[g].length}</span></div>`
      + (fold?'':groups[g].map(f=>{
          const grade = f.endsWith('.csv') ? 'csv' : (gradeOf(S.md[f]||'')||'작업');
          const name = docName(f);
          return `<div class="f${S.cur===f?' on':''}" data-f="${esc(f)}" title="${esc(pretty(f))}">
            <i class="dot ${grade}"></i><span>${esc(name)}</span></div>`;
        }).join(''));
  }).join('')
  + `<div class="sidefoot"><label><input type="checkbox" id="chore"${S.chore?' checked':''}>
       숨긴 문서도 보기 <span class="muted">(정비 문서 · 뷰어에 흡수된 템플릿)</span></label></div>`;
  $('#side').onclick = e => {
    if(e.target.id==='chore'){
      S.chore = e.target.checked;
      localStorage.setItem('char.chore', S.chore?'1':'0');
      drawSide(); return;
    }
    const g=e.target.closest('.grp');
    if(g){ const k=g.dataset.g; FOLD.has(k)?FOLD.delete(k):FOLD.add(k); foldSave(); drawSide(); return; }
    const el=e.target.closest('.f');
    if(el){ show(el.dataset.f); closeDrawers(); }
  };
}

/* ── 읽기 ───────────────────────────────────── */
/* ── 문서 보기 ───────────────────────────────
   문서는 작업 화면이 아니라 읽는 화면이다. 탭을 차지하지 않고 겹쳐 띄운다.
   닫으면 하던 자리(에셋·캐릭터)로 그대로 돌아온다. */
function show(f){
  if(!f) return;
  S.cur=f; drawSide();
  if(f.endsWith('.csv')){
    if(/참고링크/.test(f)) return showDoc(f, drawLinksHTML(f), '참고링크');
    /* 사전 CSV 는 사전 탭이 훨씬 잘 보여준다 */
    subSet('dict', /스타일태그/.test(f) ? 'style' : /작가태그/.test(f) ? 'artist' : 'plain');
    closeDoc(); setGroup('img'); return;
  }
  const src=S.md[f]||'', g=gradeOf(src);
  const bodyMD = src.replace(/^> `\[[^\]]+\][\s\S]*?\n/,'');   /* 배너 줄 제외 */
  S.body = bodyMD;
  showDoc(f, renderMD(bodyMD), g);
}
function showDoc(f, html, grade){
  $('#docgrade').textContent = grade||'';
  $('#docgrade').className = 'badge '+(grade||'');
  $('#docgrade').style.display = grade ? '' : 'none';
  $('#docname').textContent = docName(f);
  $('#docmd').innerHTML = html;
  $('#docpage').hidden = false;
  document.body.classList.add('reading');
  /* 코드블록마다 복사 버튼: 템플릿·프리셋은 이 안이 실제 쓸 내용이다 */
  $('#docmd').querySelectorAll('pre').forEach((pre,i)=>{
    const b=document.createElement('button');
    b.className='cp'; b.textContent='복사';
    b.onclick=()=>copy(pre.querySelector('code').textContent,`코드블록 ${i+1}`);
    pre.appendChild(b);
  });
  $('#docpage').querySelector('.docbody').scrollTop=0;
}
function closeDoc(){ $('#docpage').hidden = true; document.body.classList.remove('reading'); }

/* ── 참고링크 ────────────────────────────────
   태그가 아니라 '아직 안 옮긴 바깥 자료' 다. 사전에 섞지 않고 문서로 띄운다. */
function drawLinksHTML(f){
  /* 누른 파일의 것만 보여준다. 에셋과 캐릭터는 참고링크 파일이 따로 있는데
     예전에는 둘을 합쳐 놓아, 에셋 링크 아래에 캐릭터 쪽 Gem 이 딸려 나왔다. */
  const rows = S.links.filter(r=>r._file===f);
  const by={};
  for(const r of rows) (by[r['분류']||'기타'] ||= []).push(r);
  return Object.keys(by).sort().map(k=>`<h3>${esc(k)}</h3>`
      + tbl(['이름','용도|opt','수집|opt2'], by[k].map(x=>`<tr>
          <td><a href="${esc(x['URL'])}" target="_blank" rel="noopener">${esc(x['이름'])}</a>
            ${x['로컬 파일']?`<br><span class="muted" style="font-size:11.5px">${esc(x['로컬 파일'])}</span>`:''}</td>
          <td class="muted opt">${esc(x['용도']||'')}</td>
          <td class="muted opt2">${esc(x['자동수집']||'')}</td></tr>`).join(''))).join('')
    || '<p class="empty">이 갈래에는 남은 참고링크가 없습니다.</p>';
}


