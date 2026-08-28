// 저장된 데이터 + 자동분류 + 수동라벨 -> 단일 HTML 문자열.
// report.mjs(파일로 굽기) 와 serve.mjs(로컬 서버) 가 이 함수를 공유한다.
import fs from 'node:fs';
import path from 'node:path';
import { confFile } from './paths.mjs';
import { Store } from './store.mjs';
import { Labels } from './labels.mjs';
import { compile, classify } from './classify.mjs';
import { Glossary } from './glossary.mjs';
import { Bookmarks } from './bookmarks.mjs';
import { gnbHtml } from './nav.mjs';

export function buildReport(ROOT, opts = {}) {
  const cfg = JSON.parse(fs.readFileSync(confFile(ROOT, 'config.json'), 'utf8'));
  const taxRaw = JSON.parse(fs.readFileSync(confFile(ROOT, 'taxonomy.json'), 'utf8'));
  const glos = new Glossary(ROOT);
  const tax = compile(taxRaw, glos);
  const galleryId = opts.gallery || cfg.gallery.id;
  const days = opts.days ?? cfg.report.recentDays ?? 14;
  const top = opts.top ?? cfg.report.topN ?? 300;
  const server = !!opts.server;

  const store = new Store(ROOT, galleryId);
  const labels = new Labels(ROOT, galleryId);
  const bmk = new Bookmarks(ROOT, galleryId);
  const all = [...store.load().values()];
  const cutoff = days > 0 ? Date.now() - days * 864e5 : 0;

  // 본문을 못 받은 글은 목록에 올리지 않는다 (제목만으로는 볼 게 없다).
  // 저장소에는 그대로 남아 중복 방지와 은어 채굴에 계속 쓰인다.
  const requireBody = opts.requireBody ?? cfg.report.requireBody ?? true;
  const posts = all
    .filter((r) => !r.is_notice)
    .filter((r) => !requireBody || !!r.detail?.body_text)
    .filter((r) => !cutoff || new Date(r.date || r.first_seen_at).getTime() >= cutoff)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, top)
    .map((r) => {
      const a = classify(r, tax);
      const m = labels.get(r.no);
      return {
        no: r.no, t: r.title, h: r.headtext, u: r.url,
        a: r.author?.nick || '', d: r.date, v: r.views, rc: r.recommend, cc: r.comment_count,
        src: r.from || [], seen: r.first_seen_at,
        c: a.category, cs: a.score, amb: a.ambiguous ? 1 : 0, alt: a.also || [], why: a.hits.slice(0, 6),
        ml: m ? m.category : null,
        b: r.detail?.body_text ? r.detail.body_text.slice(0, 6000) : null,
        img: r.detail?.images?.slice(0, 12) || [],
        bk: bmk.has(r.no) ? 1 : 0,
        gt: glos.detect((r.title || '') + ' ' + (r.detail?.body_text || '').slice(0, 2000)).slice(0, 10),
        cm: (r.comments || []).filter((c) => c.text).slice(0, 200).map((c) => ({ n: c.nick, x: c.text, dp: c.depth })),
      };
    });

  const cats = [...taxRaw.categories.map((c) => ({ key: c.key, label: c.label, emoji: c.emoji || '', desc: c.desc || '' })),
                { key: 'etc', label: '기타', emoji: '·', desc: '분류되지 않음' }];

  const meta = {
    gallery: cfg.gallery, builtAt: new Date().toISOString(),
    totalStored: all.length, shown: posts.length, days, server, requireBody,
    bookmarkCount: bmk.count,
    manualCount: labels.count, state: store.state(),
    runs: store.runs(20).map((r) => ({ id: r.run_id, job: r.job, ...r.counts, err: r.errors?.length || 0 })),
  };

  const gl = {
    types: glos.data.types,
    concepts: glos.data.concepts,
    terms: glos.data.terms,
    patterns: (glos.data.patterns || []).map((p) => ({ key: p.key, canon: p.canon, gloss: p.gloss })),
    candidates: Object.entries(glos.data.candidates || {})
      .filter(([, v]) => v.status !== 'rejected')
      .sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
      .slice(0, 150)
      .map(([w, v]) => ({ w, n: v.count, g: v.guess_type || null, gf: v.guess_from || null, ex: (v.examples || []).slice(0, 2), ctx: (v.context || []).slice(0, 4) })),
  };
  const payload = JSON.stringify({ meta, cats, posts, gl }).replace(/<\/script/gi, '<\\/script');
  return HEAD(cfg, meta) + '<script type="application/json" id="data">' + payload + '</script>\n<script>\n' + APP + '\n</script></body></html>';
}

export const CSS = String.raw`
:root{
  --bg:#f5f8fc; --panel:#fff; --sunken:#eef3fa;
  --ink:#152232; --ink2:#3d5068; --dim:#7488a0; --faint:#9aabc0;
  --line:#dde6f1; --line2:#eaf0f7;
  --accent:#2166cf; --accent-h:#1a55b0; --accent-w:#e7f0fd; --accent-b:#b9d3f7;
  --chip:#eef3fa; --hi:#ffeeb0; --ok:#1d7f5e; --warn:#b3781a; --bad:#c0413c;
  --ctl:34px; --r:8px; --r-sm:5px;   /* r=입력·버튼 / r-sm=칩·세그먼트 */
}
@media(prefers-color-scheme:dark){:root{
  --bg:#0e141d; --panel:#161e2a; --sunken:#111925;
  --ink:#e8eff8; --ink2:#c2d0e2; --dim:#8497ae; --faint:#6b7e96;
  --line:#243244; --line2:#1c2735;
  --accent:#5b9df5; --accent-h:#7ab0f8; --accent-w:#16283f; --accent-b:#2f4d73;
  --chip:#1c2735; --hi:#5a4a12; --ok:#5fc79b; --warn:#dfb457; --bad:#e2726c;
}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
 font:14px/1.6 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",Pretendard,"Segoe UI",sans-serif;
 -webkit-font-smoothing:antialiased}
a{color:var(--accent)}
mark{background:var(--hi);color:#152232;border-radius:2px;padding:0 1px}
img,video{max-width:100%}

/* ── 컨트롤 공통 ─────────────────────────────────────────── */
.ctl{height:var(--ctl);border:1px solid var(--line);background:var(--panel);color:var(--ink2);
 border-radius:var(--r);padding:0 12px;font:inherit;font-size:13px;line-height:1;vertical-align:middle}
button.ctl{cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;transition:.12s}
/* 폭이 부족하면 글자를 이모지로 대체한다 — .t 는 글자, .e 는 이모지 */
.e{display:none}
.t{display:inline}
button.ctl:hover{border-color:var(--accent-b);background:var(--accent-w);color:var(--accent)}
button.ctl.on{background:var(--accent);border-color:var(--accent);color:#fff}
button.ctl.primary{background:var(--accent);border-color:var(--accent);color:#fff}
button.ctl.primary:hover{background:var(--accent-h);border-color:var(--accent-h);color:#fff}
button.ctl:disabled{opacity:.55;cursor:default}
select.ctl{cursor:pointer;padding-right:28px;
 background-image:linear-gradient(45deg,transparent 50%,var(--dim) 50%),linear-gradient(135deg,var(--dim) 50%,transparent 50%);
 background-position:calc(100% - 15px) 15px,calc(100% - 10px) 15px;background-size:5px 5px;background-repeat:no-repeat;
 -webkit-appearance:none;appearance:none}
select.ctl:hover{border-color:var(--accent-b)}
.vlabel{font-size:10.5px;color:var(--faint);letter-spacing:.08em;font-weight:700;flex:none;width:34px;text-transform:uppercase}
.count{font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums;margin-left:auto;white-space:nowrap}

/* ── 헤더 ────────────────────────────────────────────────── */
.hdr{position:sticky;top:0;z-index:30;background:var(--panel);border-bottom:1px solid var(--line);
 box-shadow:0 1px 3px rgba(21,34,50,.04)}
/* 도구 영역 펼침 버튼 — 옆의 기능 버튼(.ctl)과 헷갈리지 않게 테두리 없는 아이콘으로 둔다 */
button.disclose{display:none;border:none;background:none;color:var(--dim);cursor:pointer;padding:0;
 width:34px;height:34px;align-items:center;justify-content:center;border-radius:var(--r);transition:.12s}
button.disclose:hover{color:var(--accent);background:var(--accent-w)}
button.disclose i{display:block;width:9px;height:9px;margin-top:-4px;
 border-right:1.8px solid currentColor;border-bottom:1.8px solid currentColor;
 transform:rotate(45deg);transition:transform .18s,margin .18s}
.hdr.open button.disclose i{transform:rotate(-135deg);margin-top:3px}
.hdr-top{display:flex;align-items:center;gap:20px;padding:0 28px;height:64px}   /* GNB — 두 페이지 공통, 높이 고정 */
.brand{display:flex;flex-direction:column;min-width:0;gap:3px}
.brand b{font-size:15.5px;letter-spacing:-.015em;line-height:1.25;color:var(--ink)}
.brand span{font-size:11.5px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:56ch}
.nav{display:flex;gap:4px;align-self:stretch;align-items:stretch;margin-left:14px}
.nav a{padding:0 17px;display:flex;align-items:center;font-size:13.5px;color:var(--dim);
 text-decoration:none;border-bottom:2px solid transparent;transition:.12s}
.nav a:hover{color:var(--accent);background:var(--accent-w)}
.nav a.active{color:var(--accent);font-weight:600;border-bottom-color:var(--accent)}
.hdr-actions{margin-left:auto;display:flex;gap:8px;flex:none;align-items:center;min-height:var(--ctl)}
/* GNB 우측 정보 표시 — 버튼과 같은 높이라 페이지를 오가도 바가 흔들리지 않는다 */
.stat{height:var(--ctl);display:inline-flex;align-items:center;padding:0 12px;border-radius:var(--r);
 background:var(--sunken);border:1px solid var(--line2);color:var(--dim);font-size:11.5px;
 white-space:nowrap;font-variant-numeric:tabular-nums}

.hdr-tools{border-top:1px solid var(--line2)}
.hdr-row{display:flex;gap:10px;align-items:center;padding:0 28px 14px;flex-wrap:wrap}
.hdr-row:first-child{padding-top:14px}
.hdr-row.tight{padding-bottom:12px}
/* 보기·분류 행은 줄바꿈 금지. 여백 → 컴포넌트 폭 → 개수 표시 순으로 줄인다. */
.hdr-row.view-row,.hdr-row.cat-row{flex-wrap:nowrap}
.hdr-row+.hdr-row{border-top:1px solid var(--line2);padding-top:13px}

/* 검색줄은 줄바꿈을 막아 두고 '축소'로 먼저 버틴다.
   flexbox 는 flex-basis 합이 넘치면 축소하기 전에 줄부터 바꿔버리기 때문에,
   nowrap 이어야 (1)검색창 → (2)드롭다운 순서로 줄어든다. */
.hdr-row.search-row{flex-wrap:nowrap}
.search{position:relative;display:flex;align-items:center;
 flex:1 1 auto;min-width:118px}           /* 여유가 있으면 늘고, 부족하면 가장 먼저 줄어든다 */
.search input{width:100%;height:var(--ctl);padding:0 13px 0 34px;border:1px solid var(--line);
 border-radius:var(--r);background:var(--sunken);color:var(--ink);font:inherit;font-size:13.5px;transition:.12s}
.search input:focus{outline:none;border-color:var(--accent);background:var(--panel);
 box-shadow:0 0 0 3px var(--accent-w)}
.search .ico{position:absolute;left:12px;color:var(--faint);font-size:14px;pointer-events:none}
.filters{display:flex;gap:8px;flex:0 1 auto;min-width:0}   /* 검색창이 한계에 닿은 뒤 줄어든다 */
.filters .ctl{flex:0 1 auto;min-width:78px;text-overflow:ellipsis}
.segwrap{min-width:0;display:flex}
/* 둘 다 최소폭에 닿는 420px 이하에서만 비로소 2줄로 내려간다 */
@media (max-width:420px){
  .hdr-row.search-row{flex-wrap:wrap}
  .search{flex:1 1 100%}
  .filters{flex:1 1 100%}
  .filters .ctl{flex:1 1 auto}
}

.seg{display:inline-flex;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden;background:var(--panel)}
.seg button{border:none;background:none;color:var(--dim);font:inherit;font-size:12.5px;
 padding:0 14px;height:32px;cursor:pointer;border-right:1px solid var(--line);white-space:nowrap;transition:.12s}
.seg{flex:0 1 auto;min-width:0}
.seg button:last-child{border-right:none}
.seg button:hover{background:var(--accent-w);color:var(--accent)}
.seg button.on{background:var(--accent);color:#fff}

/* 분류 탭 — 절대 2줄로 넘기지 않는다 */
.scrollrow{position:relative;flex:1;min-width:0}
.cats{display:flex;flex-wrap:nowrap;gap:7px;overflow-x:auto;scroll-behavior:smooth;padding:2px 0;
 scrollbar-width:none;-ms-overflow-style:none}
.cats::-webkit-scrollbar{display:none}
.scrollrow::before,.scrollrow::after{content:'';position:absolute;top:0;bottom:0;width:26px;
 pointer-events:none;z-index:2;opacity:0;transition:opacity .15s}
.scrollrow::before{left:0;background:linear-gradient(90deg,var(--panel),transparent)}
.scrollrow::after{right:0;background:linear-gradient(270deg,var(--panel),transparent)}
.scrollrow.l::before{opacity:1}
.scrollrow.r::after{opacity:1}
.arrow{flex:none;width:26px;height:26px;border:1px solid var(--line);background:var(--panel);color:var(--dim);
 border-radius:var(--r-sm);cursor:pointer;font-size:14px;line-height:1;display:none;align-items:center;justify-content:center;padding:0}
.arrow:hover{border-color:var(--accent);color:var(--accent)}
.arrow.show{display:flex}
.cat{font-size:12.5px;border:1px solid var(--line);background:var(--panel);border-radius:var(--r-sm);
 padding:5px 14px;cursor:pointer;white-space:nowrap;flex:none;line-height:1.25;color:var(--ink2);transition:.12s}
.cat:hover{border-color:var(--accent-b);color:var(--accent)}
.cat.on{background:var(--accent);border-color:var(--accent);color:#fff}
.cat .n{opacity:.6;margin-left:6px;font-variant-numeric:tabular-nums;font-size:11px}

/* ── 목록: 제목만 선명하게, 나머지는 압축 ──────────────────── */
main{padding:18px 28px 90px;max-width:1080px;margin:0 auto}
.card{background:var(--panel);border:1px solid var(--line);border-radius:9px;
 padding:9px 13px 8px;margin-bottom:6px;transition:.12s}
.card:hover{border-color:var(--accent-b)}
.card.edited{box-shadow:inset 3px 0 0 var(--ok)}
.card.amb{box-shadow:inset 3px 0 0 var(--warn)}
.card.gone{box-shadow:inset 3px 0 0 var(--bad)}
.card.picked{background:var(--accent-w);border-color:var(--accent)}

/* 카드는 늘 2행. 1행 = 제목, 2행 = 부속 정보 */
.row{display:flex;gap:8px;align-items:center;flex-wrap:nowrap}
.row.r2{gap:7px;margin-top:4px;line-height:1.35}
.row.r1 .go{margin-left:auto;flex:none;font-size:11.5px;white-space:nowrap;text-decoration:none}
.row.r1 .go:hover{text-decoration:underline}
.row.r2 .nums{margin-left:auto;flex:none}
.row.r2 .date{flex:none}
.ttl{font-weight:600;font-size:14px;line-height:1.4;letter-spacing:-.01em;color:var(--ink);
 cursor:pointer;flex:1 1 0;min-width:0;
 white-space:nowrap;overflow:hidden;text-overflow:ellipsis}   /* 넘치면 … 로 자른다 */
.card.open .ttl{white-space:normal;overflow:visible}          /* 펼치면 전문을 보여준다 */
.ttl:hover{color:var(--accent)}
.row.r2 .chip,.row.r2 .metrics{font-size:11px}
.chip{font-size:11px;color:var(--dim);background:var(--chip);border-radius:var(--r-sm);
 padding:1px 8px;white-space:nowrap;line-height:1.55;flex:0 1 auto;min-width:0;
 overflow:hidden;text-overflow:ellipsis}
.metrics{font-size:11.5px;color:var(--dim);white-space:nowrap;font-variant-numeric:tabular-nums;min-width:0}
.metrics b{color:var(--accent);font-weight:600}
.pick{font-size:11.5px;height:24px;padding:0 6px;border-radius:6px;max-width:126px;min-width:0;
 border:1px solid var(--line);background:var(--sunken);color:var(--dim);cursor:pointer;flex:none}
.pick:hover{border-color:var(--accent-b);color:var(--accent)}
.sel{width:15px;height:15px;accent-color:var(--accent);cursor:pointer;flex:none}
.inlib{color:#e0a52b;font-size:13px;line-height:1;flex:none}   /* 서재에 담긴 글 표식 (읽기 전용) */
.card{cursor:pointer}                                          /* 로우 전체가 선택 영역 */
.ttl,.pick,.body,.card a{cursor:auto}
.ttl{cursor:pointer}

.body{display:none;margin-top:9px;padding-top:9px;border-top:1px solid var(--line2)}
.card.open .body{display:block}
.txt{white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.72;color:var(--ink2)}
.why{font-size:11px;color:var(--faint);margin-top:7px;line-height:1.5}
.imgs{display:flex;gap:6px;flex-wrap:wrap;margin:9px 0}
.imgs img{max-height:140px;border-radius:7px;border:1px solid var(--line)}
.cmts{margin-top:9px;border-top:1px solid var(--line2);padding-top:6px}
.cmt{font-size:12.5px;line-height:1.55;padding:3px 0;border-bottom:1px solid var(--line2);color:var(--ink2)}
.cmt:last-child{border-bottom:none}
.cmt.re{padding-left:18px;color:var(--dim)}
.cmt .n{color:var(--faint);margin-right:6px;font-size:11px}
.empty{color:var(--dim);text-align:center;padding:80px 20px;font-size:13.5px;line-height:1.8}
.gonebadge{background:var(--bad);color:#fff;border-radius:var(--r-sm);font-size:10.5px;padding:1px 8px;font-weight:600}

/* ── 선택 바 ─────────────────────────────────────────────── */
#selbar{display:none;align-items:center;gap:8px;flex-wrap:nowrap;overflow-x:auto;font-size:13px;
 scrollbar-width:none;
 background:var(--accent);color:#fff;padding:11px 28px;border-top:1px solid rgba(255,255,255,.2)}
#selbar.show{display:flex}
#selbar::-webkit-scrollbar{display:none}
#selbar>*{flex:none}
#selbar select{flex:0 1 auto;min-width:62px}   /* 폭이 없으면 드롭다운부터 줄인다 */
#selbar input{flex:1 1 90px;min-width:64px}
#selbar .selcount{white-space:nowrap}
#selbar .n{font-weight:700}
#selbar button,#selbar select,#selbar input{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.4);
 color:#fff;border-radius:var(--r);padding:0 11px;height:31px;font:inherit;font-size:12.5px;white-space:nowrap}
#selbar button{cursor:pointer;transition:.12s}
#selbar button:hover{background:rgba(255,255,255,.3)}
#selbar select option{color:#111}
#selbar .n{font-weight:700}
#selbar .divider{opacity:.4}
#selTag{width:175px}
#prog{flex:1 1 90px !important;min-width:70px;height:6px;background:rgba(255,255,255,.25);border-radius:99px;overflow:hidden;display:none}
#prog.show{display:block}
#prog i{display:block;height:100%;background:#fff;width:0;transition:width .3s}

/* ── 사전 패널 ───────────────────────────────────────────── */
#crawlPanel,#glPanel{max-width:1080px;margin:16px auto 0;padding:0 28px}
.pbar{height:7px;background:var(--sunken);border-radius:99px;overflow:hidden;margin:10px 0 7px;border:1px solid var(--line)}
.pbar i{display:block;height:100%;background:var(--accent);width:0;transition:width .3s}
.jobseg{margin-bottom:11px}
.jobseg button{padding:0 13px;height:29px;font-size:12.5px}
.jobdesc{margin:0 0 4px}
.runrow{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:14px;
 border-top:1px solid var(--line2);padding-top:13px}
.runrow .why{margin:0}
.kwbox{border-top:1px solid var(--line2);margin-top:13px;padding-top:13px}
.kwhead{display:flex;gap:9px;align-items:baseline;flex-wrap:wrap;font-size:13px;font-weight:600;margin-bottom:9px}
.kwhead .g{font-weight:400;font-size:11.5px;color:var(--dim)}
.kwopt{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:11px;font-size:11.5px;color:var(--dim)}
.kwopt label{display:flex;gap:6px;align-items:center}
.kwopt select{height:26px;padding:0 7px;font-size:11.5px;border-radius:var(--r-sm);
 border:1px solid var(--line);background:var(--panel);color:var(--ink)}
.plog{font-size:11.5px;color:var(--dim);line-height:1.7;max-height:132px;overflow-y:auto;
 font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}
.glbox{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-bottom:12px}
.glbox h3{margin:0 0 9px;font-size:13.5px;display:flex;align-items:center;gap:9px;flex-wrap:wrap;color:var(--ink)}
.glbox h3 .g{color:var(--dim);font-weight:400;font-size:12px}
.glbox p.d{margin:0 0 12px;font-size:12px;color:var(--dim);line-height:1.65}
.glgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:6px}
.gterm{font-size:12px;border:1px solid var(--line);border-radius:7px;padding:6px 10px;background:var(--sunken);line-height:1.5}
.gterm b{color:var(--ink)}
.gterm .g{color:var(--dim)}
.cand{display:grid;grid-template-columns:minmax(90px,auto) 1fr auto;gap:10px;align-items:center;
 border-bottom:1px solid var(--line2);padding:7px 0;font-size:12.5px}
.cand .word{font-weight:600;color:var(--ink)}
.cand .meta{color:var(--dim);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cand .act{display:flex;gap:5px;align-items:center}
.cand select,.cand input{height:28px;padding:0 8px;font-size:12px;border-radius:6px;
 border:1px solid var(--line);background:var(--sunken);color:var(--ink)}
.cand input{width:150px}
.cand button{height:28px;padding:0 11px;font-size:12px;border-radius:6px;cursor:pointer;
 border:1px solid var(--line);background:var(--panel);color:var(--ink2);transition:.12s}
.cand button:hover{border-color:var(--accent);color:var(--accent)}
#mineBtn{border-color:var(--accent-b);color:var(--accent);background:var(--accent-w)}

/* ── 서재 전용 ───────────────────────────────────────────── */
.note{width:100%;margin-top:7px;font-size:12.5px;min-height:32px;resize:vertical;line-height:1.6;
 border:1px solid var(--line);border-radius:7px;background:var(--sunken);color:var(--ink2);
 padding:6px 9px;font-family:inherit}
.note:focus{outline:none;border-color:var(--accent);background:var(--panel)}
.tagbar{display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-top:6px}
.tag.ref{background:var(--sunken);border-style:dashed}
.tag.ref .g{opacity:.65;margin-left:3px}
.tag{font-size:11px;background:var(--accent-w);border:1px solid var(--accent-b);color:var(--accent);
 border-radius:var(--r-sm);padding:1px 9px;cursor:pointer;line-height:1.6}
.tag .x{opacity:.55;margin-left:5px}
.tagin{font-size:11.5px;padding:1px 10px;width:104px;border-radius:var(--r-sm);border:1px dashed var(--line);
 background:transparent;color:var(--ink)}
.tagin:focus{outline:none;border-color:var(--accent);border-style:solid}

#toast{position:fixed;right:20px;bottom:20px;background:var(--panel);border:1px solid var(--line);
 border-left:3px solid var(--ok);border-radius:9px;padding:11px 16px;font-size:12.5px;opacity:0;
 transition:opacity .2s;pointer-events:none;z-index:99;box-shadow:0 8px 26px rgba(21,34,50,.16);color:var(--ink)}
#toast.show{opacity:1}

/* ═══ 반응형 ═════════════════════════════════════════════════
   1080↓ 여백 축소 · 900↓ GNB 2단 + 헤더 스크롤아웃 + 하단 액션바
   700↓  카드 제목 단독 줄 · 480↓ 최소 여백                     */

/* ① 여백부터 */
@media (max-width:820px){
  .hdr-row.view-row,.hdr-row.cat-row{gap:7px}
  .seg button{padding:0 11px}
}
/* ② 컴포넌트 폭 */
@media (max-width:600px){
  .seg button{padding:0 8px;font-size:12px}
  .hdr-row.view-row,.hdr-row.cat-row{gap:6px}
  .cat{padding:5px 10px}
}
/* ③ 마지막으로 개수 표시를 버린다 */
@media (max-width:430px){
  .count{display:none}
  .cat .n{display:none}
  .seg button{padding:0 7px;font-size:11.5px}
}

@media (max-width:1080px){
  .hdr-top{padding:0 20px}
  .hdr-row{padding:0 20px 12px}
  .hdr-row:first-child{padding-top:12px}
  main{padding:16px 20px 90px}
  #glPanel{padding:0 20px}
  #selbar{padding:11px 20px}
  .brand span{max-width:40ch}
}

@media (max-width:900px){
  :root{--ctl:38px}                      /* 터치 타겟 확보 */
  /* GNB 는 언제나 고정. 대신 아래 도구 영역을 접을 수 있게 해서 화면을 안 먹는다. */
  button.disclose{display:inline-flex}
  .hdr-tools{display:none}
  .hdr.open .hdr-tools{display:block}
  .hdr-top{height:auto;min-height:56px;flex-wrap:wrap;gap:10px;padding:10px 16px 0;
    border-bottom:1px solid var(--line2)}
  .brand{order:1;flex:1 1 auto;min-width:0}
  .brand b{font-size:14.5px}
  .brand span{font-size:11px;max-width:100%}
  .hdr-actions{order:2;margin-left:auto;flex-shrink:0}
  .hdr-actions .stat{display:none}
  .nav{order:3;flex:1 0 100%;margin:0 -16px;padding:0 16px;border-top:1px solid var(--line2)}
  .nav a{flex:1;justify-content:center;height:44px;padding:0}

  .hdr-tools{border-top:none}
  .hdr-row{padding:0 16px 10px;gap:8px}
  .hdr-row:first-child{padding-top:12px}
  .hdr-row+.hdr-row{padding-top:10px}
  .vlabel{display:none}                  /* 라벨 대신 순서로 구분 */
  /* 보기 토글은 항목 수가 고정이라 가로 스크롤이 낫다 */
  .segwrap{flex:1 1 100%;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;
    padding-bottom:2px;-webkit-overflow-scrolling:touch}
  .segwrap::-webkit-scrollbar{display:none}
  .seg{flex:none}
  .count{margin-left:0;flex:0 0 auto}

  main{padding:14px 16px 96px}
  #glPanel{padding:0 16px}
  .glgrid{grid-template-columns:1fr}
  .cand{grid-template-columns:1fr;gap:6px;padding:10px 0}
  .cand .act{flex-wrap:wrap}
  .cand input{flex:1;min-width:120px;width:auto}

  /* 선택 바는 화면 하단 고정 — 목록을 가리지 않는다 */
  /* 좁은 화면에선 헤더가 흘러가므로 선택 바만 화면 하단에 고정 */
  #selbar{position:fixed;bottom:0;left:0;right:0;z-index:60;padding:10px 16px;
    gap:8px;border-top:none;box-shadow:0 -3px 14px rgba(21,34,50,.22);
    padding-bottom:calc(10px + env(safe-area-inset-bottom))}
  #selbar.show{display:flex}
  #selbar input{width:auto;flex:1;min-width:120px}
  #prog{flex:1 0 100%;order:9}
  #toast{left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));text-align:center}
}

/* 카드 축소 사다리
   ① 여백  ② 컴포넌트 폭·말줄임  ③ 부가 정보를 덜 중요한 순서로 제거
   제거 순서: 조회 → 댓글 → 원문 글자 → 말머리 칩 → 추천 → 날짜
   끝까지 남는 것: 체크박스 · 제목 · 분류 드롭다운 · 원문 화살표 */
@media (max-width:760px){
  .card .row{gap:6px}
  .pick{max-width:112px}
}
@media (max-width:600px){
  .pick{max-width:96px;font-size:11px}
  .chip{max-width:88px}
  .m-view,.kept{display:none}
}
@media (max-width:460px){
  .card .row{gap:5px}
  .pick{max-width:84px}
  .m-cmt{display:none}
  .row.r1 .go{font-size:0}
  .row.r1 .go::after{content:'↗';font-size:13px}
}
@media (max-width:370px){
  .row.r2 .chip{display:none}
}
@media (max-width:340px){
  .row.r2 .nums{display:none}          /* 추천까지 내려놓는다 */
}
@media (max-width:310px){
  .row.r2 .date{display:none}          /* 마지막으로 날짜 */
}

@media (max-width:1080px){
  .hdr-top{padding:0 20px}
  .hdr-row{padding:0 20px 12px}
  .hdr-row:first-child{padding-top:12px}
  main{padding:16px 20px 90px}
  #glPanel{padding:0 20px}
  #selbar{padding:11px 20px}
  .brand span{max-width:40ch}
}

@media (max-width:900px){
  :root{--ctl:38px}                      /* 터치 타겟 확보 */
  /* GNB 는 언제나 고정. 대신 아래 도구 영역을 접을 수 있게 해서 화면을 안 먹는다. */
  button.disclose{display:inline-flex}
  .hdr-tools{display:none}
  .hdr.open .hdr-tools{display:block}
  .hdr-top{height:auto;min-height:56px;flex-wrap:wrap;gap:10px;padding:10px 16px 0;
    border-bottom:1px solid var(--line2)}
  .brand{order:1;flex:1 1 auto;min-width:0}
  .brand b{font-size:14.5px}
  .brand span{font-size:11px;max-width:100%}
  .hdr-actions{order:2;margin-left:auto;flex-shrink:0}
  .hdr-actions .stat{display:none}
  .nav{order:3;flex:1 0 100%;margin:0 -16px;padding:0 16px;border-top:1px solid var(--line2)}
  .nav a{flex:1;justify-content:center;height:44px;padding:0}

  .hdr-tools{border-top:none}
  .hdr-row{padding:0 16px 10px;gap:8px}
  .hdr-row:first-child{padding-top:12px}
  .hdr-row+.hdr-row{padding-top:10px}
  .vlabel{display:none}                  /* 라벨 대신 순서로 구분 */
  /* 보기 토글은 항목 수가 고정이라 가로 스크롤이 낫다 */
  .segwrap{flex:1 1 100%;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;
    padding-bottom:2px;-webkit-overflow-scrolling:touch}
  .segwrap::-webkit-scrollbar{display:none}
  .seg{flex:none}
  .count{margin-left:0;flex:0 0 auto}

  main{padding:14px 16px 96px}
  #glPanel{padding:0 16px}
  .glgrid{grid-template-columns:1fr}
  .cand{grid-template-columns:1fr;gap:6px;padding:10px 0}
  .cand .act{flex-wrap:wrap}
  .cand input{flex:1;min-width:120px;width:auto}

  /* 선택 바는 화면 하단 고정 — 목록을 가리지 않는다 */
  /* 좁은 화면에선 헤더가 흘러가므로 선택 바만 화면 하단에 고정 */
  #selbar{position:fixed;bottom:0;left:0;right:0;z-index:60;padding:10px 16px;
    gap:8px;border-top:none;box-shadow:0 -3px 14px rgba(21,34,50,.22);
    padding-bottom:calc(10px + env(safe-area-inset-bottom))}
  #selbar.show{display:flex}
  #selbar input{width:auto;flex:1;min-width:120px}
  #prog{flex:1 0 100%;order:9}
  #toast{left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));text-align:center}
}

@media (max-width:760px){
  .card .row{gap:6px}                     /* ① 여백 */
  .pick{max-width:112px}                  /* ② 컴포넌트 폭 */
}
@media (max-width:560px){
  .pick{max-width:96px;font-size:11px}
  .card .row>.chip{max-width:84px;overflow:hidden;text-overflow:ellipsis}
}
@media (max-width:430px){
  .m-view,.m-cmt{display:none}            /* ③ 개수 표시부터 버린다 */
  .pick{max-width:84px}
  .card .row{gap:5px}
}

@media (max-width:700px){
  /* 폭이 부족하면 GNB 버튼 글자를 이모지로 바꾼다 (하단바는 이미 짧은 낱말이라 그대로) */
  .hdr-actions .t{display:none}
  .hdr-actions .e{display:inline;font-size:15px;line-height:1}
  .hdr-actions button.ctl{gap:0;padding:0 11px}
  .brand span{display:none}              /* 부가 정보 먼저 버린다 */

  .card{padding:10px 12px 9px}
  .sel{width:17px;height:17px}
  .imgs img{max-height:120px}
  .empty{padding:56px 16px}
}

@media (max-width:480px){
  /* 폭이 정말 없으면 브랜드를 통째로 지운다 — 현재 위치는 탭이 알려준다 */
  .hdr-top{padding:9px 12px 0;gap:6px;min-height:44px}
  .brand{display:none}
  .hdr-actions{gap:5px;margin-left:auto}   /* 이름이 사라져도 아이콘은 우측에 유지 */
  .hdr-actions .ctl{padding:0 9px;height:32px}
  .nav{margin:0 -12px;padding:0 12px}
  .nav a{height:42px;font-size:13px}
  .hdr-row{padding:0 12px 9px}
  .hdr-row:first-child{padding-top:10px}
  main{padding:12px 12px 96px}
  #glPanel{padding:0 12px}
  /* 하단바를 한 줄에 담기 위해 군더더기부터 덜어낸다 */
  #selbar{padding:9px 10px;gap:6px;padding-bottom:calc(9px + env(safe-area-inset-bottom))}
  #selbar .t2,#selbar .divider{display:none}
  #selbar button,#selbar select,#selbar input{padding:0 8px;font-size:12px}
  .brand b{font-size:14px}
  .card{padding:9px 11px 8px;border-radius:8px}
  .ttl{font-size:13.5px}
  .txt{font-size:12.5px}
  .glbox{padding:13px 14px}
}

/* 마우스가 없는 기기에선 스크롤 화살표가 의미 없다 */
@media (hover:none){ .arrow{display:none !important} }

`;

const HEAD = (cfg, meta) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${cfg.report.title} · ${cfg.gallery.id}</title>
<style>
${CSS}</style></head><body>
<header class="hdr">
  ${gnbHtml('collect', meta.server,
    '<span class="stat" id="storage"></span>' +
    '<button class="ctl primary" id="crawlBtn" title="갤러리에서 새 글을 가져와요"><span class="e">⟳</span><span class="t">새로 수집</span></button>' +
    '<button class="ctl" id="export" title="내가 고친 분류를 labels.json 으로 내려받아요"><span class="e">↓</span><span class="t">분류 내보내기</span></button>')}
  <div class="hdr-tools">
  <div class="hdr-row search-row">
    <label class="search"><span class="ico">⌕</span>
      <input type="search" id="q" placeholder="제목 · 본문 · 댓글 검색"></label>
    <div class="filters">
    <select class="ctl" id="sort">
      <option value="d">최신순</option><option value="rc">추천순</option>
      <option value="v">조회순</option><option value="cc">댓글순</option>
      <option value="cs">분류점수순</option><option value="seen">최초수집순</option>
    </select>
    <select class="ctl" id="src" title="이 글을 찾아낸 수집 경로로 걸러요"><option value="">경로 전체</option></select>
    <select class="ctl" id="minr">
      <option value="0">추천 전체</option><option value="5">추천 5+</option>
      <option value="20">추천 20+</option><option value="50">추천 50+</option>
    </select>
    </div>
  </div>

  <div class="hdr-row tight cat-row">
    <span class="vlabel">분류</span>
    <button class="arrow" id="catPrev" aria-label="왼쪽">‹</button>
    <div class="scrollrow" id="catWrap"><div class="cats" id="cats"></div></div>
    <button class="arrow" id="catNext" aria-label="오른쪽">›</button>
    <span class="count" id="cnt"></span>
  </div>
  </div>
<div id="selbar">
    <span class="selcount"><span class="n" id="selN">0</span><span class="t2">건 선택</span></span>
    <button id="selAll" title="지금 보이는 글 전체 선택"><span class="t">전체선택</span></button>
    <button id="selNone" title="선택 모두 해제"><span class="t">선택해제</span></button>
    <span class="divider">|</span>
    <button id="selBk" title="선택한 글을 서재에 담고 원문을 보존해요"><span class="t">서재</span></button>
    <select id="selCat"><option value="">분류…</option></select>
    <div id="prog"><i></i></div>
    <span id="progTxt"></span>
    <button id="selStop" style="display:none" title="남은 보존 작업 중단"><span class="t">중단</span></button>
  </div>
</header>

<section id="crawlPanel" hidden></section>
<main id="list"></main>
<div id="toast"></div>
`;

const APP = String.raw`
var D = JSON.parse(document.getElementById('data').textContent);
var meta = D.meta, cats = D.cats, posts = D.posts;
var CAT = {}; cats.forEach(function(c){ CAT[c.key] = c; });


var esc = function(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
var pad = function(n){ return String(n).padStart(2,'0') };
var fmtD = function(s){ if(!s) return ''; var d=new Date(s);
  return pad(d.getFullYear()%100)+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes()); };
var fmtDShort = function(s){ if(!s) return ''; var d=new Date(s);
  return pad(d.getMonth()+1)+'.'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes()); };
var hl = function(s,q){ var e=esc(s); if(!q) return e;
  return e.replace(new RegExp(q.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&'),'gi'), function(m){return '<mark>'+m+'</mark>'}); };
var fin = function(p){ return p.ml || p.c; };

document.getElementById('h1').textContent = '갤수집기';
var sub = document.getElementById('sub');
sub.textContent = meta.gallery.name + ' · 본문 ' + meta.shown + '건 / 수집 ' + meta.totalStored + '건'
  + (meta.days>0 ? ' (최근 '+meta.days+'일)' : '')
  + ' · 갱신 ' + fmtD(meta.builtAt)
  + (meta.server ? '' : ' · 정적 모드 (편집할 수 없어요)');
document.getElementById('storage').textContent = '서재 ' + meta.bookmarkCount + '건';
sub.title = meta.runs.slice(-8).reverse().map(function(r){
  return r.id+' ('+(r.job||'ad-hoc')+') 신규 '+r.new+' · 본문 '+r.details+(r.err?' · 실패 '+r.err:''); }).join('\n')
  || '실행 이력 없음';

// 수집경로 = 이 글을 어떤 경로로 긁어왔는지 (전체글 / 개념글 / 키워드 검색)
function srcLabel(t){
  if (t === 'all') return '전체글';
  if (t === 'recommend') return '개념글';
  if (t.indexOf('search:') === 0) return t.split(':').slice(2).join(':');   // 키워드만
  return t;
}
[].concat.apply([], posts.map(function(p){return p.src})).filter(function(v,i,a){return a.indexOf(v)===i}).sort()
  .forEach(function(s){ document.getElementById('src').insertAdjacentHTML('beforeend',
    '<option value="'+esc(s)+'">'+esc(srcLabel(s))+'</option>'); });

var S = {q:'', sort:'d', src:'', minr:0, cat:'', flag:''};

/* ---------- 수동 라벨: 서버가 있으면 디스크, 없으면 브라우저 ---------- */
var LS = 'dcgall.labels.' + meta.gallery.id;
var pending = {};
if (!meta.server) {
  try { var raw = localStorage.getItem(LS);
    if (raw) { var saved = JSON.parse(raw); pending = saved;
      posts.forEach(function(p){ if (saved[p.no]) p.ml = saved[p.no].category; }); } } catch(e){}
}
var toast = function(msg, bad){ var t=document.getElementById('toast');
  t.textContent=msg; t.style.borderLeftColor = bad?'var(--warn)':'var(--ok)';
  t.classList.add('show'); clearTimeout(toast._h); toast._h=setTimeout(function(){t.classList.remove('show')},1800); };

function setLabel(no, cat){
  var p = posts.filter(function(x){ return x.no===no })[0]; if(!p) return;
  p.ml = cat || null;
  var rec = cat ? {category:cat, by:'viewer', at:new Date().toISOString()} : null;
  if (meta.server) {
    fetch('/api/labels', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ manual: (function(){ var o={}; o[no]=rec; return o })() })})
      .then(function(r){ return r.json() })
      .then(function(j){ toast(cat ? CAT[cat].label+' 로 저장했어요.' : '수동 분류를 해제했어요 (총 '+j.count+'건)'); })
      .catch(function(){ toast('저장하지 못했어요. 서버 응답이 없어요.', true) });
  } else {
    if (rec) pending[no]=rec; else delete pending[no];
    try { localStorage.setItem(LS, JSON.stringify(pending)); toast('브라우저에 임시 저장했어요. 내보내기로 확정해 주세요.'); }
    catch(e){ toast('브라우저에 저장할 수 없어요. 내보내기를 이용해 주세요.', true); }
  }
  renderCats(); render();
}

document.getElementById('export').addEventListener('click', function(){
  var out = {version:1, updated_at:new Date().toISOString(), manual:{}};
  posts.forEach(function(p){ if(p.ml) out.manual[p.no] = pending[p.no] || {category:p.ml, by:'viewer', at:new Date().toISOString()}; });
  var blob = new Blob([JSON.stringify(out,null,2)], {type:'application/json'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'labels.json'; a.click();
  toast('labels.json 을 내려받았어요. node dcgall/classify.mjs --import <파일> 로 반영해 주세요.');
});

/* ---------- 다중 선택 ---------- */
var SEL = new Set();
var lastIdx = null;      // shift 범위 선택용
var visible = [];        // 현재 화면에 렌더된 순서

function syncSel(){
  document.getElementById('selN').textContent = SEL.size;
  document.getElementById('selbar').classList.toggle('show', SEL.size > 0);
}

function toggleSel(no, on){
  if (on) SEL.add(no); else SEL.delete(no);
  var card = document.querySelector('.sel[data-no="'+no+'"]');
  if (card) card.closest('.card').classList.toggle('picked', on);
  syncSel();
}

// 로우 어디를 눌러도 선택된다. 제목(펼치기)·드롭다운(분류)·링크(원문)·본문 영역만 예외.
var NOSEL = '.ttl,.pick,a,input,textarea,select,button,.body';
document.getElementById('list').addEventListener('click', function(e){
  var card = e.target.closest('.card'); if(!card) return;
  var onBox = !!e.target.closest('.sel');
  if (!onBox && e.target.closest(NOSEL)) return;
  var cb = card.querySelector('.sel'); if(!cb) return;
  var no = Number(cb.dataset.no), idx = visible.indexOf(no);
  var want = onBox ? cb.checked : !SEL.has(no);
  if (!onBox) cb.checked = want;
  if (e.shiftKey && lastIdx !== null && idx >= 0) {
    var a = Math.min(lastIdx, idx), b = Math.max(lastIdx, idx);
    for (var i = a; i <= b; i++) toggleSel(visible[i], want);
  } else {
    toggleSel(no, want);
  }
  lastIdx = idx;
});

document.getElementById('selAll').addEventListener('click', function(){
  visible.forEach(function(no){ SEL.add(no) });
  render(); syncSel();
});
document.getElementById('selNone').addEventListener('click', function(){
  SEL.clear(); lastIdx = null; render(); syncSel();
});

document.getElementById('selCat').addEventListener('change', function(e){
  var cat = e.target.value; if(!cat) return;
  e.target.value = '';
  if (!meta.server) { toast('서버 모드에서만 바꿀 수 있어요. node dcgall/serve.mjs 로 실행해 주세요.', true); return; }
  var nos = [].concat(Array.from(SEL));
  var manual = {}, now = new Date().toISOString();
  nos.forEach(function(no){ manual[no] = {category:cat, by:'bulk', at:now} });
  fetch('/api/labels', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({manual:manual})})
    .then(function(r){ return r.json() })
    .then(function(){
      posts.forEach(function(p){ if (SEL.has(p.no)) p.ml = cat });
      toast(nos.length+'건을 '+CAT[cat].label+' 로 바꿨어요.');
      renderCats(); render();
    })
    .catch(function(err){ toast('바꾸지 못했어요: '+err.message, true) });
});

var pollH = null;
function poll(){
  fetch('/api/queue').then(function(r){ return r.json() }).then(function(j){
    var bar = document.getElementById('prog'), txt = document.getElementById('progTxt');
    if (j.running || j.pending) {
      bar.classList.add('show');
      document.getElementById('selStop').style.display = '';
      var pct = j.total ? Math.round(j.done / j.total * 100) : 0;
      bar.querySelector('i').style.width = pct + '%';
      txt.textContent = '보존 ' + j.done + '/' + j.total
        + (j.current ? ' · ' + String(j.current.title).slice(0,22) : '')
        + (j.errors.length ? ' · 실패 ' + j.errors.length : '');
    } else {
      bar.classList.remove('show');
      document.getElementById('selStop').style.display = 'none';
      if (pollH) {
        clearInterval(pollH); pollH = null;
        txt.textContent = j.total ? '보존 완료 ' + j.done + '건' + (j.errors.length ? ' (실패 '+j.errors.length+')' : '') : '';
        toast('보존을 마쳤어요 · ' + j.done + '건' + (j.errors.length ? ' (실패 '+j.errors.length+'건)' : ''));
      }
    }
  }).catch(function(){});
}

document.getElementById('selBk').addEventListener('click', function(){
  if (!meta.server) { toast('서버 모드에서만 담을 수 있어요. 터미널에서 node dcgall/serve.mjs 로 실행해 주세요.', true); return; }
  var nos = Array.from(SEL); if (!nos.length) return;
  if (nos.length > 30 && !confirm(nos.length+'건을 보존할까요?\n글마다 몇 초씩 걸려서 대략 '
      + Math.ceil(nos.length*5/60) + '분 정도 소요돼요.')) return;
  fetch('/api/bookmark/bulk', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({nos:nos, on:true})})
    .then(function(r){ return r.json() })
    .then(function(j){
      if (j.error) throw new Error(j.error);
      posts.forEach(function(p){ if (SEL.has(p.no)) p.bk = 1 });
      meta.bookmarkCount = j.count;
      document.getElementById('storage').textContent = '서재 ' + j.count + '건';
      toast(j.added+'건을 서재에 담았어요. '+j.queued+'건은 순서대로 보존 중이에요.');
      SEL.clear(); lastIdx = null; render(); syncSel();
      if (j.queued && !pollH) { poll(); pollH = setInterval(poll, 1200); }
    })
    .catch(function(err){ toast('처리하지 못했어요: '+err.message, true) });
});

document.getElementById('selStop').addEventListener('click', function(){
  fetch('/api/queue/stop', {method:'POST'}).then(function(){ toast('남은 보존 작업을 중단했어요.') });
});

/* ---------- 수집 패널 ---------- */
var crawlOpen = false, crawlPoll = null, JOBS = [], crawlJob = 'daily';
var WATCH = {keywords:[], scope:'both', pages:2, expanded:0, concepts:[], preview:{}};

var JOBNAME = {daily:'매일 가볍게', sweep:'가끔 몰아서', watch:'키워드로 찾기'};

function renderCrawl(st){
  var el = document.getElementById('crawlPanel');
  if (!crawlOpen) { el.hidden = true; return; }
  el.hidden = false;

  // 진행 중이면 진행 상황만 보여준다
  if (st && st.running) {
    var pct = st.total ? Math.round(st.done / st.total * 100) : 0;
    el.innerHTML = '<div class="glbox"><h3>수집 중</h3>'
      + '<div><b>' + esc(JOBNAME[st.job] || st.job) + '</b>, '
      + (st.phase === 'list' ? '목록' : '본문') + ' ' + st.done + '/' + st.total + '</div>'
      + '<div class="pbar"><i style="width:' + pct + '%"></i></div>'
      + '<div class="metrics">' + esc(st.label || '') + '</div>'
      + '<div class="plog">' + esc((st.logs || []).join('\n')) + '</div>'
      + '<div style="margin-top:11px"><button class="ctl" id="crawlStop">중단</button></div></div>';
    return;
  }

  var job = JOBS.filter(function(j){ return j.key === crawlJob })[0] || JOBS[0];
  var h = '<div class="glbox"><h3>새 글 수집</h3>'
    + '<div class="seg jobseg">' + JOBS.map(function(j){
        return '<button data-job="'+esc(j.key)+'"'+(j.key===crawlJob?' class="on"':'')+'>'
          + esc(JOBNAME[j.key] || j.key) + '</button>' }).join('') + '</div>'
    + '<p class="d jobdesc">' + esc(job ? job.desc : '') + '</p>';

  // 옵션: 키워드로 찾기일 때만 감시 목록을 편집한다
  if (crawlJob === 'watch') {
    h += '<div class="kwbox"><div class="kwhead">감시할 키워드 '
       + '<span class="g">'+WATCH.keywords.length+'개, 실제 검색어 '+WATCH.expanded+'개</span></div>'
       + '<div class="tagbar">'
       + WATCH.keywords.map(function(k){
           if (k.indexOf('@') !== 0)
             return '<span class="tag" data-kw="'+esc(k)+'">'+esc(k)+'<span class="x">×</span></span>';
           var c = WATCH.concepts.filter(function(x){ return x.ref===k })[0];
           return '<span class="tag ref" data-kw="'+esc(k)+'" title="'+esc((WATCH.preview[k]||[]).join(', '))+'">사전 · '
             + esc(c?c.label:k)+' <span class="g">'+(WATCH.preview[k]||[]).length+'</span><span class="x">×</span></span>';
         }).join('')
       + '<input class="tagin" id="kwAdd" placeholder="+ 키워드 (Enter)"></div>'
       + '<div class="kwopt"><label>사전에서 넣기'
       + '<select id="kwConcept"><option value="">개념 묶음 고르기…</option>'
       + WATCH.concepts.filter(function(c){ return WATCH.keywords.indexOf(c.ref)<0 })
           .map(function(c){ return '<option value="'+esc(c.ref)+'">'+esc(c.label)+' ('+c.n+'개)</option>' }).join('')
       + '</select></label>'
       + '<label>찾는 범위<select id="kwScope">'
       + '<option value="both"'+(WATCH.scope==='both'?' selected':'')+'>제목+본문</option>'
       + '<option value="title"'+(WATCH.scope==='title'?' selected':'')+'>제목만</option></select></label>'
       + '<label>키워드당 <select id="kwPages">'
       + [1,2,3,5].map(function(n){ return '<option value="'+n+'"'+(WATCH.pages===n?' selected':'')+'>'+n+'쪽</option>' }).join('')
       + '</select></label>'
       + '<span class="g">요청 '+(WATCH.expanded*WATCH.pages)+'회, 약 '
       + Math.ceil(WATCH.expanded*WATCH.pages*1.5/60)+'분</span></div></div>';
  }

  h += '<div class="runrow"><button class="ctl primary" id="crawlRun">실행</button>';
  if (st && st.result) {
    var r = st.result;
    h += r.error
      ? '<span class="why">수집하지 못했어요: ' + esc(r.error) + '</span>'
      : '<span class="why">직전 실행 <b>' + esc(r.runId) + '</b>, 수집 ' + r.seen + '건, 새 글 <b>' + r.added
        + '</b>건, 본문 ' + r.details + '건' + (r.errors ? ', 실패 ' + r.errors + '건' : '')
        + (r.stopped ? ' (중단됨)' : '')
        + (r.added ? '  <a href="#" id="reloadAfter">새로고침해서 반영하기</a>' : '') + '</span>';
  }
  h += '</div>';
  el.innerHTML = h + '</div>';
}

function pollCrawl(){
  fetch('/api/crawl').then(function(r){ return r.json() }).then(function(st){
    JOBS = st.jobs || JOBS;
    if (st.watch) WATCH = st.watch;
    renderCrawl(st);
    document.getElementById('crawlBtn').disabled = !!st.running;
    if (st.running && !crawlPoll) crawlPoll = setInterval(pollCrawl, 900);
    if (!st.running && crawlPoll) {
      clearInterval(crawlPoll); crawlPoll = null;
      if (st.result && !st.result.error)
        toast('수집을 마쳤어요 · 새 글 ' + st.result.added + '건' + (st.result.added ? ' (새로고침하면 반영돼요)' : ''));
    }
  }).catch(function(){});
}

document.getElementById('crawlBtn').addEventListener('click', function(e){
  if (!meta.server) { toast('수집은 서버 모드에서만 돼요. node dcgall/serve.mjs 로 실행해 주세요.', true); return; }
  crawlOpen = !crawlOpen;
  pollCrawl();
  if (crawlOpen) window.scrollTo({top:0, behavior:'smooth'});
  else document.getElementById('crawlPanel').hidden = true;
});
document.getElementById('crawlPanel').addEventListener('keydown', function(e){
  if (e.key !== 'Enter' || e.target.id !== 'kwAdd') return;
  e.preventDefault();
  var v = e.target.value.trim(); if(!v) return;
  if (WATCH.keywords.indexOf(v) < 0) WATCH.keywords.push(v);
  e.target.value = '';
  saveKeywords(WATCH.keywords, WATCH.scope, WATCH.pages);
});
document.getElementById('crawlPanel').addEventListener('change', function(e){
  if (e.target.id === 'kwConcept' && e.target.value) {
    if (WATCH.keywords.indexOf(e.target.value) < 0) WATCH.keywords.push(e.target.value);
    saveKeywords(WATCH.keywords, WATCH.scope, WATCH.pages);
  }
  if (e.target.id === 'kwScope') { WATCH.scope = e.target.value; saveKeywords(WATCH.keywords, WATCH.scope, WATCH.pages); }
  if (e.target.id === 'kwPages') { WATCH.pages = Number(e.target.value); saveKeywords(WATCH.keywords, WATCH.scope, WATCH.pages); }
});
document.getElementById('crawlPanel').addEventListener('click', function(e){
  var kw = e.target.closest('.tag[data-kw]');
  if (kw) {
    WATCH.keywords = WATCH.keywords.filter(function(k){ return k !== kw.dataset.kw });
    saveKeywords(WATCH.keywords, WATCH.scope, WATCH.pages);
    return;
  }
  var j = e.target.closest('.jobseg button');
  if (j) { crawlJob = j.dataset.job; pollCrawl(); return; }
  if (e.target.id === 'crawlRun') {
    fetch('/api/crawl', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({job: crawlJob})})
      .then(function(r){ return r.json() })
      .then(function(x){ if (x.error) { toast(x.error, true); return; }
        toast(JOBNAME[x.job] + ' 수집을 시작했어요.'); pollCrawl(); });
    return;
  }
  if (e.target.id === 'crawlStop') {
    fetch('/api/crawl', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{"stop":true}'})
      .then(function(){ toast('중단을 요청했어요. 진행 중인 요청까지만 마치고 멈춰요.') });
    return;
  }
  if (e.target.id === 'reloadAfter') { e.preventDefault(); location.reload(); }
});

/* ---------- 필터 / 렌더 ---------- */
function match(p){
  if (S.cat && fin(p) !== S.cat) return false;
  if (S.src && p.src.indexOf(S.src) < 0) return false;
  if ((p.rc||0) < S.minr) return false;
  if (S.flag === 'amb' && (!p.amb || p.ml)) return false;
  if (S.flag === 'ed'  && !p.ml) return false;
  if (!S.q) return true;
  var q = S.q.toLowerCase();
  return (p.t||'').toLowerCase().indexOf(q) >= 0
      || (p.b||'').toLowerCase().indexOf(q) >= 0
      || (p.a||'').toLowerCase().indexOf(q) >= 0
      || p.cm.some(function(c){ return (c.x||'').toLowerCase().indexOf(q) >= 0 });
}

function renderCats(){
  var counts = {}; posts.forEach(function(p){ var k=fin(p); counts[k]=(counts[k]||0)+1 });
  var amb = posts.filter(function(p){ return p.amb && !p.ml }).length;
  var ed  = posts.filter(function(p){ return !!p.ml }).length;
  var html = '<span class="cat' + (S.cat===''?' on':'') + '" data-cat="">전체<span class="n">'+posts.length+'</span></span>';
  cats.forEach(function(c){
    html += '<span class="cat'+(S.cat===c.key?' on':'')+'" data-cat="'+c.key+'" title="'+esc(c.desc)+'">'
          + esc(c.label)+'<span class="n">'+(counts[c.key]||0)+'</span></span>';
  });
  // 검토가 필요한 상태도 같은 줄에서 고른다 (별도 '보기' 줄을 두지 않는다)
  if (amb) html += '<span class="cat flag'+(S.flag==='amb'?' on':'')+'" data-flag="amb" title="자동분류가 애매해 확인이 필요해요">애매<span class="n">'+amb+'</span></span>';
  if (ed)  html += '<span class="cat flag'+(S.flag==='ed'?' on':'')+'" data-flag="ed" title="내가 직접 분류를 바꾼 글이에요">수정<span class="n">'+ed+'</span></span>';
  document.getElementById('cats').innerHTML = html;
  if (typeof updCats === 'function') requestAnimationFrame(updCats);
}

function picker(p){
  var cur = fin(p);
  var o = cats.map(function(c){
    return '<option value="'+c.key+'"'+(c.key===cur?' selected':'')+'>'+esc(c.label)+'</option>';
  }).join('');
  return '<select class="pick" data-no="'+p.no+'" title="'+(p.ml?'수동 지정됨':'자동 분류 · 점수 '+p.cs)+'">'+o+'</select>';
}

function card(p){
  var cm = p.cm.map(function(c){
    return '<div class="cmt'+(c.dp?' re':'')+'"><span class="n">'+esc(c.n)+'</span>'+hl(c.x,S.q)+'</div>'; }).join('');
  var cls = 'card' + (p.ml ? ' edited' : (p.amb ? ' amb' : '')) + (SEL.has(p.no) ? ' picked' : '');
  return '<article class="'+cls+'">'
    // 1행 — 제목이 주역, 원문 링크는 오른쪽 끝
    + '<div class="row r1">'
      + '<input type="checkbox" class="sel" data-no="'+p.no+'"'+(SEL.has(p.no)?' checked':'')+'>'
      + (p.bk ? '<span class="inlib" title="서재에 담긴 글이에요">★</span>' : '')
      + '<span class="ttl" title="'+esc(p.t)+'">'+hl(p.t,S.q)+'</span>'
      + '<a class="go" href="'+esc(p.u)+'" target="_blank" rel="noopener" title="디시 원문으로 이동해요">원문 ↗</a>'
    + '</div>'
    // 2행 — 분류 / 말머리 / 일시 / 지표
    + '<div class="row r2">'
      + picker(p)
      + (p.h ? '<span class="chip">'+esc(p.h)+'</span>' : '')
      + '<span class="metrics date" title="작성 시각">'+fmtD(p.d)+'</span>'
      + '<span class="metrics nums">'
        + '<span class="m-rec">추천 <b>'+(p.rc||0)+'</b></span>'
        + '<span class="m-view"> · 조회 '+(p.v||0)+'</span>'
        + '<span class="m-cmt"> · 댓글 '+(p.cc||0)+'</span>'
      + '</span>'
    + '</div>'
    + '<div class="body">'
      + (p.b ? '<div class="txt">'+hl(p.b,S.q)+'</div>'
             : '<div class="metrics">본문은 아직 수집하지 않았어요. 원문 링크로 확인해 주세요.</div>')
      + (p.img.length ? '<div class="imgs">'+p.img.map(function(s){return '<img loading="lazy" src="'+esc(s)+'" alt="">'}).join('')+'</div>' : '')
      + (cm ? '<div class="cmts">'+cm+'</div>' : '')
    + '</div></article>';
}

function render(){
  var rows = posts.filter(match).sort(function(a,b){
    return S.sort==='d' ? String(b.d).localeCompare(String(a.d))
         : S.sort==='seen' ? String(b.seen).localeCompare(String(a.seen))
         : (b[S.sort]||0)-(a[S.sort]||0); });
  visible = rows.map(function(r){ return r.no });
  document.getElementById('cnt').textContent = rows.length + '건';
  document.getElementById('list').innerHTML = rows.length
    ? rows.map(card).join('') : '<div class="empty">조건에 맞는 글이 없습니다.</div>';
  syncSel();
}

/* 분류 탭: 한 줄 유지 + 좌우 스크롤 */
function wireScroll(wrapId, railId, prevId, nextId){
  var wrap = document.getElementById(wrapId), rail = document.getElementById(railId);
  var prev = document.getElementById(prevId), next = document.getElementById(nextId);
  if (!wrap || !rail) return function(){};
  function upd(){
    var over = rail.scrollWidth - rail.clientWidth;
    var can = over > 4;
    prev.classList.toggle('show', can); next.classList.toggle('show', can);
    wrap.classList.toggle('l', can && rail.scrollLeft > 2);
    wrap.classList.toggle('r', can && rail.scrollLeft < over - 2);
  }
  rail.addEventListener('scroll', upd);
  window.addEventListener('resize', upd);
  prev.addEventListener('click', function(){ rail.scrollBy({left:-rail.clientWidth*0.7, behavior:'smooth'}) });
  next.addEventListener('click', function(){ rail.scrollBy({left: rail.clientWidth*0.7, behavior:'smooth'}) });
  // 세로 휠을 가로 스크롤로
  rail.addEventListener('wheel', function(e){
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    if (rail.scrollWidth <= rail.clientWidth) return;
    e.preventDefault(); rail.scrollLeft += e.deltaY;
  }, {passive:false});
  return upd;
}
var updCats = wireScroll('catWrap','cats','catPrev','catNext');

document.getElementById('cats').addEventListener('click', function(e){
  var c = e.target.closest('.cat'); if(!c) return;
  if (c.dataset.flag !== undefined) { S.flag = (S.flag === c.dataset.flag) ? '' : c.dataset.flag; }
  else { S.cat = (S.cat === c.dataset.cat) ? '' : c.dataset.cat; }
  renderCats(); render();
});
document.getElementById('list').addEventListener('click', function(e){
  var t = e.target.closest('.ttl'); if (t) t.closest('.card').classList.toggle('open');
});
document.getElementById('list').addEventListener('change', function(e){
  var s = e.target.closest('.pick'); if (s) setLabel(Number(s.dataset.no), s.value);
});
var deb = function(f,ms){ var h; return function(){ var a=arguments; clearTimeout(h);
  h=setTimeout(function(){f.apply(null,a)},ms); }; };
document.getElementById('q').addEventListener('input', deb(function(e){ S.q=e.target.value.trim(); render(); },180));
document.getElementById('sort').addEventListener('change', function(e){ S.sort=e.target.value; render() });
document.getElementById('src').addEventListener('change', function(e){ S.src=e.target.value; render() });
document.getElementById('minr').addEventListener('change', function(e){ S.minr=+e.target.value; render() });

document.addEventListener('keydown', function(e){
  if(e.key==='/' && e.target.tagName!=='INPUT'){ e.preventDefault(); document.getElementById('q').focus(); }});

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

renderCats(); render();
if (meta.server) { poll(); pollCrawl(); }
`;
