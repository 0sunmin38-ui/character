// 수집 로직 — CLI(crawl.mjs) 와 뷰어 서버(serve.mjs) 가 함께 쓴다.
import { Http } from './http.mjs';
import { parseList, parseView, parseComments, SCHEMA_VERSION } from './parse.mjs';
import { Store, mergeRecord } from './store.mjs';

/**
 * 감시 목록의 '@개념:statusboard' 같은 참조를 사전의 실제 표면형으로 편다.
 * 사전에 말을 추가하면 다음 수집부터 그 말도 자동으로 검색된다.
 * 한 글자짜리 표면형(케, 움, 팟…)은 검색어로 쓰면 노이즈만 나와서 뺀다.
 */
export function expandTargets(targets, glos, { max = 60 } = {}) {
  const out = [];
  const seen = new Set();
  for (const t of targets || []) {
    const kw = String(t.keyword || '');
    if (t.mode !== 'search' || !kw.startsWith('@') || !glos) {
      const k = `${t.mode}:${kw}`;
      if (!seen.has(k)) { seen.add(k); out.push(t); }
      continue;
    }
    for (const form of glos.expand([kw])) {
      if (typeof form !== 'string' || form.startsWith('re:')) continue;
      if (form.length < 2) continue;
      const k = `search:${form}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...t, keyword: form, from_ref: kw });
      if (out.length >= max) return out;
    }
  }
  return out.slice(0, max);
}

export const tagOf = (t) =>
  t.mode === 'search' ? `search:${t.searchType || 'search_subject_memo'}:${t.keyword}` : t.mode;

/**
 * 한 번의 수집 실행. onStep 으로 진행 상황을 흘려보낸다.
 * @param {(s:{phase:string,done:number,total:number,label:string})=>void} onStep
 * @param {()=>boolean} shouldStop 중단 요청 확인
 */
export async function runCrawl(ROOT, cfg, opts, onStep = () => {}, shouldStop = () => false) {
  const gallery = { ...cfg.gallery, id: opts.gallery || cfg.gallery.id };
  const job = opts.job ? cfg.jobs[opts.job] : null;
  const rawTargets = job ? job.targets : opts.targets || [];
  const targets = expandTargets(rawTargets, opts.glossary || null);
  const detailCfg = {
    enabled: opts.detail ?? job?.detail?.enabled ?? false,
    onlyRecommend: opts.onlyRecommend ?? job?.detail?.onlyRecommend ?? false,
    maxPosts: Number(opts.maxDetail ?? job?.detail?.maxPosts ?? 30),
    comments: opts.comments ?? job?.detail?.comments ?? true,
    minRecommend: Number(opts.minRecommend ?? 0),
    refresh: !!opts.refresh,
  };

  const runAt = new Date().toISOString();
  const runId = runAt.replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const http = new Http(cfg.http);
  const store = new Store(ROOT, gallery.id);
  const state = store.state();
  const existing = store.load();

  const collected = new Map();
  const errors = [];
  const logs = [];
  const say = (m) => { logs.push(m); };

  // ── 1단계: 목록 ───────────────────────────────────────────
  const listTotal = targets.reduce((n, t) => n + Number(t.pages || 1), 0);
  let listDone = 0;
  for (const t of targets) {
    const pages = Number(t.pages || 1);
    const tag = tagOf(t);
    for (let p = 1; p <= pages; p++) {
      if (shouldStop()) { say('중단 요청으로 목록 수집을 멈췄어요.'); break; }
      onStep({ phase: 'list', done: listDone, total: listTotal, label: `${tag} ${p}쪽` });
      try {
        const html = await http.fetchList(gallery, t, p);
        const rows = parseList(html, { galleryId: gallery.id, sourceTag: tag, runAt });
        const posts = rows.filter((r) => !r.is_notice || opts.withNotice);
        for (const r of posts) collected.set(r.no, mergeRecord(collected.get(r.no), r));
        say(`[목록] ${tag} ${p}쪽 → ${posts.length}건`);
        if (posts.length === 0) { listDone += pages - p + 1; break; }
      } catch (e) {
        errors.push({ stage: 'list', target: tag, page: p, message: e.message });
        say(`[실패] ${tag} ${p}쪽: ${e.message}`);
      }
      listDone++;
    }
    if (shouldStop()) break;
  }

  // ── 2단계: 본문 + 댓글 ────────────────────────────────────
  let detailDone = 0;
  if (detailCfg.enabled && !shouldStop()) {
    const candidates = [...collected.values()]
      .filter((r) => {
        const prev = existing.get(r.no);
        const hasDetail = prev?.detail && (!detailCfg.comments || prev.comments);
        if (hasDetail && !detailCfg.refresh) return false;
        if (detailCfg.onlyRecommend && !r.from.includes('recommend')) return false;
        return r.recommend >= detailCfg.minRecommend;
      })
      .sort((a, b) => b.recommend - a.recommend || b.no - a.no)
      .slice(0, detailCfg.maxPosts);

    for (const r of candidates) {
      if (shouldStop()) { say('중단 요청으로 본문 수집을 멈췄어요.'); break; }
      onStep({ phase: 'detail', done: detailDone, total: candidates.length, label: r.title.slice(0, 30) });
      try {
        const html = await http.fetchView(gallery, r.no);
        const d = parseView(html, { runAt });
        r.detail = d;
        if (d.title) r.title = d.title;
        if (d.views != null) r.views = d.views;
        if (d.recommend != null) r.recommend = d.recommend;
        r.comment_count = d.comment_count ?? r.comment_count;

        if (detailCfg.comments && r.comment_count > 0 && d.esno) {
          const all = [];
          const pages = Math.min(Math.ceil(r.comment_count / 100), 10);
          for (let cp = 1; cp <= pages; cp++) {
            const { items } = parseComments(await http.fetchComments(gallery, r.no, d.esno, cp), d.date || r.date);
            if (!items.length) break;
            all.push(...items);
          }
          const seen = new Set();
          r.comments = all.filter((c) => !seen.has(c.no) && seen.add(c.no));
        } else if (detailCfg.comments) r.comments = [];
        detailDone++;
        say(`[본문] ${r.no} 추천${r.recommend} · ${r.title.slice(0, 34)}`);
      } catch (e) {
        errors.push({ stage: 'view', no: r.no, message: e.message });
        say(`[실패] 본문 ${r.no}: ${e.message}`);
      }
    }
  }

  // ── 3단계: 저장 ───────────────────────────────────────────
  const records = [...collected.values()];
  const newPosts = records.filter((r) => !existing.has(r.no));
  const maxNo = records.reduce((m, r) => Math.max(m, r.no), 0);

  const manifest = {
    run_id: runId, schema: SCHEMA_VERSION,
    started_at: runAt, finished_at: new Date().toISOString(),
    gallery, job: opts.job || null,
    targets: targets.map((t) => ({ ...t, tag: tagOf(t) })),
    detail: detailCfg,
    counts: { seen: records.length, new: newPosts.length, details: detailDone },
    http: http.stats, errors, dry: !!opts.dry, source: opts.source || 'cli',
  };

  if (!opts.dry) {
    store.append(records);
    store.saveRun(manifest);
    store.saveState({
      last_no: Math.max(state.last_no || 0, maxNo),
      last_run: runId, last_run_at: manifest.finished_at,
      runs: (state.runs || 0) + 1, total_posts: store.load().size,
    });
  }
  return { manifest, logs, records: records.length, newCount: newPosts.length, detailDone, errors };
}
