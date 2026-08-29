/* ─────────────────────────────────────────────
   캐릭터: 작성 → 검토 → 작업중 → 생성기
   core.js 가 먼저 실행된 뒤에 붙는다.
   ───────────────────────────────────────────── */
/* ── 작업중 탭: 초안 목록 · 수정 · 삭제 ─────────
   초안은 만들어진 그룹 안에 둔다. 읽기 탭에는 나오지 않는다. */
function drawDrafts(kind){
  const dir = DRAFT_DIR[kind];
  const list = S.files.filter(f=>f.startsWith(dir)).sort();
  M.innerHTML = `<div class="bar">
      <strong>작업중</strong>
      <span class="muted">${kind==='img'?'에셋':'캐릭터'} 초안</span>
      <span class="sp"></span>
      <span class="muted">${list.length}개</span>
    </div>
    ${S.static?'<div class="res">정적 모드입니다. 초안을 보고 복사할 수는 있지만 수정·삭제는 서버로 열어야 합니다. <code>node viewer/serve.mjs</code></div>':''}
    <div id="dlist">${list.map(cardHTML).join('')
      || '<p class="empty">아직 없습니다.</p>'}</div>`;

  $('#dlist').onclick = e => {
    const card = e.target.closest('.card'); if(!card) return;
    const path = card.dataset.p;
    const act  = e.target.dataset.a;
    if(act==='copy'){ copy(S.md[path]||'', card.dataset.n); return; }
    if(act==='del'){
      if(!confirm(`${pretty(path)} 를 지울까요? 되돌릴 수 없습니다.`)) return;
      post('_delete', {path}).then(async r=>{
        if(r.ok){ dropFile(path); drawDrafts(kind); toast(pretty(path)+' 삭제됨'); }
        else toast('삭제 실패: '+await r.text(), true);
      }).catch(()=>toast('삭제 실패: 쓰기를 지원하지 않는 서버입니다', true));
      return;
    }
    if(act==='save'){
      const ta = card.querySelector('textarea');
      post('_edit', {path, content:ta.value}).then(async r=>{
        if(r.ok){ S.md[path]=ta.value; card.querySelector('.meta').textContent=len(ta.value);
                  toast(pretty(path)+' 저장됨'); }
        else toast('저장 실패: '+await r.text(), true);
      }).catch(()=>toast('저장 실패: 쓰기를 지원하지 않는 서버입니다', true));
      return;
    }
    if(act==='close'){ card.classList.remove('open'); return; }
    /* 그 밖에는 열고 닫기 */
    if(e.target.closest('.nm') || e.target.dataset.a==='open') card.classList.toggle('open');
  };
}
/* ── 입력 중 기호 변환 (노션식) ─────────────────
   저장소 표기 규칙이 → · · 를 쓰므로 타이핑을 그쪽으로 유도한다. */
const SUBS = [[/->$/,'→'],[/<-$/,'←'],[/=>$/,'⇒'],[/\.\.\.$/,'…'],[/!=$/,'≠'],[/>=$/,'≥'],[/<=$/,'≤']];
function autoSym(ta){
  const p=ta.selectionStart, before=ta.value.slice(0,p);
  for(const [re,ch] of SUBS){
    const m=before.match(re);
    if(m){
      const cut=before.length-m[0].length;
      ta.value = ta.value.slice(0,cut) + ch + ta.value.slice(p);
      ta.selectionStart = ta.selectionEnd = cut + ch.length;
      return true;
    }
  }
  return false;
}

/* ── 챗봇 작성 (하네스 8블록) ────────────────── */
const BLOCKS = [
 ['고정 설정','② Anchor · 최상단 고정 · 3줄 이내','핵심: 이 캐릭터를 이 캐릭터답게 만드는 것. 지웠을 때 다른 캐릭터가 되는가?'],
 ['기본 정보','① Block','이름 · 나이 · 직업 · 외형'],
 ['성격 및 말투','① Block','평소 어투 · 말버릇 · 어휘 특징'],
 ['상황별 반응','③ Trigger · 조건 → 반응 · 최소 5개','{{user}}가 도발하면 → 냉소적으로 반응하되 적대적으로 굴지는 않음'],
 ['금지 행동','④ Guard · 어떤 상황에서도 안 하는 것','~하지 않는다 형태로'],
 ['기본 행동','⑤ Fallback · 조건이 없을 때','기본 어조 · 답변 길이 · 먼저 하지 않는 것'],
 ['인식 범위','⑥ Scope · 아는 것 / 모르는 것','{{user}}의 과거를 모른다 · 세계관 외부 정보는 인식하지 않는다'],
 ['관계 단계','⑦ Chain · 관계 변화 흐름','첫 대화 → / n회 이상 → / 신뢰 이후 →'],
 ['출력 규칙','⑧ Layer · 메타 영역 · 대사에 섞이지 않게','{{user}}의 대사나 행동을 대신 묘사하지 말 것'],
];
const botKey='char.bot';
const botLoad=()=>{ try{ return JSON.parse(localStorage.getItem(botKey))||{}; }catch{ return {}; } };
const botSave=o=>localStorage.setItem(botKey,JSON.stringify(o));
function botAssemble(d){
  return BLOCKS.map(([n])=>{
    const v=(d[n]||'').trim();
    return v ? `[${n}]\n${v}` : '';
  }).filter(Boolean).join('\n\n');
}
function countOf(t){
  const ch=t.length, ns=t.replace(/\s/g,'').length, ko=(t.match(/[가-힣]/g)||[]).length;
  return { ch, ns, ko, tok: Math.round(ko*1.4 + (ch-ko)*0.3) };
}
const limKey='char.lim';
function drawWrite(){
  const d=botLoad();
  const lim=+(localStorage.getItem(limKey)||0);
  $('#main').innerHTML=`<div class="bar">
      <strong>하네스 8블록</strong>
      <span class="sp"></span>
      <button class="btn i pri" id="wcopy" title="프롬프트 복사">⧉</button>
      ${saveBar('bot','캐릭터 이름')}
      <button class="btn i danger" id="wclear" title="비우기">✕</button>
    </div>
    <div class="sum">
      <div class="it"><span class="k">글자수</span><span><b id="s1">0</b><span class="u">자</span></span></div>
      <div class="it"><span class="k">공백 제외</span><span><b id="s2" style="font-size:14px">0</b></span></div>
      <div class="it"><span class="k">한글</span><span><b id="s3" style="font-size:14px">0</b></span></div>
      <div class="it"><span class="k">토큰 추정</span><span><b id="s4" style="font-size:14px">0</b></span></div>
      <div class="it"><span class="k">제한</span>
        <input type="number" id="lim" placeholder="예: 2000" value="${lim||''}"></div>
      <div class="gauge" id="gw" style="display:${lim?'block':'none'}"><i id="gi"></i></div>
      <span class="cnt" id="grest"></span>
    </div>
    ${BLOCKS.map(([n,role,ph])=>`<div class="blk">
      <label>${esc(n)}<span class="hint">${esc(role)}</span><span class="bc z" data-c="${esc(n)}">0자</span></label>
      <textarea data-b="${esc(n)}" placeholder="${esc(ph)}">${esc(d[n]||'')}</textarea>
    </div>`).join('')}
    <h3>조립 결과</h3><pre id="wout"></pre>`;

  const sync=()=>{
    const o={};
    document.querySelectorAll('#main textarea[data-b]').forEach(t=>{
      o[t.dataset.b]=t.value;
      const c=countOf(t.value.trim());
      const badge=document.querySelector(`.bc[data-c="${CSS.escape(t.dataset.b)}"]`);
      if(badge){ badge.textContent=c.ch?`${c.ch.toLocaleString()}자`:'0자';
                 badge.classList.toggle('z',!c.ch); }
    });
    botSave(o);
    const out=botAssemble(o); $('#wout').textContent=out||': ';
    const c=countOf(out);
    $('#s1').textContent=c.ch.toLocaleString();
    $('#s2').textContent=c.ns.toLocaleString();
    $('#s3').textContent=c.ko.toLocaleString();
    $('#s4').textContent='~'+c.tok.toLocaleString();
    const L=+($('#lim').value||0);
    localStorage.setItem(limKey, L||'');
    $('#gw').style.display = L?'block':'none';
    if(L){
      const pct=Math.min(100, c.ch/L*100);
      const g=$('#gi'); g.style.width=pct+'%';
      g.className = c.ch>L?'over':(pct>85?'warn':'');
      $('#grest').innerHTML = c.ch>L
        ? `<span class="over-t">${(c.ch-L).toLocaleString()}자 초과</span>`
        : `${(L-c.ch).toLocaleString()}자 남음`;
    } else $('#grest').textContent='';
  };
  document.querySelectorAll('#main textarea[data-b]').forEach(t=>{
    t.oninput=e=>{ if(e.inputType!=='deleteContentBackward') autoSym(t); sync(); };
  });
  $('#lim').oninput=sync;
  $('#wcopy').onclick=()=>copy(botAssemble(botLoad()),'프롬프트');
  wireSave('bot', ()=>{
    const out=botAssemble(botLoad()), c=countOf(out);
    return head({fmt:'블록', count:c.ch, limit:+($('#lim').value||0)})+'\n\n'+out+'\n';
  }, 'bot');
  $('#wclear').onclick=()=>{ if(confirm('작성 내용을 모두 비울까요?')){ botSave({}); drawWrite(); } };
  sync();
}

/* ── 챗봇 검토 (05_검토/01 A·B절 기계 판정) ──── */
function drawBotCheck(){
  $('#main').innerHTML=`<div class="bar"><strong>챗봇 프롬프트 검토</strong>
      <span class="sp"></span>
      <button class="btn" id="bload">작성 탭에서 가져오기</button></div>
    <textarea id="bin" placeholder="프롬프트를 붙여넣으세요"></textarea>
    <div class="bar" style="margin-top:10px"><button class="btn pri" id="bgo">검사</button>
</div>
    <div id="brep"></div>`;
  $('#bload').onclick=()=>{ $('#bin').value=botAssemble(botLoad()); };
  $('#bgo').onclick=()=>{
    const t=$('#bin').value;
    const R=(ok,title,body)=>`<div class="res ${ok?'ok':'no'}"><strong>${title}</strong>${body?'<br>'+body:''}</div>`;
    const N=(title,body)=>`<div class="res"><strong>${title}</strong>${body?'<br>'+body:''}</div>`;

    /* A1 형식 혼용 */
    const fm=[];
    if(/^\s*<\w+>/m.test(t)&&/<\/\w+>/.test(t)) fm.push('XML');
    if(/^#{1,6}\s+\S/m.test(t)) fm.push('Markdown');
    if(/^\s{2,}\w[\w-]*:\s*\S/m.test(t)) fm.push('YAML');
    if(/^\w[\w ]*\s=\s\S/m.test(t)) fm.push('INI');
    if(/^\[[^\]]+\]\s*$/m.test(t)) fm.push('블록([ ])');

    /* A2 언어 혼용: 줄 단위로 어느 문자가 주도하는지 */
    const lines=t.split('\n').filter(l=>l.trim().length>8);
    let ko=0,en=0,zh=0;
    for(const l of lines){
      const k=(l.match(/[가-힣]/g)||[]).length,
            e=(l.match(/[A-Za-z]/g)||[]).length,
            c=(l.match(/[\u4e00-\u9fff]/g)||[]).length;
      const m=Math.max(k,e,c); if(!m) continue;
      if(m===k) ko++; else if(m===c) zh++; else en++;
    }
    const langs=[['한국어',ko],['영어',en],['중국어',zh]].filter(([,n])=>n/Math.max(lines.length,1)>0.15);

    /* A3 OOC · A4 유저 지칭 */
    const ooc=/\bOOC\b/i.test(t);
    const uu=(t.match(/\{\{user\}\}/g)||[]).length;
    const alt=[...new Set((t.match(/유저|사용자|당신|그대/g)||[]))];

    /* A5 메타 헤더 */
    const meta=['플랫폼','언어','형식','글자수','토큰'].filter(k=>new RegExp('^\\s*'+k+'\\s*[:：]','m').test(t));

    /* B 하네스 블록 */
    const found=BLOCKS.map(([n])=>[n, new RegExp('\\[\\s*'+n+'\\s*\\]').test(t)]);
    const missB=found.filter(([,v])=>!v).map(([n])=>n);
    const trg=(t.match(/→/g)||[]).length;

    const cc=countOf(t), ch=cc.ch, koc=cc.ko, est=cc.tok;

    $('#brep').innerHTML=`<h3>결과</h3>`
      + R(fm.length<=1, `A1 형식: ${fm.length?fm.join(' · '):'감지 안 됨'}`,
          fm.length>1?'<span class="muted">한 프롬프트 칸 안에서는 하나로 통일합니다. Claude 계열이면 XML 이 유리합니다.</span>':'')
      + R(langs.length<=1, `A2 언어: ${langs.map(([n,c])=>n+' '+c+'줄').join(' · ')||'판정 불가'}`,
          langs.length>1?'<span class="muted">문맥 이탈·엉뚱한 언어 답변의 직접 원인입니다. 한 칸 안에서는 통일하세요.</span>':'')
      + R(!ooc, `A3 OOC 표기: ${ooc?'발견':'없음'}`,
          ooc?'<span class="muted">몰입이 깨지고 메타 발언을 학습합니다. <code>[출력 규칙]</code> 으로 옮기세요.</span>':'')
      + R(uu>0 && !alt.length, `A4 유저 지칭: {{user}} ${uu}회${alt.length?' · 다른 표기 '+alt.join(', '):''}`,
          alt.length ? '<span class="muted">'+(uu?'혼재하면 AI가 다른 인물로 해석합니다. ':'{{user}} 대신 다른 표기를 쓰고 있습니다. ')+'플랫폼 표기법으로 통일하세요.</span>'
          : (uu?'':'<span class="muted">{{user}} 지칭이 없습니다. 유저를 부르는 자리가 정말 없는지 확인하세요.</span>'))
      + R(meta.length>=3, `A5 메타 헤더: ${meta.length?meta.join(' · '):'없음'}`,
          meta.length<3?'<span class="muted">플랫폼 · 언어 · 형식 · 글자수/토큰을 맨 위에 적어두면 나중에 옮길 때 편합니다.</span>':'')
      + R(!missB.length, `B 하네스 블록: ${9-missB.length}/9`,
          missB.length?missB.map(n=>`<code>[${esc(n)}]</code>`).join(' ')
            +'<br><span class="muted">없는 블록입니다. 증상↔블록 대응은 <code>05_검토/01</code> 하단 표.</span>':'')
      + R(trg>=5, `B ③ Trigger: 조건 → 반응 ${trg}개`,
          trg<5?'<span class="muted">최소 5개를 권합니다. 형용사 한 줄("냉소적이다")은 트리거가 아닙니다.</span>':'')
      + N(`분량: ${ch.toLocaleString()}자 · 공백 제외 ${cc.ns.toLocaleString()} · 한글 ${koc.toLocaleString()}`,
          `<span class="muted">대략 ${est.toLocaleString()} 토큰 추정. 플랫폼이 글자수제면 자릿수만 보고,
           토큰제면 <code>04_생성기/02</code> 로 영문 변환을 검토하세요.</span>`)
      + N('C 밀도: 기계 판정 불가',
          '<span class="muted">고도·고신호 최소 집합·로어북 이관은 판단이 필요합니다. 터미널에서 Claude 에게 <code>05_검토/01</code> 의 C절로 봐달라고 하세요.</span>');
  };
}


/* ── 이 페이지 ──────────────────────────────── */
const PAGE = {
  side: 'bot',
  tabs: [['write','작성'],['check','검토'],['draft','작업중'],['gen','생성기']],
  views: { write:drawWrite, check:drawBotCheck, draft:()=>drawDrafts('bot'), gen:()=>drawGen('bot') },
};
