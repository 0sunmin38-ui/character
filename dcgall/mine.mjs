#!/usr/bin/env node
// 은어 채굴기 — 저장된 글에서 아직 사전에 없는 말을 찾아 candidates 로 쌓는다.
//   node dcgall/mine.mjs                    후보 갱신 + 상위 목록 출력
//   node dcgall/mine.mjs --min 4 --n 60     최소 등장 글 수 / 출력 개수
//   node dcgall/mine.mjs --promote 야호호 --type meta --gloss "NSFW 상황" --concept -
//   node dcgall/mine.mjs --reject 그리고
//   node dcgall/mine.mjs --brief            GLOSSARY.md (문맥 브리핑) 재생성
//
// 기각한 말은 stopwords 로 남아 다시는 후보에 오르지 않는다. 쓸수록 정확해지는 구조.
import fs from 'node:fs';
import path from 'node:path';
import { setDataDir, dataArg, confFile } from './lib/paths.mjs';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.mjs';
import { Glossary } from './lib/glossary.mjs';
import { mine, SEED_STOP } from './lib/miner.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
setDataDir(ROOT, dataArg(argv));
const flag = (n) => { const i = argv.indexOf('--' + n); return i < 0 ? null : (argv[i + 1] ?? true); };

const cfg = JSON.parse(fs.readFileSync(confFile(ROOT, 'config.json'), 'utf8'));
const galleryId = flag('gallery') || cfg.gallery.id;
const glos = new Glossary(ROOT);
const store = new Store(ROOT, galleryId);

glos.data.stopwords ||= [];

/* ── 후보 승격 / 기각 / 브리핑 ─────────────────────────────── */
const promote = flag('promote');
if (promote && promote !== true) {
  const concept = flag('concept');
  glos.promote(String(promote), {
    type: String(flag('type') || 'meta'),
    canon: flag('canon') ? String(flag('canon')) : String(promote),
    gloss: String(flag('gloss') || ''),
    aliases: flag('aliases') ? String(flag('aliases')).split(',') : [],
    concept: concept && concept !== '-' ? String(concept) : null,
  }).save();
  console.log(`'${promote}' 를 확정 용어로 등록했다.`);
  process.exit(0);
}
const reject = flag('reject');
if (reject && reject !== true) {
  glos.reject(String(reject));
  if (!glos.data.stopwords.includes(String(reject))) glos.data.stopwords.push(String(reject));
  glos.save();
  console.log(`'${reject}' 기각 — 앞으로 후보에 오르지 않는다.`);
  process.exit(0);
}

/* ── 문맥 브리핑 문서 ─────────────────────────────────────── */
if (flag('brief')) {
  const g = glos.data;
  const byType = {};
  for (const [t, v] of Object.entries(g.terms)) (byType[v.type] ||= []).push([t, v]);
  const L = [];
  L.push(`# ${cfg.gallery.name} 은어 사전`, '');
  L.push('`dcgall/glossary.json` 에서 자동 생성. 이 갤러리 글을 읽거나 분류할 때의 문맥 기준이다.', '');
  L.push('## 개념 묶음', '');
  L.push('플랫폼마다 이름만 다른 같은 개념. 분류기는 이 묶음 단위로 판단한다.', '');
  for (const [k, c] of Object.entries(g.concepts)) {
    const members = Object.entries(g.terms).filter(([, v]) => v.concept === k).map(([t]) => t);
    L.push(`- **${c.label}** (\`${k}\`) — ${c.desc}`);
    if (members.length) L.push(`  - 표면형: ${members.map((m) => '`' + m + '`').join(', ')}`);
  }
  L.push('', '## 용어', '');
  for (const [type, list] of Object.entries(byType)) {
    L.push(`### ${g.types[type] || type}`, '');
    L.push('| 말 | 뜻 | 별칭 | 확인 |', '|---|---|---|---|');
    for (const [t, v] of list.sort((a, b) => a[0].localeCompare(b[0], 'ko'))) {
      L.push(`| \`${t}\` | ${v.canon}${v.gloss ? ' — ' + v.gloss : ''} | ${(v.aliases || []).join(', ') || '-'} | ${v.confirmed ? '✅' : '❔'} |`);
    }
    L.push('');
  }
  L.push('## 조어 규칙', '');
  for (const p2 of g.patterns) L.push(`- **${p2.canon}** — ${p2.gloss}  \`/${p2.re}/\``);
  const pend = Object.entries(g.candidates || {}).filter(([, v]) => v.status !== 'rejected')
    .sort((a, b) => (b[1].score || 0) - (a[1].score || 0)).slice(0, 40);
  if (pend.length) {
    L.push('', '## 미확인 후보', '', '채굴됐지만 아직 뜻을 안 단 말들. 뷰어 사전 패널에서 확정/기각한다.', '');
    L.push('| 말 | 등장 | 추정 | 예시 |', '|---|---|---|---|');
    for (const [w, v] of pend) L.push(`| \`${w}\` | ${v.count} | ${v.guess_type || '-'} | ${(v.examples?.[0] || '').replace(/\|/g, '/')} |`);
  }
  const out = path.join(ROOT, 'GLOSSARY.md');
  fs.writeFileSync(out, L.join('\n') + '\n', 'utf8');
  console.log(`브리핑 생성: ${out}  (용어 ${Object.keys(g.terms).length} · 후보 ${pend.length})`);
  process.exit(0);
}

/* ── 채굴 ──────────────────────────────────────────────────── */
const { ranked, added, posts: nPosts } = mine(ROOT, galleryId, glos, { min: Number(flag('min') || 2) });
const MIN = Number(flag('min') || 2);

glos.save();

const pending = Object.entries(glos.data.candidates).filter(([, v]) => v.status !== 'rejected');
console.log(`\n글 ${nPosts}건에서 채굴 · 신규 후보 ${added}개 · 미확인 누적 ${pending.length}개`);
console.log(`확정 용어 ${Object.keys(glos.data.terms).length}개 · 기각어 ${glos.data.stopwords.length}개\n`);

const N = Number(flag('n') || 30);
console.log(`  ${'후보'.padEnd(13)} 점수 제목 태그  추정        예시 / 같이 나온 사전어`);
for (const r of ranked.filter((r) => glos.data.candidates[r.w]?.status !== 'rejected' && r.n >= MIN).slice(0, N)) {
  const g = r.guess ? `${r.guess.type}?(${r.guess.from})` : '';
  console.log(`  ${r.w.padEnd(13)} ${String(r.score).padStart(5)} ${String(r.tdf).padStart(4)} ${String(r.tg).padStart(4)}  ${g.padEnd(20)} ${(r.ex[0] || r.ctx.join(',')).slice(0, 44)}`);
}
console.log(`\n  확정: node dcgall/mine.mjs --promote <말> --type <platform|model|concept|artifact|role|action|meta> --gloss "뜻"`);
console.log(`  기각: node dcgall/mine.mjs --reject <말>        (뷰어 사전 패널에서 클릭으로도 된다)`);
