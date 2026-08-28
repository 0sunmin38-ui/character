// 은어 사전 로더 — 분류기·마이너·리포트가 공유한다.
import fs from 'node:fs';
import path from 'node:path';
import { confFile } from './paths.mjs';

export class Glossary {
  constructor(root) {
    this.file = confFile(root, 'glossary.json');
    this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    this.index();
  }

  index() {
    // 표면형 -> 표제어. 별칭까지 모두 역인덱스.
    this.surface = new Map();
    this.byConcept = new Map();
    this.byType = new Map();
    for (const [term, v] of Object.entries(this.data.terms)) {
      const forms = [term, ...(v.aliases || [])];
      for (const f of forms) this.surface.set(f.toLowerCase(), term);
      if (v.concept) {
        if (!this.byConcept.has(v.concept)) this.byConcept.set(v.concept, []);
        this.byConcept.get(v.concept).push(...forms);
      }
      if (!this.byType.has(v.type)) this.byType.set(v.type, []);
      this.byType.get(v.type).push(...forms);
    }
    this.pats = (this.data.patterns || []).map((p) => ({ ...p, rx: new RegExp(p.re, 'gi') }));
  }

  /** taxonomy 의 '@개념:키' / '@분류:타입' / '@패턴:키' 를 실제 단어 목록으로 편다 */
  expand(terms = []) {
    const out = [];
    for (const t of terms) {
      if (typeof t !== 'string' || !t.startsWith('@')) { out.push(t); continue; }
      const [kind, key] = t.slice(1).split(':');
      if (kind === '개념' || kind === 'concept') out.push(...(this.byConcept.get(key) || []));
      else if (kind === '분류' || kind === 'type') out.push(...(this.byType.get(key) || []));
      else if (kind === '패턴' || kind === 'pattern') {
        const p = this.pats.find((x) => x.key === key);
        if (p) out.push('re:' + p.re);
      }
    }
    return [...new Set(out)];
  }

  /** 텍스트에서 사전에 있는 은어를 찾아낸다 (분류 근거 표시·문맥 브리핑용) */
  detect(text = '') {
    const low = String(text).toLowerCase();
    const hits = new Set();
    for (const [form, term] of this.surface) if (form.length > 1 && low.includes(form)) hits.add(term);
    for (const p of this.pats) { p.rx.lastIndex = 0; if (p.rx.test(low)) hits.add('@' + p.key); }
    return [...hits];
  }

  get(term) { return this.data.terms[this.surface.get(String(term).toLowerCase())] || null; }
  has(term) { return this.surface.has(String(term).toLowerCase()); }

  /** 패턴에 걸리는 표면형인지 (마이너가 이미 설명된 조어를 후보에서 빼는 데 씀) */
  matchesPattern(word) {
    for (const p of this.pats) { p.rx.lastIndex = 0; if (p.rx.test(word)) return p.key; }
    return null;
  }

  addCandidates(found) {
    const c = (this.data.candidates ||= {});
    let added = 0;
    for (const [word, info] of Object.entries(found)) {
      if (this.has(word) || this.matchesPattern(word)) continue;
      const prev = c[word];
      if (prev) {
        prev.count = info.count;
        prev.examples = info.examples.slice(0, 4);
        prev.last_seen = info.last_seen;
      } else {
        c[word] = { ...info, first_seen: info.last_seen, status: 'pending' };
        added++;
      }
    }
    return added;
  }

  /** 후보를 확정 용어로 승격 */
  promote(word, { type, canon, gloss, aliases = [], concept = null, by = 'user' }) {
    this.data.terms[word] = { type, canon: canon || word, gloss: gloss || '', aliases, concept, confirmed: true, by, at: new Date().toISOString() };
    delete this.data.candidates[word];
    this.index();
    return this;
  }

  reject(word) {
    if (this.data.candidates[word]) this.data.candidates[word].status = 'rejected';
    return this;
  }

  save() {
    this.data.updated_at = new Date().toISOString();
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2) + '\n', 'utf8');
    return this;
  }
}
