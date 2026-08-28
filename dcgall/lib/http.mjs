// 디시인사이드 요청 계층: 고정 헤더 + 레이트리밋 + 재시도.
// 매 실행마다 동일한 방식으로 페이지를 밟기 위해 모든 요청은 반드시 여기를 통과한다.

const BASE = 'https://gall.dcinside.com';

export class Http {
  constructor(cfg) {
    this.cfg = cfg;
    this.lastAt = 0;
    this.stats = { requests: 0, retries: 0, errors: 0, bytes: 0 };
  }

  headers(extra = {}) {
    return {
      'User-Agent': this.cfg.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      'Referer': `${BASE}/`,
      ...extra,
    };
  }

  async throttle() {
    const wait = this.cfg.delayMs + Math.floor(Math.random() * this.cfg.jitterMs);
    const since = Date.now() - this.lastAt;
    if (since < wait) await new Promise((r) => setTimeout(r, wait - since));
    this.lastAt = Date.now();
  }

  async request(url, { method = 'GET', body = null, headers = {} } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= this.cfg.retries; attempt++) {
      await this.throttle();
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);
      try {
        this.stats.requests++;
        const res = await fetch(url, {
          method,
          body,
          headers: this.headers(headers),
          signal: ac.signal,
          redirect: 'follow',
        });
        if (res.status === 404 || res.status === 403) {
          // 삭제·비공개 글. 재시도해봐야 소용없다.
          const gone = new Error(`HTTP ${res.status}`);
          gone.status = res.status; gone.gone = true;
          throw gone;
        }
        if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        this.stats.bytes += text.length;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // 디시 차단/점검 페이지 감지
        if (text.length < 3000 && /자동입력|차단|blocked|접근이 제한/i.test(text)) {
          throw new Error('BLOCKED: 접근 제한 페이지 반환');
        }
        return text;
      } catch (e) {
        lastErr = e;
        if (e.gone) { clearTimeout(timer); throw e; }
        this.stats.retries++;
        const backoff = 1500 * Math.pow(2, attempt);
        if (attempt < this.cfg.retries) await new Promise((r) => setTimeout(r, backoff));
      } finally {
        clearTimeout(timer);
      }
    }
    this.stats.errors++;
    throw new Error(`요청 실패 ${url}: ${lastErr?.message}`);
  }

  /** 이미지 등 바이너리 수집용 */
  async fetchBinary(url, referer) {
    await this.throttle();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);
    try {
      this.stats.requests++;
      const res = await fetch(url, {
        headers: { 'User-Agent': this.cfg.userAgent, 'Accept': 'image/*,video/*,*/*;q=0.8', 'Referer': referer || 'https://gall.dcinside.com/' },
        signal: ac.signal, redirect: 'follow',
      });
      if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
      const buf = Buffer.from(await res.arrayBuffer());
      this.stats.bytes += buf.length;
      return { buf, type: res.headers.get('content-type') || '' };
    } finally { clearTimeout(timer); }
  }

  listUrl(gallery, target, page) {
    const seg = gallery.type === 'mgallery' ? '/mgallery/board/lists/' : '/board/lists/';
    const u = new URL(BASE + seg);
    u.searchParams.set('id', gallery.id);
    u.searchParams.set('page', String(page));
    if (target.mode === 'recommend') u.searchParams.set('exception_mode', 'recommend');
    if (target.mode === 'notice') u.searchParams.set('exception_mode', 'notice');
    if (target.mode === 'search') {
      u.searchParams.set('s_type', target.searchType || 'search_subject_memo');
      u.searchParams.set('s_keyword', target.keyword || '');
    }
    return u.toString();
  }

  viewUrl(gallery, no) {
    const seg = gallery.type === 'mgallery' ? '/mgallery/board/view/' : '/board/view/';
    return `${BASE}${seg}?id=${encodeURIComponent(gallery.id)}&no=${no}`;
  }

  fetchList(gallery, target, page) {
    return this.request(this.listUrl(gallery, target, page), {
      headers: { Referer: `${BASE}/mgallery/board/lists/?id=${gallery.id}` },
    });
  }

  fetchView(gallery, no) {
    return this.request(this.viewUrl(gallery, no), {
      headers: { Referer: `${BASE}/mgallery/board/lists/?id=${gallery.id}` },
    });
  }

  fetchComments(gallery, no, esno, page = 1) {
    const body = new URLSearchParams({
      id: gallery.id, no: String(no),
      cmt_id: gallery.id, cmt_no: String(no),
      e_s_n_o: esno || '', comment_page: String(page),
    }).toString();
    return this.request(`${BASE}/board/comment/`, {
      method: 'POST',
      body,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Origin': BASE,
        'Referer': this.viewUrl(gallery, no),
      },
    });
  }
}
