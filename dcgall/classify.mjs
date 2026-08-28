#!/usr/bin/env node
// 분류 점검·조정 CLI
//   node dcgall/classify.mjs                  분류 분포 요약
//   node dcgall/classify.mjs --show guide      해당 분류로 잡힌 제목 나열
//   node dcgall/classify.mjs --show ambiguous  애매한 것만
//   node dcgall/classify.mjs --explain 373405  한 글의 점수 내역
//   node dcgall/classify.mjs --set 373405 guide   수동 라벨 지정 (--set 373405 - 로 해제)
//   node dcgall/classify.mjs --import ~/Downloads/labels.json   뷰어(정적 모드) 내보내기 병합
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.mjs';
import { Labels } from './lib/labels.mjs';
import { compile, classify } from './lib/classify.mjs';
import { Glossary } from './lib/glossary.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf('--' + n); return i < 0 ? null : (argv[i + 1] ?? true); };
const setArgs = (() => { const i = argv.indexOf('--set'); return i < 0 ? null : [argv[i + 1], argv[i + 2]]; })();

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const galleryId = flag('gallery') || cfg.gallery.id;
const glos = new Glossary(ROOT);
const tax = compile(JSON.parse(fs.readFileSync(path.join(ROOT, 'taxonomy.json'), 'utf8')), glos);
const store = new Store(ROOT, galleryId);
const labels = new Labels(ROOT, galleryId);

const imp = flag('import');
if (imp && imp !== true) {
  const incoming = JSON.parse(fs.readFileSync(String(imp), 'utf8'));
  const n = labels.merge(incoming.manual || incoming);
  labels.save();
  console.log(`수동 라벨 ${n}건 병합 → 총 ${labels.count}건 (${labels.file})`);
  process.exit(0);
}

if (setArgs) {
  const [no, cat] = setArgs;
  labels.set(no, cat === '-' ? null : cat, 'cli').save();
  console.log(cat === '-' ? `${no} 수동 라벨 해제` : `${no} → ${cat} 로 고정`);
  process.exit(0);
}

const posts = [...store.load().values()].filter((p) => !p.is_notice);
const rows = posts.map((p) => {
  const auto = classify(p, tax);
  const man = labels.get(p.no);
  return { p, auto, man, final: man?.category || auto.category };
});

const explain = flag('explain');
if (explain) {
  const r = rows.find((x) => String(x.p.no) === String(explain));
  if (!r) { console.error('없는 글번호'); process.exit(1); }
  console.log(`\n[${r.p.no}] ${r.p.title}`);
  console.log(`말머리 ${r.p.headtext} · 추천 ${r.p.recommend} · 본문 ${r.p.detail ? '있음' : '없음'}`);
  console.log(`\n점수:`, Object.entries(r.auto.scores).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  '));
  console.log(`판정: ${r.auto.label} (확신 ${r.auto.confidence}${r.auto.ambiguous ? ', 애매' : ''})`);
  console.log(`근거: ${r.auto.hits.join(', ') || '없음'}`);
  if (r.man) console.log(`수동 라벨: ${r.man.category} (${r.man.by})`);
  process.exit(0);
}

const show = flag('show');
if (show) {
  const sel = show === 'ambiguous'
    ? rows.filter((r) => !r.man && r.auto.ambiguous && r.auto.category !== 'etc')
    : rows.filter((r) => r.final === show);
  console.log(`\n=== ${show} (${sel.length}건) ===`);
  for (const r of sel.sort((a, b) => b.auto.score - a.auto.score).slice(0, Number(flag('n') || 60))) {
    const mark = r.man ? '✎' : r.auto.ambiguous ? '?' : ' ';
    const alt = r.auto.also?.length ? ` ~${r.auto.also.join(',')}` : '';
    console.log(`${mark} ${String(r.p.no).padEnd(7)} ${String(r.auto.score).padStart(5)} ${r.p.title.slice(0, 58).padEnd(58)}${alt}`);
  }
  process.exit(0);
}

const dist = {};
for (const r of rows) dist[r.final] = (dist[r.final] || 0) + 1;
const amb = rows.filter((r) => !r.man && r.auto.ambiguous && r.auto.category !== 'etc').length;
const withBody = rows.filter((r) => r.p.detail).length;

console.log(`\n갤러리 ${galleryId} · 글 ${rows.length}건 (본문 수집 ${withBody}건) · 수동 라벨 ${labels.count}건\n`);
for (const c of [...tax.cats, { key: 'etc', label: '기타', emoji: '·' }]) {
  const n = dist[c.key] || 0;
  const bar = '█'.repeat(Math.round((n / rows.length) * 40));
  console.log(`  ${(c.emoji + ' ' + c.label).padEnd(16)} ${String(n).padStart(4)}  ${bar}`);
}
console.log(`\n  애매(2순위와 근접) ${amb}건 → node dcgall/classify.mjs --show ambiguous`);
console.log(`  분류가 틀리면 taxonomy.json 을 고치거나, 뷰어에서 직접 바꾸면 labels.json 에 남는다.`);
