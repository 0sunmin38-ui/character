// 아카이브 — 북마크한 글을 원문이 지워져도 읽을 수 있게 통째로 보존한다.
//   data/<갤러리>/archive/<글번호>/
//     post.json   파싱된 스냅샷 (본문·댓글·메타·보존시각)
//     raw.html    원본 HTML 그대로 (파서가 바뀌어도 다시 뽑을 수 있게)
//     img/…       본문 이미지 로컬 사본 (디시 이미지 서버도 언젠가 죽는다)
import fs from 'node:fs';
import path from 'node:path';
import { parseView, parseComments } from './parse.mjs';
import { dataDir } from './paths.mjs';

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
              'video/mp4': '.mp4', 'image/bmp': '.bmp' };

export class Archive {
  constructor(root, galleryId) {
    this.dir = path.join(dataDir(root), galleryId, 'archive');
    this.galleryId = galleryId;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  path(no) { return path.join(this.dir, String(no)); }
  has(no) { return fs.existsSync(path.join(this.path(no), 'post.json')); }

  load(no) {
    try { return JSON.parse(fs.readFileSync(path.join(this.path(no), 'post.json'), 'utf8')); }
    catch { return null; }
  }

  list() {
    return fs.readdirSync(this.dir).filter((d) => /^\d+$/.test(d)).map(Number).sort((a, b) => b - a);
  }

  /** 아카이브 총 용량 */
  size() {
    let bytes = 0, files = 0;
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) walk(f);
        else { bytes += fs.statSync(f).size; files++; }
      }
    };
    if (fs.existsSync(this.dir)) walk(this.dir);
    return { bytes, files };
  }

  /**
   * 글 하나를 통째로 보존한다.
   * @param http Http 인스턴스, gallery config, base 는 목록에서 얻은 요약 레코드
   */
  async capture(http, gallery, no, base = {}, { images = true, comments = true } = {}) {
    const dir = this.path(no);
    fs.mkdirSync(dir, { recursive: true });
    const at = new Date().toISOString();

    let html;
    try {
      html = await http.fetchView(gallery, no);
    } catch (e) {
      if (e.gone) {
        // 이미 지워진 글. 기존 아카이브가 있으면 살리고, 없으면 요약만이라도 남긴다.
        const prev = this.load(no);
        const snap = { ...(prev || { no, gallery: this.galleryId, ...base }), gone: true, gone_at: at, archived_at: prev?.archived_at || at };
        fs.writeFileSync(path.join(dir, 'post.json'), JSON.stringify(snap, null, 2) + '\n', 'utf8');
        return { ok: false, gone: true, snapshot: snap };
      }
      throw e;
    }

    fs.writeFileSync(path.join(dir, 'raw.html'), html, 'utf8');
    const detail = parseView(html, { runAt: at });

    let cmts = [];
    if (comments && detail.esno) {
      const total = detail.comment_count || 0;
      const pages = Math.min(Math.max(Math.ceil(total / 100), 1), 10);
      for (let cp = 1; cp <= pages; cp++) {
        const { items } = parseComments(await http.fetchComments(gallery, no, detail.esno, cp), detail.date);
        if (!items.length) break;
        cmts.push(...items);
      }
      const seen = new Set();
      cmts = cmts.filter((c) => !seen.has(c.no) && seen.add(c.no));
    }

    // 이미지 로컬 사본
    const localImages = [];
    if (images && detail.images.length) {
      const imgDir = path.join(dir, 'img');
      fs.mkdirSync(imgDir, { recursive: true });
      for (let i = 0; i < Math.min(detail.images.length, 20); i++) {
        const src = detail.images[i];
        try {
          const { buf, type } = await http.fetchBinary(src, http.viewUrl(gallery, no));
          const ext = EXT[type.split(';')[0].trim()] || '.bin';
          const name = String(i + 1).padStart(3, '0') + ext;
          fs.writeFileSync(path.join(imgDir, name), buf);
          localImages.push({ file: 'img/' + name, src, bytes: buf.length });
        } catch (e) {
          localImages.push({ file: null, src, error: e.message });
        }
      }
    }

    const snapshot = {
      no, gallery: this.galleryId, archived_at: at, gone: false,
      title: detail.title || base.title || '', headtext: detail.headtext || base.headtext || '',
      url: base.url || http.viewUrl(gallery, no),
      author: base.author || null,
      date: detail.date || base.date || null,
      views: detail.views ?? base.views ?? null,
      recommend: detail.recommend ?? base.recommend ?? null,
      comment_count: detail.comment_count ?? cmts.length,
      body_html: detail.body_html, body_text: detail.body_text,
      images: detail.images, local_images: localImages,
      comments: cmts,
    };
    fs.writeFileSync(path.join(dir, 'post.json'), JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
    return { ok: true, gone: false, snapshot };
  }

  /** 원문이 아직 살아있는지 확인만 한다 (본문은 다시 받지 않음) */
  async verify(http, gallery, no) {
    const snap = this.load(no);
    if (!snap) return { no, status: 'missing' };
    try {
      await http.fetchView(gallery, no);
      if (snap.gone) { snap.gone = false; delete snap.gone_at; this._write(no, snap); return { no, status: 'restored' }; }
      return { no, status: 'alive' };
    } catch (e) {
      if (e.gone) {
        if (!snap.gone) { snap.gone = true; snap.gone_at = new Date().toISOString(); this._write(no, snap); return { no, status: 'gone-now' }; }
        return { no, status: 'gone' };
      }
      return { no, status: 'error', message: e.message };
    }
  }

  _write(no, snap) {
    fs.writeFileSync(path.join(this.path(no), 'post.json'), JSON.stringify(snap, null, 2) + '\n', 'utf8');
  }
}
