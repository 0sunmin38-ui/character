#!/usr/bin/env node
/* 뷰어가 읽을 파일 목록을 미리 만들어 둔다.
 *
 *   node viewer/build-manifest.mjs      # 저장소 루트에서
 *
 * 왜 필요한가 — 뷰어는 평소 서버의 디렉터리 목록을 훑어 파일을 찾는다.
 * 그런데 GitHub Pages 는 디렉터리 목록을 주지 않는다. 그래서 목록을 파일로 굳혀 둔다.
 * manifest.json 이 있으면 뷰어는 그걸 먼저 쓰고, 없으면 예전처럼 디렉터리를 훑는다.
 */
import { readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP = new Set(['.git', 'node_modules', 'dcgall', 'viewer']);

async function walk(dir, out = []) {
  for (const name of await readdir(dir)) {
    if (name.startsWith('.') || SKIP.has(name)) continue;
    const abs = join(dir, name);
    if ((await stat(abs)).isDirectory()) await walk(abs, out);
    else if (/\.(md|csv)$/i.test(name)) out.push(relative(ROOT, abs));
  }
  return out;
}

/* 작가 견본 그림은 확장자가 달라 walk() 가 안 줍는다.
   정적 호스팅에서는 디렉터리 목록을 못 보므로 여기 적어 둬야 뷰어가 찾는다. */
const SAMPLE_DIR = join('01_자료', '이미지', '작가샘플');
let samples = [];
try { samples = (await readdir(join(ROOT, SAMPLE_DIR)))
        .filter(n => !n.startsWith('.') && /\.(webp|png|jpe?g|gif|avif)$/i.test(n)).sort(); }
catch {}

const files = (await walk(ROOT)).sort();
const out = join(ROOT, 'viewer', 'manifest.json');
await writeFile(out, JSON.stringify({ generated: new Date().toISOString(), files, samples }, null, 2) + '\n');
console.log(`viewer/manifest.json — ${files.length}개 파일 · 작가 견본 ${samples.length}장`);
