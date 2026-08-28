#!/usr/bin/env node
// GitHub Pages 용 정적 사이트를 docs/ 에 만든다.
//
//   node pages.mjs
//
// Pages 는 정적 파일만 서빙하므로 읽기 전용이다.
// 수집·서재 담기·사전 편집은 안 되고, 모아둔 글을 보는 것만 된다.
// 남의 글이 담기므로 검색엔진에 잡히지 않게 noindex 와 robots.txt 를 함께 넣는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setDataDir, confFile } from './lib/paths.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  [...process.argv.slice(2).join(' ').matchAll(/--([\w-]+)(?:[= ]([^-\s]\S*))?/g)].map((m) => [m[1], m[2] ?? true])
);
setDataDir(ROOT, args.data ? String(args.data) : null);

const { buildReport } = await import('./lib/render.mjs');
const { buildLibrary } = await import('./lib/library.mjs');
const { buildGlossaryPage } = await import('./lib/glossary-page.mjs');

const outDir = path.resolve(String(args.out || path.join(ROOT, 'docs')));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const NOINDEX = '<meta name="robots" content="noindex, nofollow, noarchive">\n';

/** 공개로 나가는 화면이라 닉네임까지 뺀다. 화면에 안 쓰이는 값이라 잃을 게 없다. */
function stripNames(html) {
  const open = html.indexOf('id="data">');
  if (open < 0) return html;
  const start = open + 'id="data">'.length;
  const end = html.indexOf('</script>', start);
  const json = JSON.parse(html.slice(start, end).replace(/<\\\//g, '</'));

  const scrub = (list) => (list || []).forEach((p) => {
    delete p.a; delete p.uid;
    (p.cm || []).forEach((c) => { delete c.n; });
  });
  scrub(json.posts);
  scrub(json.items);
  const out = JSON.stringify(json).replace(/<\/script/gi, '<\\/script');
  return html.slice(0, start) + out + html.slice(end);
}
const banner = `<div style="background:#fff4e5;border-bottom:1px solid #f0d9b5;color:#7a5a1e;
 font:13px/1.6 -apple-system,'Apple SD Gothic Neo',sans-serif;padding:9px 20px;text-align:center">
 읽기 전용으로 올린 화면이에요. 수집·서재 담기·사전 편집은 내 컴퓨터에서 <b>node serve.mjs</b> 로 실행할 때만 됩니다.
</div>`;

const opts = { gallery: args.gallery, server: false,
  days: args.days !== undefined ? Number(args.days) : 0,
  top: args.top !== undefined ? Number(args.top) : 900 };

const pages = [
  ['index.html', buildReport(ROOT, opts)],
  ['library.html', buildLibrary(ROOT, { gallery: args.gallery, server: false })],
  ['glossary.html', buildGlossaryPage(ROOT, { server: false })],
];

for (const [name, html] of pages) {
  const out = stripNames(html)
    .replace('<meta name="viewport"', NOINDEX + '<meta name="viewport"')
    .replace('<body>', '<body>\n' + banner);
  fs.writeFileSync(path.join(outDir, name), out, 'utf8');
  console.log(`  ${name.padEnd(15)} ${(out.length / 1024).toFixed(0)}KB`);
}

fs.writeFileSync(path.join(outDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
fs.writeFileSync(path.join(outDir, '.nojekyll'), '', 'utf8');   // _ 로 시작하는 파일도 그대로 서빙
console.log(`\n  robots.txt · .nojekyll 포함`);
console.log(`  생성 위치: ${outDir}`);
console.log(`  커밋해서 올린 뒤 저장소 Settings → Pages 에서 Branch: main / docs 를 고르세요.`);
