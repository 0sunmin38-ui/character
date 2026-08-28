// 데이터 위치 결정.
//
// 기본은 코드 옆(dcgall/data)이지만, --data 나 DCGALL_DATA 로 다른 폴더를 가리킬 수 있다.
// 그래야 iCloud Drive 같은 동기화 폴더에 두고 여러 기기에서 같은 내용을 볼 수 있고,
// 코드를 갈아엎어도 사전과 수집물이 안전하다.
//
// 데이터 폴더 구조
//   config.json      수집 설정
//   taxonomy.json    분류 규칙
//   glossary.json    은어 사전
//   <갤러리ID>/      수집물·서재·보존본
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SEED = ['config.json', 'taxonomy.json', 'glossary.json'];
const POINTER = '.datadir';   // 한 번 정해두면 다음부터 옵션 없이 쓴다
let DATA = null;

// 기기마다 사용자명이 다를 수 있어 홈 아래 경로는 ~ 로 적어 둔다
const shrink = (p) => (p.startsWith(os.homedir() + path.sep) ? '~' + p.slice(os.homedir().length) : p);
const grow = (p) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);

function readPointer(codeRoot) {
  try {
    const raw = fs.readFileSync(path.join(codeRoot, POINTER), 'utf8').trim();
    const p = grow(raw);
    return p && fs.existsSync(p) ? p : null;
  } catch { return null; }
}

/** 실행 인자와 환경변수를 보고 데이터 폴더를 정한다. 없으면 만들고 기본 파일을 깔아준다. */
/**
 * 우선순위: --data > DCGALL_DATA > 기억해둔 위치(.datadir) > 코드 옆 data/
 * --data 로 새 위치를 주면 그 값을 기억해서 다음 실행부터 자동으로 쓴다.
 */
export function setDataDir(codeRoot, explicit) {
  const chosen = explicit || process.env.DCGALL_DATA || readPointer(codeRoot);
  DATA = path.resolve(grow(chosen || path.join(codeRoot, 'data')));
  fs.mkdirSync(DATA, { recursive: true });
  // 코드 옆 기본 위치를 쓸 때는 설정 파일을 옮기지 않는다.
  // 같은 파일이 두 곳에 생겨 어느 쪽을 고쳐야 하는지 헷갈리기 때문이다.
  if (!chosen) return DATA;
  if (explicit) {
    fs.writeFileSync(path.join(codeRoot, POINTER), shrink(DATA) + '\n', 'utf8');   // 위치 기억
  }
  for (const f of SEED) {
    const dst = path.join(DATA, f);
    const src = path.join(codeRoot, f);
    if (!fs.existsSync(dst) && fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      console.log(`  기본 ${f} 을 데이터 폴더에 만들었어요: ${dst}`);
    }
  }
  return DATA;
}

/** 데이터 폴더. setDataDir 를 안 불렀으면 코드 옆 data/ 를 쓴다. */
export function dataDir(codeRoot) {
  return DATA || path.join(codeRoot, 'data');
}

/** 설정·규칙·사전 파일 경로. 데이터 폴더에 있으면 그걸, 없으면 코드 쪽을 쓴다. */
export function confFile(codeRoot, name) {
  const inData = path.join(dataDir(codeRoot), name);
  return fs.existsSync(inData) ? inData : path.join(codeRoot, name);
}

/** --data 값을 인자 배열에서 뽑는다 */
export function dataArg(argv) {
  const i = argv.indexOf('--data');
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}
