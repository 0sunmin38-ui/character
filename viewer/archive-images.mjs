#!/usr/bin/env node
/* 원문 글에 걸린 그림을 저장소 안에 보존한다.
 *
 *   node viewer/archive-images.mjs            # w=800&q=80 으로 받아 viewer/img/ 에 저장
 *   node viewer/archive-images.mjs 1000 90    # 화질을 직접 지정
 *
 * 왜 필요한가: 그림은 남의 CDN(포스타입) 에 있고 그쪽이 핫링크를 막는다.
 * `viewer/.imgcache/` 는 서버가 굴리는 임시 캐시라 커밋하지 않으므로,
 * **원본이 지워지거나 다른 컴퓨터에서 clone 하면 그림이 사라진다.**
 * 여기 받아 둔 것은 저장소에 함께 남아 그 둘을 다 견디고, GitHub Pages 에서도 보인다.
 *
 * 만들어지는 것
 *   viewer/img/<해시>.<확장자>   그림 파일
 *   viewer/images.json           원본 주소 → 파일명 (뷰어가 이걸 보고 갈아끼운다)
 *
 * 문서에 그림을 새로 넣었다면 다시 돌리면 된다. 이미 받은 건 건너뛴다.
 */
import { readdir, stat, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const W = Number(process.argv[2]) || 800;
const Q = Number(process.argv[3]) || 80;
const OUT = join(ROOT, 'viewer', 'img');
const MAP = join(ROOT, 'viewer', 'images.json');
const SKIP = new Set(['.git', 'node_modules', 'dcgall', 'viewer']);
const LANES = 6;                 /* 남의 서버를 두들기지 않는다 */

/* 호스트별로 보내야 하는 Referer: serve.mjs 의 표와 같은 이유다 */
const REFERER = { 'd2ufj6gm1gtdrc.cloudfront.net': 'https://www.postype.com/' };
const EXT = { 'image/png':'.png', 'image/jpeg':'.jpg', 'image/gif':'.gif',
              'image/webp':'.webp', 'image/avif':'.avif' };

async function walk(dir, out = []) {
  for (const name of await readdir(dir)) {
    if (name.startsWith('.') || SKIP.has(name)) continue;
    const abs = join(dir, name);
    if ((await stat(abs)).isDirectory()) await walk(abs, out);
    else if (/\.md$/i.test(name)) out.push(relative(ROOT, abs));
  }
  return out;
}

/* CDN 이 크기 파라미터를 받으면 그걸로 줄여 받는다. 로컬에서 다시 인코딩하지 않아도 된다 */
function sized(href) {
  const u = new URL(href);
  if (u.searchParams.has('w')) { u.searchParams.set('w', String(W)); u.searchParams.set('q', String(Q)); }
  return u.href;
}

const urls = new Set();
for (const f of await walk(ROOT))
  for (const m of (await readFile(join(ROOT, f), 'utf8')).matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g))
    urls.add(m[1]);

const list = [...urls].sort();
const map = existsSync(MAP) ? JSON.parse(await readFile(MAP, 'utf8')) : {};
await mkdir(OUT, { recursive: true });
console.log(`그림 ${list.length}장 · w=${W} q=${Q} · 동시 ${LANES}개`);

let next = 0, got = 0, kept = 0, fail = 0, bytes = 0;
const lane = async () => {
  for (let i; (i = next++) < list.length; ) {
    const href = list[i];
    const key = createHash('sha1').update(href).digest('hex').slice(0, 16);
    /* 이미 받아 둔 게 실제로 있으면 건너뛴다 */
    if (map[href] && existsSync(join(ROOT, 'viewer', map[href]))) { kept++; continue; }
    try {
      const u = new URL(href);
      const r = await fetch(sized(href), {
        headers: {
          referer: REFERER[u.hostname] || u.origin + '/',
          'user-agent': 'Mozilla/5.0 luvheil-viewer',
          /* 이 CDN 은 Accept 로 형식을 협상한다. 원문 그림은 대부분 스크린샷 PNG 이고
             PNG 는 무손실이라 q= 가 안 먹는다. webp 로 받으면 같은 크기에 1/5 이 된다. */
          accept: 'image/webp,image/avif,image/*,*/*;q=0.8',
        },
      });
      if (!r.ok) { fail++; console.log(`  ✕ ${r.status}  ${href.slice(0, 88)}`); continue; }
      const ct = (r.headers.get('content-type') || '').split(';')[0];
      if (!/^image\//.test(ct)) { fail++; console.log(`  ✕ 그림 아님 ${ct}  ${href.slice(0, 70)}`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      const name = key + (EXT[ct] || extname(u.pathname).toLowerCase() || '.img');
      await writeFile(join(OUT, name), buf);
      map[href] = 'img/' + name;
      got++; bytes += buf.length;
    } catch (e) { fail++; console.log(`  ✕ ${e.message}  ${href.slice(0, 70)}`); }
    if ((got + fail) % 25 === 0) process.stdout.write(`  ${got + kept + fail}/${list.length}\r`);
  }
};
await Promise.all(Array.from({ length: LANES }, lane));

await writeFile(MAP, JSON.stringify(map, null, 0) + '\n');
console.log(`\n새로 받음 ${got} · 이미 있음 ${kept} · 실패 ${fail} · ${(bytes / 1048576).toFixed(1)}MB`);
console.log(`→ viewer/img/  ·  viewer/images.json (${Object.keys(map).length}개)`);
console.log('커밋해야 다른 컴퓨터·GitHub Pages 에서도 보인다.');
