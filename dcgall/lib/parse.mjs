// 디시 HTML -> 균일한 레코드. 파서가 바뀌면 PARSER_VERSION 을 올린다.
export const PARSER_VERSION = 2;   // v2: uid·IP 를 저장하지 않음
export const SCHEMA_VERSION = 1;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#034': '"' };

export function decode(s = '') {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => (ENT[n.toLowerCase()] !== undefined ? ENT[n.toLowerCase()] : m));
}

export function stripTags(html = '') {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  ).replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? decode(m[1]) : '';
};

// "2026-08-28 14:22:34" (KST) -> ISO8601
export function kstToIso(s) {
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se = '00'] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${se}+09:00`;
}

// "08.28 10:43:45" 형태 댓글 시각 -> ISO (연도는 기준일에서 추론)
export function cmtDateToIso(s, refIso) {
  const ref = refIso ? new Date(refIso) : new Date();
  const m = String(s).match(/(?:(\d{2,4})\.)?(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  let [, y, mo, d, h, mi, se = '00'] = m;
  let year = y ? (y.length === 2 ? 2000 + +y : +y) : ref.getFullYear();
  const iso = `${year}-${mo}-${d}T${h}:${mi}:${se}+09:00`;
  // 연말/연초 경계 보정
  if (!y && new Date(iso) - ref > 7 * 864e5) return `${year - 1}-${mo}-${d}T${h}:${mi}:${se}+09:00`;
  return iso;
}

/** 목록 페이지 -> 게시글 요약 레코드 배열 */
export function parseList(html, ctx) {
  const out = [];
  const rows = html.match(/<tr class="ub-content us-post"[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    const head = row.match(/<tr[^>]*>/)[0];
    const no = Number(attr(head, 'data-no'));
    if (!no) continue;
    const type = attr(head, 'data-type');
    const subj = row.match(/<td class="gall_subject"[^>]*>([\s\S]*?)<\/td>/);
    const headtext = subj ? stripTags(subj[1]) : '';
    const isNotice = /icon_notice/.test(type) || headtext === '공지';

    const titleM = row.match(/<td class="gall_tit[^"]*">[\s\S]*?<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const href = titleM ? decode(titleM[1]) : '';
    const title = titleM ? stripTags(titleM[2]) : '';

    const wr = row.match(/<td class="gall_writer[^"]*"[^>]*>/);
    const writer = wr ? wr[0] : '';

    const dt = row.match(/<td class="gall_date"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/td>/);
    const cmt = row.match(/<span class="reply_num">\[(\d+)\]<\/span>/);
    const num = (re) => { const m = row.match(re); const v = m ? m[1].replace(/[^\d]/g, '') : ''; return v ? Number(v) : 0; };

    out.push({
      schema: SCHEMA_VERSION,
      parser: PARSER_VERSION,
      gallery: ctx.galleryId,
      no,
      url: href.startsWith('http') ? href : `https://gall.dcinside.com${href}`,
      title,
      headtext,
      type,
      is_notice: isNotice,
      // 닉네임만 남긴다. 고정닉 uid 와 IP 조각은 식별정보라 처음부터 받지 않는다.
      author: { nick: attr(writer, 'data-nick') },
      date: dt ? kstToIso(dt[1]) : null,
      views: num(/<td class="gall_count">([\s\S]*?)<\/td>/),
      recommend: num(/<td class="gall_recommend">([\s\S]*?)<\/td>/),
      comment_count: cmt ? Number(cmt[1]) : 0,
      from: [ctx.sourceTag],
      seen_at: ctx.runAt,
      crawled_at: ctx.runAt,
      detail: null,
    });
  }
  return out;
}

/** write_div 내부를 depth 스캔으로 잘라낸다 */
function sliceWriteDiv(html) {
  const start = html.search(/<div class="write_div"/);
  if (start < 0) return null;
  const open = html.indexOf('>', start) + 1;
  let depth = 1, i = open;
  const re = /<div\b|<\/div>/gi;
  re.lastIndex = open;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) { i = m.index; break; }
  }
  return html.slice(open, i);
}

/** 본문 페이지 -> detail 조각 */
export function parseView(html, ctx) {
  const esno = (html.match(/name="e_s_n_o"\s+value="([^"]+)"/) || [])[1] || null;
  let body = sliceWriteDiv(html) || '';
  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<ins[\s\S]*?<\/ins>/gi, '')
    .replace(/<div[^>]*(?:adsbygoogle|ad_wrap|dcad)[\s\S]*?<\/div>/gi, '');

  const images = [];
  for (const m of body.matchAll(/<(?:img|video|source)\b[^>]*>/gi)) {
    const t = m[0];
    const src = attr(t, 'data-src') || attr(t, 'src');
    if (src && /^https?:/.test(src) && !/nstatic\.dcinside\.com/.test(src)) images.push(src);
  }

  const titleM = html.match(/<span class="title_subject">([\s\S]*?)<\/span>/);
  const headM = html.match(/<span class="title_headtext">([\s\S]*?)<\/span>/);
  const dateM = html.match(/<span class="gall_date"[^>]*title="([^"]*)"/);
  const viewM = html.match(/<span class="gall_count">[^\d]*([\d,]+)/);
  const recM = html.match(/<span class="gall_reply_num">[^\d]*([\d,]+)/);
  const cmtM = html.match(/<span class="gall_comment">[\s\S]*?댓글\s*([\d,]+)/);
  const n = (m) => (m ? Number(m[1].replace(/,/g, '')) : null);

  return {
    esno,
    title: titleM ? stripTags(titleM[1]) : null,
    headtext: headM ? stripTags(headM[1]).replace(/^\[|\]$/g, '') : '',
    date: dateM ? kstToIso(dateM[1]) : null,
    views: n(viewM),
    recommend: n(recM),
    comment_count: n(cmtM) ?? 0,
    body_html: body.trim() || null,
    body_text: stripTags(body),
    images: [...new Set(images)],
    fetched_at: ctx.runAt,
  };
}

/** 댓글 AJAX JSON -> 균일한 댓글 배열 */
export function parseComments(jsonText, postIso) {
  let j;
  try { j = JSON.parse(jsonText); } catch { return { total: 0, items: [] }; }
  const items = (j.comments || [])
    .filter((c) => c.no && String(c.no) !== '0')
    .map((c) => ({
      no: Number(c.no),
      parent: Number(c.parent) || null,
      depth: Number(c.depth) || 0,
      nick: c.name || '',
      date: cmtDateToIso(c.reg_date, postIso),
      text: stripTags(c.memo || ''),
      is_deleted: c.is_delete === '1' || c.del_yn === 'Y',
      is_dccon: /dccon|dcimg/i.test(c.memo || '') && !stripTags(c.memo || ''),
    }));
  return { total: Number(j.total_cnt) || items.length, items };
}
