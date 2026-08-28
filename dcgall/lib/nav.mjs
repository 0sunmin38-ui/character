// 세 페이지가 공유하는 GNB. 어느 페이지에서든 형태가 같아야 하므로 한 곳에서 만든다.
export const PAGES = [
  { key: 'collect', label: '수집',      href: { server: '/',         file: 'index.html' } },
  { key: 'library', label: '서재',      href: { server: '/library',  file: 'library.html' } },
  { key: 'glossary', label: '사전',      href: { server: '/glossary', file: 'glossary.html' } },
];

export function navHtml(active, server) {
  return PAGES.map((p) =>
    `<a href="${server ? p.href.server : p.href.file}"${p.key === active ? ' class="active"' : ''}>${p.label}</a>`
  ).join('\n      ');
}

/** GNB 한 줄. actions 는 페이지별 추가 기능 버튼. */
export function gnbHtml(active, server, actions = '') {
  return `<div class="hdr-top">
    <div class="brand"><b id="h1">갤수집기</b><span id="sub"></span></div>
    <nav class="nav">
      ${navHtml(active, server)}
    </nav>
    <div class="hdr-actions">
      ${actions}
      <button class="disclose" id="toolsBtn" aria-label="검색·필터 펼치기" title="검색·필터 펼치기"><i></i></button>
    </div>
  </div>`;
}
