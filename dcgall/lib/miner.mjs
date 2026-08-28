// 은어 채굴 로직 — CLI(mine.mjs) 와 뷰어 서버(serve.mjs) 가 함께 쓴다.
import { Store } from './store.mjs';

// 한국어 일반어 씨앗 목록. 기각한 말은 glossary.stopwords 에 영구히 쌓인다.
export const SEED_STOP = `그리고 그래서 그런데 하지만 그러면 그러니까 진짜 너무 정말 완전 대박 이거 저거 그거 여기 저기 거기
지금 아까 나중 오늘 어제 내일 요즘 예전 처음 마지막 다음 이제 아직 벌써 이미 계속 자꾸 다시 또한 역시 그냥 아니 맞아
사람 사람들 우리 내가 니가 네가 자기 본인 다들 모두 전부 혼자 서로 거야 거임 건가 건데 는데 인데 한테 에게
있어 있는 있다 있음 없어 없는 없다 없음 하는 하다 한다 했어 했다 하고 해서 하면 되는 된다 됐어 되고 보면 보니 봤어
같은 같다 같아 같은데 어떻게 어떤 무슨 왜냐 근데 혹시 만약 제발 아마 살짝 조금 많이 엄청 훨씬 제일 가장 더욱
좋다 좋아 좋은 싫어 미친 개쩐 뭔가 뭐가 이런 저런 그런 이렇게 저렇게 그렇게 새로 오랜만에
질문 추천 공유 후기 리뷰 안내 공지 이벤트 업뎃 업데이트 버전 사용 문제 상황 방법 기능 관련 내용 정도 부분 이유
갤러 갤러리 갤럼 형들 얘들 애들 님들 여러분 궁금 감사 죄송 부탁 도움 생각 마음 기분 느낌 얘기 이야기 소리 말이
하나 둘셋 몇개 개월 정말로 이번 저번 다른 새로운 비슷 여러 각각 전체 일단 결국 역시나 심지어 특히 물론`
  .split(/\s+/).filter(Boolean);

/**
 * 빈도가 아니라 특이도로 뽑는다.
 *  1) 태그 자리  — [케/팊/엘] 처럼 대괄호 안에 오면 거의 확실히 고유어
 *  2) 형제 단서  — 같은 태그 묶음에 아는 플랫폼이 있으면 이것도 같은 종류다
 *  3) 슬롯 위치  — 단 [케덕/진도오] 의 뒷칸은 플랫폼이 아니라 캐릭터 이름이므로 감점
 *  4) 제목 등장  — 제목은 군더더기가 없어서 은어 밀도가 높다
 *  5) 본문 편재  — 본문 곳곳에 고르게 퍼진 말은 일반어이므로 감점
 */
export function mine(ROOT, galleryId, glos, { min = 2, limit = 300 } = {}) {
  const STOP = new Set([...SEED_STOP, ...(glos.data.stopwords || [])]);
  const posts = [...new Store(ROOT, galleryId).load().values()].filter((p) => !p.is_notice);
  const bodies = posts.filter((p) => p.detail?.body_text).length || 1;

  const titleDF = new Map(), bodyDF = new Map(), tagN = new Map();
  const ex = new Map(), co = new Map(), sib = new Map();
  const bump = (m, k, v = 1) => m.set(k, (m.get(k) || 0) + v);
  const touch = (w) => { if (!ex.has(w)) { ex.set(w, []); co.set(w, new Map()); sib.set(w, new Map()); } };

  const usable = (t) => t && !STOP.has(t) && !glos.has(t) && !glos.matchesPattern(t)
    && glos.data.candidates[t]?.status !== 'rejected' && !/^\d/.test(t);
  const words = (s) => (String(s).match(/[가-힣]{2,6}|[A-Za-z][A-Za-z0-9.]{2,11}/g) || []).map((w) => w.toLowerCase());

  for (const p of posts) {
    const title = p.title || '';
    const body = (p.detail?.body_text || '').slice(0, 4000);
    const known = glos.detect(title + '\n' + body);

    for (const m of title.matchAll(/[[(【]([^\])】]{1,24})[\])】]/g)) {
      const parts = m[1].split(/[/|,]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
      const resolved = parts.map((x) => glos.surface.get(x) || null);
      const knownSibs = resolved.filter(Boolean);
      const leadIsPlatform = resolved[0] && glos.data.terms[resolved[0]]?.type === 'platform';
      parts.forEach((t, idx) => {
        if (!usable(t) || !/^[가-힣a-z]{1,12}$/.test(t)) return;
        touch(t); bump(tagN, t);
        if (leadIsPlatform && idx > 0) { bump(sib.get(t), '__npc__'); return; }
        for (const k of knownSibs) bump(sib.get(t), k);
      });
    }
    for (const t of new Set(words(title))) {
      if (!usable(t)) continue;
      touch(t); bump(titleDF, t);
      if (ex.get(t).length < 4) ex.get(t).push(title.slice(0, 58));
      for (const k of known) bump(co.get(t), k);
    }
    for (const t of new Set(words(body))) {
      if (!usable(t)) continue;
      touch(t); bump(bodyDF, t);
      for (const k of known) bump(co.get(t), k);
    }
  }

  const typeOf = (w) => {
    const s = [...sib.get(w).entries()].sort((a, b) => b[1] - a[1])[0];
    if (!s) return null;
    if (s[0] === '__npc__') return { type: 'role', from: '플랫폼/이름 형식', npc: true };
    const t = glos.data.terms[s[0]]?.type;
    return t ? { type: t, from: s[0] } : null;
  };

  const ranked = [...new Set([...titleDF.keys(), ...tagN.keys()])]
    .map((w) => {
      const tdf = titleDF.get(w) || 0, bdf = bodyDF.get(w) || 0, tg = tagN.get(w) || 0;
      const spread = bdf / bodies;
      const general = spread > 0.15 ? (spread - 0.15) * 40 : 0;
      const guess = typeOf(w);
      const score = tg * 8 + tdf * 2 + Math.min(bdf, 6) * 0.3 + (guess ? (guess.npc ? -10 : 6) : 0) - general;
      const ctx = [...co.get(w).entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
      return { w, n: tdf + tg, tdf, bdf, tg, guess, ctx, ex: ex.get(w), score: Math.round(score * 10) / 10 };
    })
    .filter((r) => r.score > 0 && r.n >= min)
    .sort((a, b) => b.score - a.score);

  const found = {};
  for (const r of ranked.slice(0, limit)) {
    found[r.w] = {
      count: r.n, score: r.score, in_tag: r.tg,
      guess_type: r.guess?.type || null, guess_from: r.guess?.from || null,
      context: r.ctx, examples: r.ex, last_seen: new Date().toISOString(),
    };
  }
  const added = glos.addCandidates(found);
  return { ranked, added, posts: posts.length };
}
