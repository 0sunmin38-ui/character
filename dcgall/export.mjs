#!/usr/bin/env node
// 공개용 내보내기 — 원본 데이터에서 식별정보를 떼어낸 사본을 만든다.
// 원본(data/)은 건드리지 않는다.
//
//   node dcgall/export.mjs --level meta   제목·날짜·지표·분류만
//   node dcgall/export.mjs --level text   + 본문·댓글
//   node dcgall/export.mjs --level full   + 원문 링크·이미지 주소 (파일 사본은 안 넣음)
//
// 어떤 단계에서도 나가지 않는 것
//   닉네임 · 고정닉 uid · 댓글 IP 조각 · 이미지 파일 사본 · 원본 HTML
import fs from 'node:fs';
import path from 'node:path';
import { setDataDir, confFile } from './lib/paths.mjs';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.mjs';
import { Labels } from './lib/labels.mjs';
import { Glossary } from './lib/glossary.mjs';
import { compile, classify } from './lib/classify.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  [...process.argv.slice(2).join(' ').matchAll(/--([\w-]+)(?:[= ]([^-\s]\S*))?/g)].map((m) => [m[1], m[2] ?? true])
);
setDataDir(ROOT, args.data ? String(args.data) : null);
const cfg = JSON.parse(fs.readFileSync(confFile(ROOT, 'config.json'), 'utf8'));
const galleryId = args.gallery || cfg.gallery.id;
const level = String(args.level || 'meta');
if (!['meta', 'text', 'full'].includes(level)) {
  console.error('--level 은 meta, text, full 중 하나여야 해요.');
  process.exit(1);
}
const outDir = path.resolve(String(args.out || path.join(ROOT, 'public')));

const glos = new Glossary(ROOT);
const tax = compile(JSON.parse(fs.readFileSync(confFile(ROOT, 'taxonomy.json'), 'utf8')), glos);
const store = new Store(ROOT, galleryId);
const labels = new Labels(ROOT, galleryId);

const all = [...store.load().values()].filter((p) => !p.is_notice);
let strippedNick = 0, strippedIp = 0, strippedUid = 0, droppedImg = 0;

const rows = all.map((p) => {
  const auto = classify(p, tax);
  const man = labels.get(p.no);
  if (p.author?.nick) strippedNick++;
  if (p.author?.uid) strippedUid++;
  if (level !== 'full') droppedImg += p.detail?.images?.length || 0;

  const rec = {
    no: p.no,
    title: p.title,
    headtext: p.headtext,
    date: p.date,
    views: p.views, recommend: p.recommend, comment_count: p.comment_count,
    category: man?.category || auto.category,
    category_by: man ? 'manual' : 'auto',
    from: p.from,
  };
  if (level === 'text' || level === 'full') {
    rec.body_text = p.detail?.body_text || null;
    rec.comments = (p.comments || [])
      .filter((c) => c.text && !c.is_deleted)
      .map((c) => {
        if (c.ip) strippedIp++;
        return { depth: c.depth, date: c.date, text: c.text };   // 닉·uid·IP 전부 뺀다
      });
  }
  if (level === 'full') {
    // 원문 주소와 이미지 주소는 남긴다. 누구나 그 주소로 가면 볼 수 있는 것이고,
    // 파일 사본을 옮기는 것과는 성격이 다르다.
    rec.url = p.url || null;
    rec.image_urls = p.detail?.images || [];
  }
  return rec;
});

fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const file = path.join(outDir, `${galleryId}-${level}-${stamp}.jsonl`);
fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

// 무엇을 뺐는지 같이 남긴다
const notice = `# ${cfg.gallery.name} 공개용 데이터셋

- 생성 ${new Date().toISOString()}
- 단계: ${{ meta: '메타만 (제목·날짜·지표·분류)', text: '메타 + 본문·댓글', full: '메타 + 본문·댓글 + 원문/이미지 주소' }[level]}
- 글 ${rows.length}건

## 제거한 것

이 파일에는 아래가 들어 있지 않습니다.

- 작성자 닉네임 (${strippedNick}건 제거)
- 작성자 고유 id (${strippedUid}건 제거)
- 댓글 작성자 닉네임·id·IP 조각 (${strippedIp}건 제거)
- 이미지 파일 사본 ${level === 'full' ? '(주소만 남기고 파일은 넣지 않음)' : `(${droppedImg}개 제외, 주소도 남기지 않음)`}
- 원본 HTML

## 쓰임

갤러리에서 어떤 주제가 얼마나 오가는지 분석하는 용도입니다.
글의 저작권은 각 작성자에게 있습니다. 재배포하거나 상업적으로 쓰지 마세요.
`;
fs.writeFileSync(path.join(outDir, 'README.md'), notice, 'utf8');

console.log(`\n공개용 데이터 생성: ${file}`);
console.log(`  글 ${rows.length}건 · ${(fs.statSync(file).size / 1048576).toFixed(1)}MB · 단계 ${level}`);
console.log(`  제거: 닉네임 ${strippedNick} · uid ${strippedUid} · 댓글IP ${strippedIp} · 이미지 ${droppedImg}`);
console.log(`  설명서: ${path.join(outDir, 'README.md')}`);
