#!/usr/bin/env node
// dcgall 수집기 — 매 실행이 동일한 경로를 밟도록 job/target 으로만 동작한다.
//   node dcgall/crawl.mjs --job daily
//   node dcgall/crawl.mjs --mode recommend --pages 5 --detail
//   node dcgall/crawl.mjs --mode search --keyword 프롬프트 --pages 3 --detail
//   node dcgall/crawl.mjs --job daily --dry        (저장하지 않고 미리보기)
// 실제 수집 로직은 lib/crawler.mjs 에 있고 뷰어의 '수집' 버튼과 공유한다.
import fs from 'node:fs';
import path from 'node:path';
import { setDataDir, dataArg, confFile } from './lib/paths.mjs';
import { fileURLToPath } from 'node:url';
import { runCrawl } from './lib/crawler.mjs';
import { Glossary } from './lib/glossary.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const [k, v] = t.slice(2).split('=');
      if (v !== undefined) a[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) a[k] = argv[++i];
      else a[k] = true;
    } else a._.push(t);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
setDataDir(ROOT, args.data && args.data !== true ? String(args.data) : null);
const cfg = JSON.parse(fs.readFileSync(confFile(ROOT, 'config.json'), 'utf8'));

const jobName = args.job || (args.mode ? null : 'daily');
if (jobName && !cfg.jobs[jobName]) {
  console.error(`알 수 없는 job: ${jobName} (사용 가능: ${Object.keys(cfg.jobs).join(', ')})`);
  process.exit(1);
}

const opts = {
  gallery: args.gallery,
  job: jobName,
  targets: jobName ? null : [{ mode: args.mode || 'all', pages: Number(args.pages || 3), keyword: args.keyword, searchType: args.searchType }],
  detail: args['no-detail'] ? false : (args.detail === true || args.detail === 'true' ? true : undefined),
  onlyRecommend: args['only-recommend'] !== undefined ? args['only-recommend'] !== 'false' : undefined,
  maxDetail: args['max-detail'],
  minRecommend: args['min-recommend'],
  comments: args['no-comments'] ? false : undefined,
  refresh: !!args.refresh,
  withNotice: !!args['with-notice'],
  dry: !!args.dry,
  source: 'cli',
  glossary: new Glossary(ROOT),
};

const r = await runCrawl(ROOT, cfg, opts, ({ phase, done, total, label }) => {
  process.stdout.write(`\r  [${phase === 'list' ? '목록' : '본문'}] ${done + 1}/${total} ${label.padEnd(40).slice(0, 40)}`);
}, () => false);

process.stdout.write('\r' + ' '.repeat(70) + '\r');
for (const l of r.logs) console.log('  ' + l);
const m = r.manifest;
console.log(`\n▶ run ${m.run_id} · 수집 ${r.records} (신규 ${r.newCount}) · 본문 ${r.detailDone} · 요청 ${m.http.requests} · 에러 ${r.errors.length}`);
if (opts.dry) console.log('  [dry-run] 저장하지 않았습니다.');
else console.log(`  저장: dcgall/data/${m.gallery.id}/  ·  리포트: node dcgall/report.mjs`);
