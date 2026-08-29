#!/usr/bin/env node
/* viewer 전용 정적 서버 + 초안 저장·수정·삭제 엔드포인트.
 *
 * python3 -m http.server 로도 뷰어는 읽기 동작하지만 그쪽은 쓰기를 받지 않는다.
 * 저장·수정·삭제를 쓰려면 이 서버로 띄운다.
 *
 *   node viewer/serve.mjs [포트]      # 기본 8799 · 저장소 루트에서 실행
 *
 * 쓰기는 99_작업중/<이미지|챗봇>/ 안의 .md 로만 허용한다.
 * 초안은 만들어진 곳(이미지 조립 / 챗봇 작성)을 따라 갈라 둔다. 저장소의 다른 폴더와 같은 규칙.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, readdir, stat, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname, resolve, normalize, sep } from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.argv[2]) || 8799;
const SAVE_DIR = '99_작업중';
const KINDS = { img: '이미지', bot: '챗봇' };   /* 뷰어의 그룹 키 → 폴더명 */
const IMG_CACHE = resolve(ROOT, 'viewer', '.imgcache');
/* 작가 태그마다 '이 작가로 뽑으면 이렇게 나온다' 는 견본을 둔다.
   140개를 글자만 보고 고를 수는 없다. 그림체는 눈으로 고르는 것이다. */
const SAMPLE_DIR = '01_자료/이미지/작가샘플';
const SAMPLE_MAX = 10 * 1024 * 1024;
const SAMPLE_EXT = new Set(['.webp','.png','.jpg','.jpeg','.gif','.avif']);

/* 원문 글에 걸린 그림은 남의 CDN 에 있고, 그쪽이 핫링크를 막는다.
   포스타입 CDN 은 Referer 가 postype.com 이 아니면 403 을 준다.
   브라우저는 <img> 에 가짜 Referer 를 실을 수 없으므로 서버가 대신 받아 온다. */
const REFERER = { 'd2ufj6gm1gtdrc.cloudfront.net': 'https://www.postype.com/' };
const IMG_MAX = 20 * 1024 * 1024;
/* 사설망으로 찔러보는 걸 막는다. 이건 그림을 받아오는 통로지 범용 프록시가 아니다 */
const PRIVATE = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|0\.)/i;

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.md':'text/markdown; charset=utf-8', '.csv':'text/csv; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.gif':'image/gif',
  '.webp':'image/webp', '.avif':'image/avif', '.woff2':'font/woff2',
};

const send = (res, code, body, type='text/plain; charset=utf-8') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};
const json = (res, code, o) => send(res, code, JSON.stringify(o), MIME['.json']);

async function readBody(req, res){
  let raw = '';
  for await (const c of req){
    raw += c;
    if(raw.length > 2000000){ send(res, 413, '내용이 너무 큽니다'); return null; }
  }
  try{ return JSON.parse(raw); }catch{ send(res, 400, 'JSON 파싱 실패'); return null; }
}

/* 이름 → 99_작업중/<이미지|챗봇>/<이름>.md.
   폴더를 벗어나거나 .md 가 아니면 거부한다. */
function safeSavePath(kind, name) {
  const sub = KINDS[kind];
  if (!sub) return { err: '이미지 · 챗봇 중 하나여야 합니다' };
  const base = String(name || '').trim().replace(/\.md$/i, '');
  if (!base) return { err: '이름이 비어 있습니다' };
  if (/[\\/]|\.\./.test(base)) return { err: '이름에 / 나 .. 를 쓸 수 없습니다' };
  if (base.length > 80) return { err: '이름이 너무 깁니다 (80자 이하)' };
  const rel = join(SAVE_DIR, sub, base + '.md');
  const abs = resolve(ROOT, rel);
  if (!abs.startsWith(resolve(ROOT, SAVE_DIR) + sep)) return { err: '허용되지 않은 경로입니다' };
  return { rel, abs };
}

/* 고칠 수 있는 파일: 뷰어에서 손대는 것만 열어 둔다.
   가이드 원문이나 코드는 여기 없다. 실수로도 못 덮어쓰게 하려는 것이다. */
const WRITABLE = [
  /^99_작업중\/[^/]+\/[^/]+\.md$/,                    /* 파츠·초안 */
  /^03_프롬프트\/이미지\/스타일프리셋\/[^/]+\.md$/,   /* 퀄리티·부정 프리셋 */
  /^01_자료\/[^/]+\/[^/]+\.csv$/,                     /* 태그 사전 */
];
function safeWritePath(path, mustExist = true) {
  const rel = normalize(String(path || '').trim()).replace(/^[/\\]/, '');
  if (!WRITABLE.some(re => re.test(rel))) return { err: '여기는 고칠 수 없는 파일입니다: ' + rel };
  const abs = resolve(ROOT, rel);
  if (!abs.startsWith(ROOT + sep)) return { err: '허용되지 않은 경로입니다' };
  if (mustExist && !existsSync(abs)) return { err: '없는 파일입니다' };
  return { rel, abs };
}
/* 삭제는 초안만. 사전과 프리셋은 고치기만 한다. 통째로 날릴 일이 없다. */
function safeDeletePath(path) {
  const p = safeWritePath(path);
  if (p.err) return p;
  if (!p.rel.startsWith(SAVE_DIR + '/')) return { err: `${SAVE_DIR}/ 안의 파일만 지웁니다` };
  return p;
}

/* 원격 그림을 대신 받아 온다. 한 번 받으면 viewer/.imgcache/ 에 두고 다시 안 받는다.
   원본이 지워져도 캐시가 남아 있으면 계속 보인다. */
async function proxyImage(res, raw) {
  let u;
  try { u = new URL(raw); } catch { return send(res, 400, '주소가 아닙니다'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return send(res, 400, 'http(s) 만 됩니다');
  if (PRIVATE.test(u.hostname)) return send(res, 403, '사설망 주소는 받지 않습니다');

  const key = createHash('sha1').update(u.href).digest('hex');
  /* 받아 온 형식이 주소의 확장자와 다를 수 있다. 이 CDN 은 .png 주소에 webp 를 준다.
     그래서 캐시 파일 이름은 '실제로 받은 형식' 으로 붙이고, 찾을 때도 형식별로 훑는다. */
  const EXTS = ['.webp', '.avif', '.png', '.jpg', '.gif', '.img'];
  const hit = EXTS.map(e => [e, join(IMG_CACHE, key + e)]).find(([, f]) => existsSync(f));
  if (hit) {
    res.writeHead(200, { 'content-type': MIME[hit[0]] || 'application/octet-stream',
                         'cache-control': 'public, max-age=604800' });
    return res.end(await readFile(hit[1]));
  }

  const referer = REFERER[u.hostname] || u.origin + '/';
  let r;
  try {
    /* accept 를 붙이면 이 CDN 은 webp 로 준다. 스크린샷 PNG 가 1/5 로 줄어든다 */
    const H = { 'user-agent': 'Mozilla/5.0 luvheil-viewer', accept: 'image/webp,image/avif,image/*,*/*;q=0.8' };
    r = await fetch(u.href, { headers: { ...H, referer } });
    /* CDN 마다 무엇을 보고 막는지 달라서, 한 번 막히면 Referer 없이 다시 시도한다 */
    if (!r.ok) r = await fetch(u.href, { headers: H });
  } catch (e) {
    return send(res, 502, '받아오지 못했습니다: ' + (e.message || e));
  }
  if (!r.ok) return send(res, r.status, `원본이 ${r.status} 를 돌려줬습니다`);

  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > IMG_MAX) return send(res, 413, '그림이 너무 큽니다');
  const ct = (r.headers.get('content-type') || '').split(';')[0];
  if (!/^image\//.test(ct)) return send(res, 415, '그림이 아닙니다: ' + ct);

  const ext = Object.entries(MIME).find(([, v]) => v === ct)?.[0]
           || (extname(u.pathname) || '.img').toLowerCase().slice(0, 5);
  await mkdir(IMG_CACHE, { recursive: true });
  await writeFile(join(IMG_CACHE, key + ext), buf);
  console.log(`그림 ${u.hostname}${u.pathname}  ${(buf.length/1024).toFixed(0)}KB`);
  res.writeHead(200, { 'content-type': ct, 'cache-control': 'public, max-age=604800' });
  res.end(buf);
}

/* python http.server 와 같은 형태의 디렉터리 목록: 뷰어가 이걸 파싱한다. */
async function listing(dir, urlPath) {
  const names = await readdir(dir);
  const rows = [];
  for (const n of names.sort()) {
    const isDir = (await stat(join(dir, n))).isDirectory();
    rows.push(`<li><a href="${encodeURIComponent(n)}${isDir ? '/' : ''}">${n}${isDir ? '/' : ''}</a></li>`);
  }
  return `<!doctype html><meta charset="utf-8"><title>${urlPath}</title><ul>${rows.join('')}</ul>`;
}

createServer(async (req, res) => {
  try {
    /* ── 쓰기를 받는 서버인지 알려준다 ─────────────
       뷰어는 이 응답으로 저장·수정·삭제 버튼을 낼지 정한다.
       manifest.json 이 있느냐로 판단하면 로컬에서도 정적 모드로 오인한다. */
    if (req.method === 'GET' && req.url === '/_ping')
      return json(res, 200, { ok: true, write: true, img: true, asset: true,
                              saveDir: SAVE_DIR, sampleDir: SAMPLE_DIR, kinds: KINDS });

    /* ── 작가 견본 올리기 ───────────────────────
       뷰어 표 위로 그림을 끌어다 놓으면 여기로 온다. */
    if (req.method === 'POST' && req.url === '/_asset') {
      const body = await readBody(req, res); if (!body) return;
      const name = String(body.name || '').trim();
      if (!name || /[\\/]|\.\./.test(name)) return send(res, 400, '이름에 / 나 .. 를 쓸 수 없습니다');
      const ext = extname(name).toLowerCase();
      if (!SAMPLE_EXT.has(ext)) return send(res, 415, '그림 파일만 됩니다 (webp·png·jpg·gif·avif)');
      let buf;
      try { buf = Buffer.from(String(body.data || '').replace(/^data:[^,]*,/, ''), 'base64'); }
      catch { return send(res, 400, '내용을 읽지 못했습니다'); }
      if (!buf.length) return send(res, 400, '빈 파일입니다');
      if (buf.length > SAMPLE_MAX) return send(res, 413, '10MB 를 넘습니다');
      const abs = resolve(ROOT, SAMPLE_DIR, name);
      if (!abs.startsWith(resolve(ROOT, SAMPLE_DIR) + sep)) return send(res, 403, '허용되지 않은 경로입니다');
      await mkdir(resolve(ROOT, SAMPLE_DIR), { recursive: true });
      await writeFile(abs, buf);
      /* 한 칸에는 견본이 하나다. 확장자만 다른 옛 파일은 화면에서 가려질 뿐 디스크에 남아
         저장소를 불린다. 방금 덮어쓴 그 칸의 것만 골라 치운다. */
      const stem = name.slice(0, -ext.length);
      const gone = [];
      for (const f of await readdir(resolve(ROOT, SAMPLE_DIR))) {
        if (f === name) continue;
        const e = extname(f).toLowerCase();
        if (SAMPLE_EXT.has(e) && f.slice(0, -e.length) === stem) {
          await unlink(resolve(ROOT, SAMPLE_DIR, f)); gone.push(f);
        }
      }
      console.log(`견본 ${SAMPLE_DIR}/${name}  ${(buf.length/1024).toFixed(0)}KB`
                  + (gone.length ? `  (옛것 삭제: ${gone.join(', ')})` : ''));
      return json(res, 200, { ok: true, path: `${SAMPLE_DIR}/${name}`, removed: gone });
    }

    /* ── 원격 그림 받아오기 ────────────────────── */
    if (req.method === 'GET' && req.url.startsWith('/_img?'))
      return proxyImage(res, new URL(req.url, 'http://x').searchParams.get('u') || '');

    /* ── 저장 (새로 만들기 · 덮어쓰기) ───────────── */
    if (req.method === 'POST' && req.url === '/_save') {
      const body = await readBody(req, res); if (!body) return;
      const p = safeSavePath(body.kind, body.name);
      if (p.err) return send(res, 400, p.err);
      if (typeof body.content !== 'string') return send(res, 400, 'content 가 없습니다');
      if (existsSync(p.abs) && !body.overwrite)
        return json(res, 409, { exists: true, path: p.rel });

      await mkdir(resolve(ROOT, SAVE_DIR, KINDS[body.kind]), { recursive: true });
      await writeFile(p.abs, body.content, 'utf8');
      console.log(`저장 ${p.rel}  ${body.content.length}자`);
      return json(res, 200, { ok: true, path: p.rel });
    }

    /* ── 수정: 이미 있는 초안의 내용만 바꾼다 ────── */
    if (req.method === 'POST' && req.url === '/_edit') {
      const body = await readBody(req, res); if (!body) return;
      const p = safeWritePath(body.path);
      if (p.err) return send(res, 400, p.err);
      if (typeof body.content !== 'string') return send(res, 400, 'content 가 없습니다');
      await writeFile(p.abs, body.content, 'utf8');
      console.log(`수정 ${p.rel}  ${body.content.length}자`);
      return json(res, 200, { ok: true, path: p.rel });
    }

    /* ── 삭제 ──────────────────────────────────── */
    if (req.method === 'POST' && req.url === '/_delete') {
      const body = await readBody(req, res); if (!body) return;
      const p = safeDeletePath(body.path);
      if (p.err) return send(res, 400, p.err);
      await unlink(p.abs);
      console.log(`삭제 ${p.rel}`);
      return json(res, 200, { ok: true, path: p.rel });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '허용되지 않은 메서드');

    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]/, '');
    const abs = resolve(ROOT, rel);
    if (!abs.startsWith(ROOT)) return send(res, 403, '접근 불가');
    if (!existsSync(abs)) return send(res, 404, '없는 경로입니다');

    if ((await stat(abs)).isDirectory()) {
      if (!urlPath.endsWith('/')) { res.writeHead(301, { location: urlPath + '/' }); return res.end(); }
      const idx = join(abs, 'index.html');
      if (existsSync(idx)) return send(res, 200, await readFile(idx), MIME['.html']);
      return send(res, 200, await listing(abs, urlPath), MIME['.html']);
    }
    return send(res, 200, await readFile(abs), MIME[extname(abs).toLowerCase()] || 'application/octet-stream');
  } catch (e) {
    send(res, 500, String(e && e.message || e));
  }
}).listen(PORT, () => {
  console.log(`character viewer  http://localhost:${PORT}/viewer/`);
  console.log(`초안 저장          ${SAVE_DIR}/이미지/  ${SAVE_DIR}/챗봇/  (.md 만)`);
});
