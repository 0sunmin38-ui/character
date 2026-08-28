#!/usr/bin/env node
// 로컬 뷰어 서버 — 화면에서 바꾼 분류가 곧바로 labels.json 에 기록된다.
//   node dcgall/serve.mjs            → http://127.0.0.1:8787
//   node dcgall/serve.mjs --port 9000 --days 0
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildReport } from './lib/render.mjs';
import { buildLibrary } from './lib/library.mjs';
import { buildGlossaryPage } from './lib/glossary-page.mjs';
import { Labels } from './lib/labels.mjs';
import { Glossary } from './lib/glossary.mjs';
import { Http } from './lib/http.mjs';
import { Store } from './lib/store.mjs';
import { Archive } from './lib/archive.mjs';
import { Bookmarks } from './lib/bookmarks.mjs';
import { mine } from './lib/miner.mjs';
import { runCrawl, expandTargets } from './lib/crawler.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  [...process.argv.slice(2).join(' ').matchAll(/--([\w-]+)(?:[= ]([^-\s]\S*))?/g)].map((m) => [m[1], m[2] ?? true])
);
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const galleryId = args.gallery || cfg.gallery.id;
const port = Number(args.port || 8787);
const host = String(args.host || '127.0.0.1');
const isLocal = host === '127.0.0.1' || host === 'localhost' || host === '::1';

/* ── 접근 제어 ────────────────────────────────────────────────
   로컬 전용이면 그대로 열어두고, 다른 기기에서 접속하도록 열었다면
   토큰을 요구한다. 토큰을 안 주면 임의로 만들어 터미널에 찍는다. */
const TOKEN = isLocal ? null
  : String(args.token || process.env.DCGALL_TOKEN || crypto.randomBytes(12).toString('base64url'));
const COOKIE = 'dcgall_t';

function tokenOk(req, url) {
  if (!TOKEN) return true;
  const fromCookie = (req.headers.cookie || '').split(';')
    .map((c) => c.trim().split('=')).find(([k]) => k === COOKIE)?.[1];
  const given = url.searchParams.get('t') || req.headers['x-dcgall-token'] || fromCookie || '';
  const a = Buffer.from(String(given)), b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const DENY = `<!doctype html><html lang="ko"><meta charset="utf-8">
<title>접근 권한이 필요해요</title>
<body style="font:15px/1.7 -apple-system,'Apple SD Gothic Neo',sans-serif;background:#f5f8fc;color:#152232;
 display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="max-width:420px;padding:28px;background:#fff;border:1px solid #dde6f1;border-radius:12px">
<h1 style="font-size:17px;margin:0 0 10px">접근 권한이 필요해요</h1>
<p style="color:#7488a0;font-size:13.5px;margin:0">주소 뒤에 <code>?t=토큰</code> 을 붙여서 들어와 주세요.
서버를 띄운 터미널에 토큰이 찍혀 있어요.</p></div></body></html>`;
const opts = {
  gallery: galleryId, server: true,
  days: args.days !== undefined ? Number(args.days) : undefined,
  top: args.top !== undefined ? Number(args.top) : undefined,
};

const http_ = new Http(cfg.http);
const gallery = { ...cfg.gallery, id: galleryId };
const MIME = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif',
               '.webp':'image/webp', '.mp4':'video/mp4', '.bmp':'image/bmp' };

const json = (res, code, obj) => {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(b) });
  res.end(b);
};

/* ── 수집 작업 ────────────────────────────────────────────────
   웹에서 '수집' 을 누르면 CLI 와 똑같은 job 을 서버가 대신 돌린다.
   한 번에 하나만 돌게 막고, 진행 상황은 폴링으로 읽어간다. */
const C = { running: false, job: null, phase: null, done: 0, total: 0, label: '',
            startedAt: null, stop: false, result: null, logs: [] };

async function startCrawl(job) {
  if (C.running) return { error: '이미 수집이 진행 중이에요.' };
  if (!cfg.jobs[job]) return { error: `알 수 없는 job 이에요: ${job}` };
  Object.assign(C, { running: true, job, phase: 'list', done: 0, total: 0, label: '준비 중',
                     startedAt: new Date().toISOString(), stop: false, result: null, logs: [] });
  console.log(`  수집 시작: ${job}`);
  runCrawl(ROOT, cfg, { job, gallery: galleryId, source: 'viewer', glossary: new Glossary(ROOT) },
    (st) => { C.phase = st.phase; C.done = st.done; C.total = st.total; C.label = st.label; },
    () => C.stop)
    .then((r) => {
      C.result = { runId: r.manifest.run_id, seen: r.records, added: r.newCount,
                   details: r.detailDone, errors: r.errors.length, stopped: C.stop };
      C.logs = r.logs.slice(-40);
      console.log(`  수집 완료: ${job} · 수집 ${r.records} (신규 ${r.newCount}) · 본문 ${r.detailDone} · 에러 ${r.errors.length}`);
    })
    .catch((e) => { C.result = { error: e.message }; console.error('  수집 실패:', e.message); })
    .finally(() => { C.running = false; C.phase = null; C.label = ''; });
  return { ok: true, job };
}

/* ── 보존 큐 ──────────────────────────────────────────────────
   글 하나 보존에 본문+댓글+이미지 요청이 붙어 몇 초씩 걸린다.
   일괄 선택은 즉시 북마크만 등록하고, 실제 보존은 여기서 순차 처리한다. */
const Q = { items: [], total: 0, done: 0, current: null, errors: [], running: false, stop: false };

async function drain() {
  if (Q.running) return;
  Q.running = true; Q.stop = false;
  while (Q.items.length && !Q.stop) {
    const { no, base } = Q.items.shift();
    Q.current = { no, title: base.title || '' };
    try {
      const arc = new Archive(ROOT, galleryId);
      const r = await arc.capture(http_, gallery, no, base);
      const bmk = new Bookmarks(ROOT, galleryId);
      bmk.markArchived(no, true).save();
      console.log(`  [큐 ${Q.done + 1}/${Q.total}] ${no} ${r.gone ? '원문 없음' : (r.snapshot.body_text?.length || 0) + '자'}`);
    } catch (e) {
      Q.errors.push({ no, message: e.message });
      console.log(`  [큐 실패] ${no}: ${e.message}`);
    }
    Q.done++;
  }
  Q.current = null;
  Q.running = false;
  if (Q.stop) { console.log(`  큐 중단 — 남은 ${Q.items.length}건 취소`); Q.items = []; }
  else if (Q.total) console.log(`  큐 완료 ${Q.done}/${Q.total}${Q.errors.length ? ` · 실패 ${Q.errors.length}` : ''}`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (!tokenOk(req, url)) {
      res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(DENY);
    }
    // 쿼리로 들어온 토큰은 쿠키에 옮겨두고 주소를 깨끗하게 만든다
    if (TOKEN && url.searchParams.get('t')) {
      url.searchParams.delete('t');
      res.writeHead(302, {
        'Set-Cookie': `${COOKIE}=${TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`,
        Location: url.pathname + (url.search || ''),
      });
      return res.end();
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      // 매 요청마다 다시 굽는다 — 크롤러가 새로 모은 글이 새로고침만으로 반영된다.
      const html = buildReport(ROOT, opts);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }
    if (req.method === 'GET' && url.pathname === '/glossary') {
      const html = buildGlossaryPage(ROOT, { server: true });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }
    if (req.method === 'GET' && url.pathname === '/library') {
      const html = buildLibrary(ROOT, { gallery: galleryId, server: true });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    // 아카이브에 보존한 이미지 서빙 (경로 이탈 차단)
    if (req.method === 'GET' && url.pathname.startsWith('/archive/')) {
      const base = path.resolve(ROOT, 'data', galleryId, 'archive');
      const rel = decodeURIComponent(url.pathname.slice('/archive/'.length));
      const target = path.resolve(base, rel);
      // 보존한 이미지만 내보낸다. post.json·raw.html 은 내부용이라 열지 않는다.
      const allowed = /^\d+\/img\/[\w.-]+$/.test(rel) && MIME[path.extname(target).toLowerCase()];
      if (!allowed || !target.startsWith(base + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
        return json(res, 404, { error: 'not found' });
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
                           'Cache-Control': 'public, max-age=86400' });
      return fs.createReadStream(target).pipe(res);
    }

    // 키워드 감시 목록 편집
    if (req.method === 'POST' && url.pathname === '/api/keywords') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 1e5) { req.destroy(); return; } }
      const b = JSON.parse(body || '{}');
      const cfgPath = path.join(ROOT, 'config.json');
      const live = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));   // 최신 파일을 다시 읽는다
      const seen = new Set();
      const kws = (b.keywords || [])
        .map((k) => String(k).trim())
        .filter((k) => k && k.length <= 20 && !seen.has(k) && seen.add(k))
        .slice(0, 40);
      live.jobs.watch.targets = kws.map((k) => ({
        mode: 'search', keyword: k,
        searchType: b.scope === 'title' ? 'search_subject' : 'search_subject_memo',
        pages: Math.min(Math.max(Number(b.pages) || 2, 1), 10),
      }));
      fs.writeFileSync(cfgPath, JSON.stringify(live, null, 2) + '\n', 'utf8');
      cfg.jobs.watch.targets = live.jobs.watch.targets;             // 실행 중인 서버에도 반영
      console.log(`  감시 키워드 ${kws.length}개로 저장`);
      return json(res, 200, { ok: true, keywords: kws, count: kws.length });
    }

    if (url.pathname === '/api/crawl') {
      if (req.method === 'GET') {
        const w = cfg.jobs.watch || { targets: [] };
        return json(res, 200, {
          running: C.running, job: C.job, phase: C.phase, done: C.done, total: C.total,
          label: C.label, startedAt: C.startedAt, result: C.result, logs: C.logs.slice(-12),
          jobs: Object.entries(cfg.jobs).map(([k, v]) => ({ key: k, desc: v.desc })),
          watch: (() => {
            const glos = new Glossary(ROOT);
            const expanded = expandTargets(w.targets, glos);
            return {
              keywords: w.targets.map((t) => t.keyword),
              scope: w.targets[0]?.searchType === 'search_subject' ? 'title' : 'both',
              pages: w.targets[0]?.pages || 2,
              expanded: expanded.length,
              // 사전에서 고를 수 있는 묶음 (@개념:… 참조)
              concepts: Object.entries(glos.data.concepts).map(([k, c]) => ({
                ref: '@개념:' + k, label: c.label,
                n: glos.expand(['@개념:' + k]).filter((f) => typeof f === 'string' && f.length > 1).length,
              })),
              // 참조가 지금 무엇으로 펴지는지 미리보기
              preview: expanded.reduce((m, t) => {
                const k = t.from_ref || '(직접 입력)';
                (m[k] = m[k] || []).push(t.keyword); return m;
              }, {}),
            };
          })(),
        });
      }
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 1e5) { req.destroy(); return; } }
        const b = JSON.parse(body || '{}');
        if (b.stop) { C.stop = true; return json(res, 200, { ok: true, stopping: true }); }
        const r = await startCrawl(b.job || 'daily');
        return json(res, r.error ? 409 : 200, r);
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/queue') {
      return json(res, 200, {
        running: Q.running, total: Q.total, done: Q.done, pending: Q.items.length,
        current: Q.current, errors: Q.errors.slice(-10),
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/queue/stop') {
      Q.stop = true;
      return json(res, 200, { ok: true, cancelled: Q.items.length });
    }

    // 일괄 북마크 — 등록은 즉시, 보존은 큐로
    if (req.method === 'POST' && url.pathname === '/api/bookmark/bulk') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 4e6) { req.destroy(); return; } }
      const b = JSON.parse(body || '{}');
      const nos = (b.nos || []).map(Number).filter(Boolean);
      const bmk = new Bookmarks(ROOT, galleryId);   // body 수신 후에 읽는다
      const arc = new Archive(ROOT, galleryId);

      if (b.on === false) {
        for (const no of nos) bmk.remove(no);
        bmk.save();
        console.log(`  일괄 서재에서 뺌 ${nos.length}건`);
        return json(res, 200, { ok: true, removed: nos.length, count: bmk.count });
      }

      const crawled = new Store(ROOT, galleryId).load();
      let queued = 0;
      for (const no of nos) {
        bmk.add(no, { tags: b.tags || [] });
        if (!arc.has(no) || b.force) {
          Q.items.push({ no, base: crawled.get(no) || {} });
          queued++;
        }
      }
      bmk.save();
      if (queued) { Q.total = Q.done + Q.items.length; }
      console.log(`  일괄 서재에 담음 ${nos.length}건 · 보존 대기 ${queued}건`);
      drain();
      return json(res, 200, { ok: true, added: nos.length, queued, count: bmk.count });
    }

    // 일괄 태그 (서재)
    if (req.method === 'POST' && url.pathname === '/api/bookmark/tag') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 1e6) { req.destroy(); return; } }
      const b = JSON.parse(body || '{}');
      const nos = (b.nos || []).map(Number).filter(Boolean);
      const bmk = new Bookmarks(ROOT, galleryId);
      let n = 0;
      for (const no of nos) {
        const it = bmk.get(no); if (!it) continue;
        const tags = new Set(it.tags || []);
        if (b.add) tags.add(String(b.add));
        if (b.remove) tags.delete(String(b.remove));
        bmk.add(no, { tags: [...tags] });
        n++;
      }
      bmk.save();
      console.log(`  일괄 태그 ${b.add ? '+' + b.add : '-' + b.remove} · ${n}건`);
      return json(res, 200, { ok: true, changed: n });
    }

    if (url.pathname === '/api/bookmark') {
      if (req.method === 'GET') return json(res, 200, new Bookmarks(ROOT, galleryId).data);
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 1e6) { req.destroy(); return; } }
        const bmk = new Bookmarks(ROOT, galleryId);
        const b = JSON.parse(body || '{}');
        const no = Number(b.no);
        if (!no) return json(res, 400, { error: 'no 가 필요하다' });

        if (b.on === false) { bmk.remove(no).save(); console.log(`  서재에서 뺌: ${no}`); return json(res, 200, { ok: true, count: bmk.count }); }

        const existing = bmk.get(no);
        bmk.add(no, {
          note: b.note !== undefined ? b.note : (existing?.note ?? ''),
          tags: b.tags !== undefined ? b.tags : (existing?.tags ?? []),
        });

        // 메모·태그만 고치는 경우엔 다시 떠오지 않는다
        const arc = new Archive(ROOT, galleryId);
        if (b.on === true || (!arc.has(no) && b.note === undefined && b.tags === undefined)) {
          const base = new Store(ROOT, galleryId).load().get(no) || {};
          console.log(`  보존 시작: ${no} ${base.title || ''}`);
          const r = await arc.capture(http_, gallery, no, base);
          bmk.markArchived(no, true).save();
          const s2 = r.snapshot;
          console.log(`  보존 완료: ${no} · ${r.gone ? '원문 없음' : (s2.body_text?.length || 0) + '자'}`);
          return json(res, 200, {
            ok: true, gone: r.gone, count: bmk.count,
            bodyLen: s2.body_text?.length || 0,
            comments: s2.comments?.length || 0,
            images: (s2.local_images || []).filter((i) => i.file).length,
          });
        }
        bmk.save();
        return json(res, 200, { ok: true, count: bmk.count });
      }
    }

    if (url.pathname === '/api/labels') {
      if (req.method === 'GET') return json(res, 200, new Labels(ROOT, galleryId).data);
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 4e6) { req.destroy(); return; }
        }
        // 파일은 body 를 다 받은 뒤에 읽는다. 먼저 읽으면 그 사이 다른 기기의
        // 저장이 끼어들어 덮어써진다.
        const labels = new Labels(ROOT, galleryId);
        const incoming = JSON.parse(body || '{}');
        const n = labels.merge(incoming.manual || {});
        labels.save();
        console.log(`  라벨 ${n}건 반영 → 총 ${labels.count}건`);
        return json(res, 200, { ok: true, changed: n, count: labels.count });
      }
    }
    // 웹에서 클릭 한 번으로 채굴
    if (req.method === 'POST' && url.pathname === '/api/mine') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 1e5) { req.destroy(); return; } }
      const b = JSON.parse(body || '{}');
      const glos = new Glossary(ROOT);
      const t0 = Date.now();
      const { added, posts } = mine(ROOT, galleryId, glos, { min: Number(b.min || 2) });
      glos.save();
      const pending = Object.values(glos.data.candidates).filter((v) => v.status !== 'rejected').length;
      console.log(`  채굴: 글 ${posts}건 · 신규 후보 ${added}개 · 미확인 ${pending}개 (${Date.now() - t0}ms)`);
      return json(res, 200, {
        ok: true, added, posts, pending, ms: Date.now() - t0,
        candidates: Object.entries(glos.data.candidates)
          .filter(([, v]) => v.status !== 'rejected')
          .sort((a, b2) => (b2[1].score || 0) - (a[1].score || 0)).slice(0, 150)
          .map(([w, v]) => ({ w, n: v.count, g: v.guess_type || null, gf: v.guess_from || null, ex: (v.examples || []).slice(0, 2), ctx: (v.context || []).slice(0, 4) })),
      });
    }

    if (url.pathname === '/api/glossary') {
      let glos = new Glossary(ROOT);
      const reply = () => json(res, 200, {
        ok: true, terms: glos.data.terms,
        candidates: Object.entries(glos.data.candidates || {})
          .filter(([, v]) => v.status !== 'rejected')
          .sort((a, b) => (b[1].score || 0) - (a[1].score || 0)).slice(0, 150)
          .map(([w, v]) => ({ w, n: v.count, g: v.guess_type || null, gf: v.guess_from || null, ex: (v.examples || []).slice(0, 2), ctx: (v.context || []).slice(0, 4) })),
      });
      if (req.method === 'GET') return reply();
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 1e6) { req.destroy(); return; } }
        glos = new Glossary(ROOT);            // 최신 상태로 다시 읽고 나서 고친다
        const b = JSON.parse(body || '{}');
        if (b.promote?.word) {
          glos.promote(b.promote.word, {
            type: b.promote.type || 'meta', canon: b.promote.canon || b.promote.word,
            gloss: b.promote.gloss || '', concept: b.promote.concept || null, by: 'viewer',
          });
          console.log(`  사전 확정: ${b.promote.word} (${b.promote.type})`);
        }
        if (b.reject) {
          glos.reject(b.reject);
          glos.data.stopwords ||= [];
          if (!glos.data.stopwords.includes(b.reject)) glos.data.stopwords.push(b.reject);
          console.log(`  사전 기각: ${b.reject}`);
        }
        glos.save();
        return reply();
      }
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    json(res, 500, { error: e.message });
  }
});

server.listen(port, host, () => {
  const addr = `http://${isLocal ? '127.0.0.1' : host}:${port}`;
  const q = TOKEN ? `?t=${TOKEN}` : '';
  console.log(`\n  갤수집기 (${galleryId})`);
  console.log(`    수집   ${addr}/${q}`);
  console.log(`    서재   ${addr}/library${q}`);
  console.log(`    사전   ${addr}/glossary${q}`);
  if (TOKEN) {
    console.log(`\n  다른 기기에서 접속하려고 열었어요. 토큰이 있어야 들어올 수 있습니다.`);
    console.log(`    토큰   ${TOKEN}`);
    console.log(`    한 번 ?t= 로 들어오면 쿠키에 저장돼서 다음부터는 안 붙여도 됩니다.`);
    // 같은 망에서 쓸 주소를 찾아준다
    const nets = os.networkInterfaces();
    const lan = Object.values(nets).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
    for (const n of lan) console.log(`    이 컴퓨터 주소   http://${n.address}:${port}/?t=${TOKEN}`);
  }
  console.log('\n  Ctrl+C 로 종료합니다.\n');
  if (args.open !== false && isLocal) execFile('open', [addr]);
});
