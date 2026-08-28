#!/usr/bin/env node
// 저장된 데이터를 단일 HTML 파일로 굽는다 (file:// 로 바로 열림).
//   node dcgall/report.mjs --open
//   node dcgall/report.mjs --days 30 --top 500 --out ~/report.html
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildReport } from './lib/render.mjs';
import { buildLibrary } from './lib/library.mjs';
import { buildGlossaryPage } from './lib/glossary-page.mjs';

import { setDataDir, confFile } from './lib/paths.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  [...process.argv.slice(2).join(' ').matchAll(/--([\w-]+)(?:[= ]([^-\s]\S*))?/g)].map((m) => [m[1], m[2] ?? true])
);
setDataDir(ROOT, args.data ? String(args.data) : null);
const outPath = args.out ? path.resolve(String(args.out)) : path.join(ROOT, 'out', 'index.html');
const html = buildReport(ROOT, {
  gallery: args.gallery, server: false,
  days: args.days !== undefined ? Number(args.days) : undefined,
  top: args.top !== undefined ? Number(args.top) : undefined,
});
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, 'utf8');
const libPath = path.join(path.dirname(outPath), 'library.html');
const lib = buildLibrary(ROOT, { gallery: args.gallery, server: false });
fs.writeFileSync(libPath, lib, 'utf8');
console.log(`수집 페이지: ${outPath}  (${(html.length / 1024).toFixed(0)}KB)`);
console.log(`내 서재:     ${libPath}  (${(lib.length / 1024).toFixed(0)}KB)`);
const gloPath = path.join(path.dirname(outPath), 'glossary.html');
const glo = buildGlossaryPage(ROOT, { server: false });
fs.writeFileSync(gloPath, glo, 'utf8');
console.log(`은어 사전:   ${gloPath}  (${(glo.length / 1024).toFixed(0)}KB)`);
console.log(`분류를 고칠 거면 서버 모드가 편하다:  node dcgall/serve.mjs`);
if (args.open) execFile('open', [outPath]);
