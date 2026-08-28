#!/usr/bin/env node
// 북마크·아카이브 CLI
//   node dcgall/archive.mjs --add 373405           서재에 담기 + 원문 통째로 보존
//   node dcgall/archive.mjs --add 373405 --note "글자수 지침 참고" --tags 지침,참고
//   node dcgall/archive.mjs --rm 373405            서재에서 빼기 (보존 파일은 남는다)
//   node dcgall/archive.mjs --sync                 서재에 담겼는데 아직 안 떠온 것 전부 보존
//   node dcgall/archive.mjs --verify               원문이 지워졌는지 확인 → gone 표시
//   node dcgall/archive.mjs --prune                서재에 없는 보존본 정리
//   node dcgall/archive.mjs                        현황
import fs from 'node:fs';
import path from 'node:path';
import { setDataDir, dataArg, confFile } from './lib/paths.mjs';
import { fileURLToPath } from 'node:url';
import { Http } from './lib/http.mjs';
import { Store } from './lib/store.mjs';
import { Archive } from './lib/archive.mjs';
import { Bookmarks } from './lib/bookmarks.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
setDataDir(ROOT, dataArg(argv));
const flag = (n) => { const i = argv.indexOf('--' + n); return i < 0 ? null : (argv[i + 1] ?? true); };

const cfg = JSON.parse(fs.readFileSync(confFile(ROOT, 'config.json'), 'utf8'));
const galleryId = flag('gallery') || cfg.gallery.id;
const http = new Http(cfg.http);
const store = new Store(ROOT, galleryId);
const arc = new Archive(ROOT, galleryId);
const bm = new Bookmarks(ROOT, galleryId);
const gallery = { ...cfg.gallery, id: galleryId };
const mb = (b) => (b / 1048576).toFixed(1) + 'MB';

async function capture(no, base) {
  const r = await arc.capture(http, gallery, no, base || {});
  bm.markArchived(no, true);
  const s = r.snapshot;
  console.log(`  ${r.gone ? '⚠ 원문 없음' : '보존'} ${no} · 본문 ${s.body_text ? s.body_text.length + '자' : '-'}` +
              ` · 댓글 ${s.comments?.length ?? 0} · 이미지 ${s.local_images?.filter((i) => i.file).length ?? 0}`);
  return r;
}

const add = flag('add');
if (add && add !== true) {
  const no = Number(add);
  const base = store.load().get(no) || {};
  bm.add(no, {
    note: flag('note') ? String(flag('note')) : '',
    tags: flag('tags') ? String(flag('tags')).split(',').map((s) => s.trim()).filter(Boolean) : [],
  });
  await capture(no, base);
  bm.save();
  console.log(`서재 ${bm.count}건`);
  process.exit(0);
}

const rm = flag('rm');
if (rm && rm !== true) {
  bm.remove(Number(rm)).save();
  console.log(`${rm} 서재에서 뺐다 (보존 파일은 그대로 남아있다 — 지우려면 data/${galleryId}/archive/${rm} 삭제)`);
  process.exit(0);
}

if (flag('sync')) {
  const todo = bm.list().filter((b) => !arc.has(b.no) || flag('force'));
  console.log(`보존할 글 ${todo.length}건`);
  const posts = store.load();
  for (const b of todo) {
    try { await capture(b.no, posts.get(b.no) || {}); }
    catch (e) { console.log(`  [실패] ${b.no}: ${e.message}`); }
  }
  bm.save();
  const { bytes, files } = arc.size();
  console.log(`\n아카이브 ${arc.list().length}건 · 파일 ${files}개 · ${mb(bytes)}`);
  process.exit(0);
}

if (flag('verify')) {
  const targets = arc.list();
  console.log(`원문 생존 확인 ${targets.length}건`);
  const tally = {};
  for (const no of targets) {
    const r = await arc.verify(http, gallery, no);
    tally[r.status] = (tally[r.status] || 0) + 1;
    if (r.status === 'gone-now') console.log(`  ⚠ ${no} 원문이 삭제됨 — 아카이브로만 남는다`);
    if (r.status === 'restored') console.log(`  ↩ ${no} 원문 복구됨`);
  }
  console.log('\n' + Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(' · '));
  process.exit(0);
}

if (flag('prune')) {
  const orphans = arc.list().filter((no) => !bm.has(no));
  if (!orphans.length) { console.log('정리할 게 없다.'); process.exit(0); }
  console.log(`서재에 없는 보존본 ${orphans.length}건: ${orphans.join(', ')}`);
  if (!flag('yes')) { console.log('실제로 지우려면 --yes 를 붙여라.'); process.exit(0); }
  for (const no of orphans) fs.rmSync(arc.path(no), { recursive: true, force: true });
  console.log(`${orphans.length}건 삭제`);
  process.exit(0);
}

const { bytes, files } = arc.size();
const gone = arc.list().map((n) => arc.load(n)).filter((s) => s?.gone).length;
console.log(`\n갤러리 ${galleryId}`);
console.log(`  서재      ${bm.count}건`);
console.log(`  보존본    ${arc.list().length}건 · 파일 ${files}개 · ${mb(bytes)}`);
console.log(`  원문 삭제 ${gone}건 (보존본으로만 읽힘)`);
const notYet = bm.list().filter((b) => !arc.has(b.no)).length;
if (notYet) console.log(`\n  아직 안 떠온 것 ${notYet}건 → node dcgall/archive.mjs --sync`);
const orphan = arc.list().filter((no) => !bm.has(no)).length;
if (orphan) console.log(`  서재에 없는 보존본 ${orphan}건 → node dcgall/archive.mjs --prune`);
console.log(`\n  내 서재: node dcgall/serve.mjs 후 http://127.0.0.1:8787/library`);
