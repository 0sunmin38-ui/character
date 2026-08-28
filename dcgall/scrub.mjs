#!/usr/bin/env node
// 이미 저장된 데이터에서 식별정보(고정닉 uid, 댓글 IP 조각)를 지운다.
// 한 번만 돌리면 되고, 파서가 v2 부터는 애초에 받지 않는다.
//   node dcgall/scrub.mjs --dry     무엇이 지워질지만 확인
//   node dcgall/scrub.mjs           실제로 지움
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const gid = cfg.gallery.id;
const dir = path.join(ROOT, 'data', gid);

let n = { authorUid: 0, authorIp: 0, cmtUid: 0, cmtIp: 0, records: 0, files: 0 };

function scrub(rec) {
  if (rec.author) {
    if (rec.author.uid) { n.authorUid++; delete rec.author.uid; }
    if (rec.author.ip) { n.authorIp++; delete rec.author.ip; }
    if ('uid' in rec.author) delete rec.author.uid;
    if ('ip' in rec.author) delete rec.author.ip;
  }
  for (const c of rec.comments || []) {
    if (c.uid) n.cmtUid++;
    if (c.ip) n.cmtIp++;
    delete c.uid; delete c.ip;
  }
  if (rec.detail?.comments) for (const c of rec.detail.comments) { delete c.uid; delete c.ip; }
  n.records++;
  return rec;
}

// 1) 수집 로그
const postsDir = path.join(dir, 'posts');
for (const f of fs.existsSync(postsDir) ? fs.readdirSync(postsDir).filter((x) => x.endsWith('.jsonl')) : []) {
  const fp = path.join(postsDir, f);
  const out = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.stringify(scrub(JSON.parse(l))); } catch { return l; } });
  if (!dry) fs.writeFileSync(fp, out.join('\n') + '\n', 'utf8');
  n.files++;
}

// 2) 서재 보존본
const arcDir = path.join(dir, 'archive');
for (const d of fs.existsSync(arcDir) ? fs.readdirSync(arcDir).filter((x) => /^\d+$/.test(x)) : []) {
  const fp = path.join(arcDir, d, 'post.json');
  if (!fs.existsSync(fp)) continue;
  const snap = scrub(JSON.parse(fs.readFileSync(fp, 'utf8')));
  if (!dry) fs.writeFileSync(fp, JSON.stringify(snap, null, 2) + '\n', 'utf8');
  n.files++;
}

console.log(`\n${dry ? '[미리보기] ' : ''}식별정보 정리`);
console.log(`  파일 ${n.files}개 · 레코드 ${n.records}건`);
console.log(`  글 작성자 uid ${n.authorUid} · 글 작성자 IP ${n.authorIp}`);
console.log(`  댓글 uid ${n.cmtUid} · 댓글 IP ${n.cmtIp}`);
if (dry) console.log(`\n  실제로 지우려면 --dry 없이 다시 실행하세요.`);
else console.log(`\n  닉네임은 그대로 두었습니다. raw.html 은 원본 보존용이라 건드리지 않았습니다.`);
