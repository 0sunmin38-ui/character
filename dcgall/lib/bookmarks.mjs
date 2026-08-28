// 북마크 저장소 — 내가 보려고 골라둔 글. 수집 데이터와 완전히 분리돼 있다.
import fs from 'node:fs';
import path from 'node:path';

export class Bookmarks {
  constructor(root, galleryId) {
    this.file = path.join(root, 'data', galleryId, 'bookmarks.json');
    this.data = this.read();
  }
  read() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch { return { version: 1, updated_at: null, items: {} }; }
  }
  get(no) { return this.data.items[String(no)] || null; }
  has(no) { return !!this.data.items[String(no)]; }
  list() { return Object.entries(this.data.items).map(([no, v]) => ({ no: Number(no), ...v })); }

  add(no, { note = '', tags = [], archived = false } = {}) {
    const k = String(no);
    const cur = this.data.items[k];
    this.data.items[k] = {
      at: cur?.at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      note: note !== undefined ? note : (cur?.note || ''),
      tags: tags.length ? tags : (cur?.tags || []),
      archived: archived || cur?.archived || false,
    };
    return this.data.items[k];
  }
  remove(no) { delete this.data.items[String(no)]; return this; }
  markArchived(no, ok = true) { const it = this.data.items[String(no)]; if (it) it.archived = ok; return this; }

  save() {
    this.data.updated_at = new Date().toISOString();
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2) + '\n', 'utf8');
    return this;
  }
  get count() { return Object.keys(this.data.items).length; }
}
