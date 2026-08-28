#!/usr/bin/env node
/* viewer 전용 정적 서버 + 저장 엔드포인트.
 *
 * python3 -m http.server 로도 뷰어는 읽기 동작하지만 그쪽은 쓰기를 받지 않는다.
 * 저장 버튼을 쓰려면 이 서버로 띄운다.
 *
 *   node viewer/serve.mjs [포트]      # 기본 8799 · 저장소 루트에서 실행
 *
 * 쓰기는 99_작업중/ 안의 .md 로만 허용한다.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, resolve, normalize, sep } from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.argv[2]) || 8799;
const SAVE_DIR = '99_작업중';

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.md':'text/markdown; charset=utf-8', '.csv':'text/csv; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2',
};

const send = (res, code, body, type='text/plain; charset=utf-8') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};

/* 저장 경로 검증 — 99_작업중/ 밖으로 나가거나 .md 가 아니면 거부한다. */
function safeSavePath(name) {
  const base = String(name || '').trim().replace(/\.md$/i, '');
  if (!base) return { err: '이름이 비어 있습니다' };
  if (/[\\/]|\.\./.test(base)) return { err: '이름에 / 나 .. 를 쓸 수 없습니다' };
  if (base.length > 80) return { err: '이름이 너무 깁니다 (80자 이하)' };
  const rel = join(SAVE_DIR, base + '.md');
  const abs = resolve(ROOT, rel);
  if (!abs.startsWith(resolve(ROOT, SAVE_DIR) + sep)) return { err: '허용되지 않은 경로입니다' };
  return { rel, abs };
}

/* python http.server 와 같은 형태의 디렉터리 목록 — 뷰어가 이걸 파싱한다. */
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
    if (req.method === 'POST' && req.url === '/_save') {
      let raw = '';
      for await (const c of req) {
        raw += c;
        if (raw.length > 2000000) return send(res, 413, '내용이 너무 큽니다');
      }
      let body;
      try { body = JSON.parse(raw); } catch { return send(res, 400, 'JSON 파싱 실패'); }

      const p = safeSavePath(body.name);
      if (p.err) return send(res, 400, p.err);
      if (typeof body.content !== 'string') return send(res, 400, 'content 가 없습니다');
      if (existsSync(p.abs) && !body.overwrite)
        return send(res, 409, JSON.stringify({ exists: true, path: p.rel }), MIME['.json']);

      await mkdir(resolve(ROOT, SAVE_DIR), { recursive: true });
      await writeFile(p.abs, body.content, 'utf8');
      console.log(`저장 ${p.rel}  ${body.content.length}자`);
      return send(res, 200, JSON.stringify({ ok: true, path: p.rel }), MIME['.json']);
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
  console.log(`저장 대상          ${SAVE_DIR}/  (.md 만)`);
});
