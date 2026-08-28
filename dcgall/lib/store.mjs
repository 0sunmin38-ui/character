// 저장 계층: append-only JSONL + 병합 리더.
// 레이아웃
//   data/<gallery>/posts/YYYY-MM.jsonl   글 레코드 (버전마다 한 줄, append-only)
//   data/<gallery>/runs/<runId>.json     실행 매니페스트 (파라미터/집계/에러)
//   data/<gallery>/state.json            커서 (마지막 최대 글번호 등)
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './paths.mjs';

export class Store {
  constructor(root, galleryId) {
    this.dir = path.join(dataDir(root), galleryId);
    this.postsDir = path.join(this.dir, 'posts');
    this.runsDir = path.join(this.dir, 'runs');
    fs.mkdirSync(this.postsDir, { recursive: true });
    fs.mkdirSync(this.runsDir, { recursive: true });
    this.statePath = path.join(this.dir, 'state.json');
  }

  bucket(rec) {
    const d = rec.date || rec.crawled_at || new Date().toISOString();
    return d.slice(0, 7); // YYYY-MM
  }

  append(records) {
    const byBucket = new Map();
    for (const r of records) {
      const b = this.bucket(r);
      if (!byBucket.has(b)) byBucket.set(b, []);
      byBucket.get(b).push(JSON.stringify(r));
    }
    for (const [b, lines] of byBucket) {
      fs.appendFileSync(path.join(this.postsDir, `${b}.jsonl`), lines.join('\n') + '\n', 'utf8');
    }
    return records.length;
  }

  /** 모든 JSONL 을 읽어 글번호 기준으로 병합한 Map<no, record> */
  load({ since = null } = {}) {
    const files = fs.readdirSync(this.postsDir).filter((f) => f.endsWith('.jsonl')).sort();
    const merged = new Map();
    for (const f of files) {
      if (since && f.slice(0, 7) < since.slice(0, 7)) continue;
      const raw = fs.readFileSync(path.join(this.postsDir, f), 'utf8');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        let rec;
        try { rec = JSON.parse(line); } catch { continue; }
        merged.set(rec.no, mergeRecord(merged.get(rec.no), rec));
      }
    }
    return merged;
  }

  state() {
    try { return JSON.parse(fs.readFileSync(this.statePath, 'utf8')); }
    catch { return { last_no: 0, last_run: null, runs: 0 }; }
  }

  saveState(s) {
    fs.writeFileSync(this.statePath, JSON.stringify(s, null, 2) + '\n', 'utf8');
  }

  saveRun(manifest) {
    fs.writeFileSync(path.join(this.runsDir, `${manifest.run_id}.json`), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  }

  runs(limit = 30) {
    return fs.readdirSync(this.runsDir).filter((f) => f.endsWith('.json')).sort().slice(-limit)
      .map((f) => JSON.parse(fs.readFileSync(path.join(this.runsDir, f), 'utf8')));
  }
}

/** 새 레코드가 이겨야 하지만, 이미 받아둔 detail 은 절대 잃지 않는다. */
export function mergeRecord(oldRec, newRec) {
  if (!oldRec) return { ...newRec, first_seen_at: newRec.first_seen_at || newRec.seen_at };
  const newer = (newRec.crawled_at || '') >= (oldRec.crawled_at || '') ? newRec : oldRec;
  const older = newer === newRec ? oldRec : newRec;
  return {
    ...older,
    ...newer,
    first_seen_at: [oldRec.first_seen_at || oldRec.seen_at, newRec.first_seen_at || newRec.seen_at].filter(Boolean).sort()[0],
    from: [...new Set([...(oldRec.from || []), ...(newRec.from || [])])],
    detail: newRec.detail || oldRec.detail || null,
    comments: newRec.comments || oldRec.comments || null,
  };
}
