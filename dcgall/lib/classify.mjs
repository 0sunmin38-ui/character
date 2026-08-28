// taxonomy.json 의 신호 사전으로 글을 채점해 분류한다.
// 자동 분류는 언제나 제안일 뿐이고, labels.json 의 수동 라벨이 항상 이긴다.

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');

function makeMatcher(term) {
  if (term.startsWith('re:')) {
    const re = new RegExp(term.slice(3), 'i');
    return (hay) => re.test(hay);
  }
  const t = norm(term);
  return (hay) => t.length > 0 && hay.includes(t);
}

let compiled = null;
/** @param glos Glossary — 있으면 taxonomy 의 '@개념:…' 참조를 실제 단어로 편다 */
export function compile(taxonomy, glos = null) {
  const ex = (terms) => (glos ? glos.expand(terms || []) : (terms || []));
  compiled = {
    threshold: taxonomy.threshold ?? 4,
    margin: taxonomy.margin ?? 0.25,
    cats: taxonomy.categories.map((c) => ({
      key: c.key, label: c.label, emoji: c.emoji || '', desc: c.desc || '',
      require: ex(c.require).map((t) => ({ term: t, test: makeMatcher(t) })),
      signals: Object.entries(c.signals || {}).map(([kind, s]) => ({
        kind, w: s.w, cap: s.cap ?? Infinity,
        ms: ex(s.terms).map((t) => ({ term: t, test: makeMatcher(t) })),
      })),
    })),
  };
  return compiled;
}

/** 제목의 [대괄호]/(소괄호) 안 토큰들 */
export function titleTags(title) {
  const out = [];
  for (const m of String(title || '').matchAll(/[[(【]([^\])】]{1,20})[\])】]/g)) {
    for (const part of m[1].split(/[/|,]/)) {
      const p = norm(part);
      if (p) out.push(p);
    }
  }
  return out;
}

/**
 * @returns {{category, label, score, confidence, ambiguous, scores, hits}}
 */
export function classify(post, tax = compiled) {
  const title = norm(post.title);
  const tags = titleTags(post.title);
  const head = norm(post.headtext);
  const body = norm(post.detail?.body_text || '').slice(0, 12000);
  const haystacks = { tag: tags, titleStrong: title, title, head, body, neg: title + ' ' + head + ' ' + body };

  const anyText = title + ' ' + head + ' ' + body + ' ' + tags.join(' ');
  const scores = {};
  const hits = {};
  for (const c of tax.cats) {
    // require: 맥락 전제조건. 하나도 안 걸리면 이 분류는 후보에서 빠진다.
    if (c.require.length && !c.require.some((m) => m.test(anyText))) { scores[c.key] = 0; hits[c.key] = []; continue; }
    let total = 0;
    const hit = [];
    for (const sig of c.signals) {
      const hay = haystacks[sig.kind];
      let sub = 0;
      for (const m of sig.ms) {
        const found = Array.isArray(hay) ? hay.some((t) => m.test(t)) : m.test(hay);
        if (found) { sub += sig.w; hit.push(`${sig.kind}:${m.term}`); }
        if (Math.abs(sub) >= Math.abs(sig.w) * sig.cap) break;
      }
      total += sig.cap === Infinity ? sub : Math.max(-Math.abs(sig.w * sig.cap), Math.min(sig.w * sig.cap, sub));
    }
    scores[c.key] = Math.round(total * 10) / 10;
    hits[c.key] = hit;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topKey, topScore] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;

  if (topScore < tax.threshold) {
    return { category: 'etc', label: '기타', score: topScore, confidence: 0, ambiguous: false, scores, hits: [] };
  }
  const rel = topScore > 0 ? (topScore - Math.max(second, 0)) / topScore : 0;
  const cat = tax.cats.find((c) => c.key === topKey);
  return {
    category: topKey,
    label: cat.label,
    score: topScore,
    confidence: Math.round(rel * 100) / 100,
    ambiguous: rel < tax.margin,
    also: ranked.filter(([k, v]) => k !== topKey && v >= tax.threshold).map(([k]) => k),
    scores,
    hits: hits[topKey],
  };
}

export const ETC = { key: 'etc', label: '기타', emoji: '·', desc: '분류되지 않음' };
