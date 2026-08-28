// 수동 라벨 저장소 — 자동 분류를 덮어쓴다. 뷰어/CLI 양쪽에서 같은 파일을 쓴다.
import fs from 'node:fs';
import path from 'node:path';

export class Labels {
  constructor(root, galleryId) {
    this.file = path.join(root, 'data', galleryId, 'labels.json');
    this.data = this.read();
  }
  read() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch { return { version: 1, updated_at: null, manual: {} }; }
  }
  get(no) { return this.data.manual[String(no)] || null; }
  set(no, category, by = 'cli') {
    if (category === null) delete this.data.manual[String(no)];
    else this.data.manual[String(no)] = { category, by, at: new Date().toISOString() };
    return this;
  }
  merge(incoming = {}) {
    let n = 0;
    for (const [no, v] of Object.entries(incoming)) {
      if (!v || !v.category) { delete this.data.manual[no]; n++; continue; }
      const cur = this.data.manual[no];
      if (!cur || (v.at || '') >= (cur.at || '')) { this.data.manual[no] = v; n++; }
    }
    return n;
  }
  save() {
    this.data.updated_at = new Date().toISOString();
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2) + '\n', 'utf8');
    return this;
  }
  get count() { return Object.keys(this.data.manual).length; }
}
