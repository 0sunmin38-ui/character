# AIchatCollector

디시인사이드 갤러리를 주기적으로 수집해서, 갤러리 은어를 학습한 분류기로 나눠 보고,
필요한 글은 원문이 지워져도 남도록 통째로 보존해 두는 개인용 도구입니다.

**의존성 0개.** Node 18 이상만 있으면 됩니다.

```bash
git clone https://github.com/0sunmin38-ui/AIchatCollector.git
cd AIchatCollector
node crawl.mjs --job daily     # 수집
node serve.mjs                 # 뷰어 (수집 · 서재 · 사전)
```

기본 대상은 AI채팅 마이너 갤러리지만 `config.json` 의 `gallery.id` 만 바꾸면 다른 갤러리에도 씁니다.

### 화면

| 페이지 | 하는 일 |
|---|---|
| **수집** | 모아온 글을 훑고 거르고 분류를 고칩니다. 골라서 서재에 담습니다 |
| **서재** | 담아둔 글만. 본문·댓글·이미지를 로컬에 보존해서 **원문이 지워져도 남습니다** |
| **사전** | 갤러리 은어를 채굴·확정합니다. 확정하면 분류와 수집 키워드에 바로 반영됩니다 |

### 수집하는 사람에게

- 요청 간격 1.2초가 기본값입니다. **줄이지 마세요.**
- 수집한 글은 갤러리 이용자들이 쓴 것입니다. 개인 열람·분석 용도로만 쓰고 재배포하지 마세요.
- 작성자 고유 id 와 IP 조각은 **처음부터 저장하지 않습니다.**
- 공유가 필요하면 `node export.mjs --level meta|text|full` 로 식별정보를 뺀 사본을 만드세요.

---

# dcgall — AI채팅 갤러리 정기 수집 툴킷

의존성 없음. Node 18+ 내장 `fetch` 만 사용한다. (`node --version` ≥ 18)

```
AIchatCollector/
├─ config.json        수집 대상·주기 잡·속도 정의 (여기만 고치면 됨)
├─ crawl.mjs          ① 수집기   node crawl.mjs --job daily
├─ classify.mjs       ④ 분류 점검  node classify.mjs
├─ mine.mjs           ⑤ 은어 채굴  node mine.mjs
├─ archive.mjs        ⑥ 북마크·보존 node archive.mjs
├─ taxonomy.json      분류 규칙 (glossary 를 참조한다)
├─ glossary.json      은어 사전 — 용어·개념·조어패턴·미확인후보·기각어
├─ GLOSSARY.md        사전에서 자동 생성되는 문맥 브리핑 (사람·모델이 읽는 용)
├─ report.mjs         ③ 리포트   node report.mjs --open
├─ serve.mjs          편집 가능한 뷰어  node serve.mjs
├─ run.sh             크론 진입점  ./run.sh daily
├─ lib/
│  ├─ http.mjs        요청 계층 (헤더 고정·레이트리밋·재시도·차단 감지)
│  ├─ parse.mjs       HTML/JSON → 균일 레코드 (PARSER_VERSION 관리)
│  ├─ store.mjs       ② 저장 계층 (append-only JSONL + 병합 리더)
│  ├─ glossary.mjs    은어 사전 로더 (개념 확장·은어 탐지)
│  ├─ miner.mjs       채굴 로직 (CLI·서버 공용)
│  ├─ archive.mjs     원문 통째 보존 (본문·댓글·이미지)
│  ├─ bookmarks.mjs   북마크 저장소
│  ├─ library.mjs     내 서재 페이지 생성
│  ├─ classify.mjs    taxonomy.json 기반 채점 분류기
│  ├─ labels.mjs      수동 라벨 저장소 (자동 분류를 항상 덮어씀)
│  └─ render.mjs      리포트 HTML 생성 (report/serve 공용)
└─ data/<갤러리ID>/
   ├─ posts/YYYY-MM.jsonl   글 레코드 (수집할 때마다 한 줄씩 append)
   ├─ runs/<runId>.json     실행 매니페스트 (파라미터·집계·에러)
   ├─ labels.json           내가 손으로 고친 분류 (자동 분류보다 우선)
   ├─ bookmarks.json        내가 담은 글 (메모·태그)
   ├─ archive/<글번호>/      원문 보존본 — post.json · raw.html · img/
   │                        디시에서 글이 지워져도 여기 남는다
   ├─ state.json            커서 (마지막 글번호·누적 실행 수)
   └─ run.log               run.sh 실행 로그
```

## 1. 동일하게 페이지를 밟는 기반

모든 요청은 `lib/http.mjs` 한 곳을 통과한다 — 브라우저 UA·`Accept-Language: ko-KR`·Referer 고정,
요청 간 `1.2s + 무작위 0~0.6s` 간격, 5xx/429 는 지수 백오프로 3회 재시도, 차단 페이지는 예외로 감지.

*무엇을* 밟을지는 `config.json` 의 **job** 이 정한다. 같은 job 이름을 부르면 언제나 같은 경로를 같은 순서로 탄다.

| job | 하는 일 |
|---|---|
| `daily` | 전체글 최근 5p + 개념글 3p 목록, 개념글 중 상위 40건 본문·댓글 |
| `sweep` | 개념글 15p 깊게, 상위 120건 본문·댓글 |
| `watch` | 키워드 검색(`프롬프트`/`지침`/`제타`) 기반 수집 |

```bash
node crawl.mjs --job daily          # 정해진 잡 실행
node crawl.mjs --job daily --dry    # 저장 없이 미리보기
```

일회성 조회는 잡 없이 직접:

```bash
node crawl.mjs --mode recommend --pages 5 --detail --max-detail 20
node crawl.mjs --mode search --keyword 프롬프트 --pages 3 --detail
node crawl.mjs --mode all --pages 10 --min-recommend 20 --detail
```

주요 플래그: `--detail`/`--no-detail`, `--max-detail N`, `--min-recommend N`,
`--refresh`(이미 본문 받은 글 다시 받기), `--with-notice`, `--gallery <id>`(다른 갤러리), `--dry`.

## 2. 균일하게 저장하는 기반

글 하나 = 레코드 하나. **덮어쓰지 않고 append** 하며, 읽을 때 글번호 기준으로 병합한다
(최신 값이 이기되 **이미 받아둔 본문·댓글은 절대 잃지 않는다**). 그래서 같은 잡을 몇 번 돌려도 안전하고,
조회수·추천수의 변화 이력도 원본 JSONL 에 그대로 남는다.

```jsonc
{
  "schema": 1, "parser": 1, "gallery": "aichatting", "no": 374237,
  "url": "...", "title": "...", "headtext": "💬잡담", "type": "icon_recomtxt",
  "is_notice": false,
  "author": { "nick": "ㅇㅇ", "uid": "verse0724", "ip": "" },
  "date": "2026-08-26T19:39:23+09:00",      // KST 기준 ISO8601
  "views": 1340, "recommend": 56, "comment_count": 13,
  "from": ["recommend", "search:...:프롬프트"],  // 어떤 경로로 수집됐는지
  "first_seen_at": "...", "crawled_at": "...",
  "detail": { "title", "date", "views", "recommend", "body_html", "body_text", "images": [], "fetched_at" },
  "comments": [ { "no", "parent", "depth", "nick", "uid", "ip", "date", "text", "is_deleted" } ]
}
```

파서를 고칠 때는 `lib/parse.mjs` 의 `PARSER_VERSION` 을 올린다 — 어떤 파서로 뽑은 레코드인지 나중에 구분된다.

## 3. 볼 수 있는 HTML

```bash
node report.mjs --open        # out/index.html 생성 후 열기
node report.mjs --days 30 --top 500
node report.mjs --days 0      # 기간 제한 없이 전체
```

데이터가 파일 안에 들어간 **단일 HTML** 이라 서버 없이 `file://` 로 열린다.
분류 칩으로 필터, 제목·본문·댓글 통합 검색(`/` 로 검색창 포커스), 최신/추천/조회/댓글/분류점수순 정렬,
수집 경로 필터, 추천 하한, `본문만`·`애매만`·`수정함만` 토글, 제목 클릭 시 본문+이미지+댓글+분류근거 펼치기,
글마다 분류 드롭다운으로 직접 수정, 다크모드 자동 대응.

분류를 손볼 거면 파일보다 서버 모드가 낫다 (수정이 디스크에 바로 남음):

```bash
node serve.mjs --days 0        # 전체 기간, http://127.0.0.1:8787
```

## 4. 분류

키워드 단순 매칭으로는 안 갈라진다 — 갤러리 제목 800여 건에서 실제 어휘를 뽑아
**신호 종류별 가중 채점 + 맥락 필수조건**으로 나눈다. 사전은 전부 `taxonomy.json` 에 있고, 거기만 고치면 된다.

| 분류 | 정의 | 결정적 신호 |
|---|---|---|
| 🧩 위젯·상태창 | 매턴 변화를 기록하는 상태창/트래커, 서비스 위젯 코드·링크 | `[위젯]` `상태창` `트래커` `삼태창` |
| 🎭 OOC | 진행과 무관한 상황을 상정해 캐릭터 반응을 유도하는 번외 롤플 | `[OOC]` `ㅇㅇㄷ` `번외` |
| 📐 지침 | 출력 조정 — 문체·글자수·금지어. 제작 프롬프트나 유저노트에 기입 | `지침` `문체` `글자수` `출력량` `유저노트` |
| 🖼️ 이미지 프롬프트 | 동일 구도·의복·장면 재현용 생성 프롬프트 | `구도` `의상` `포즈` `장면` `캐이미지` |
| 🎨 그깎·작태 | 그림체 고정을 위한 작가태그·그깎 결과물 | `그깎` `작태` `그림체` `화풍` |
| 🛠️ 도구·확프 | 확장프로그램·북마클릿·추출기 | `[확프]` `북마클릿` `추출기` |
| 📢 캐릭터 홍보 | 제작 캐릭터 홍보 (다른 분류 오염 방지용 격리) | `[케]` `[케덕/…]` 말머리 `📢홍보` |

가장 어려운 지점은 **"프롬프트"가 텍스트 지침용과 이미지 생성용으로 완전히 겹쳐 쓰인다**는 것이다
(`1인 프롬프트 10개 공유` = 지침, `[프롬] NAI V5 그림체 5개` = 그깎). 그래서 단어 하나로는 절대 확정하지 않고,
`require`(맥락 필수조건)를 건다 — 이미지 프롬프트는 `구도/의상/포즈/일러/nai…` 중 하나가 같이 나와야만 후보가 되고,
그깎은 `그깎/작태/그림체/화풍/에셋…` 계열이 있어야만 후보가 된다. 여기서 안 갈라지는 건 **애매**로 표시되어
뷰어의 `애매만` 버튼으로 몰아서 검토할 수 있다.

```bash
node classify.mjs                    # 분포 요약
node classify.mjs --show guide       # 그 분류로 잡힌 제목들 검수
node classify.mjs --show ambiguous   # 애매한 것만 몰아보기
node classify.mjs --explain 373405   # 한 글의 점수 내역과 근거
node classify.mjs --set 373405 guide # CLI 로 수동 지정 ('-' 로 해제)
```

### 내가 직접 고치기

자동 분류는 **제안일 뿐이고 수동 라벨이 언제나 이긴다.** 뷰어의 각 글 왼쪽 드롭다운으로 바꾸면 된다.

```bash
node serve.mjs        # 수집 페이지 http://127.0.0.1:8787
                             # 내 서재   http://127.0.0.1:8787/library
```

서버 모드가 아니라 `out/index.html` 을 그냥 열어서 고쳤다면 브라우저에 임시 저장되고,
`내보내기` 버튼으로 받은 파일을 병합하면 확정된다.

```bash
node classify.mjs --import ~/Downloads/labels.json
```

`labels.json` 은 크롤링·리포트 재생성과 완전히 분리돼 있어서, 몇 번을 다시 긁어도 손으로 고친 분류는 유지된다.
같은 실수가 반복되면 그때 `taxonomy.json` 에 단어를 추가하는 게 근본 해결이다.

## 5. 은어 사전 — 쌓을수록 분류가 좋아지는 구조

`glossary.json` 이 분류기의 1급 입력이다. taxonomy 는 낱말을 직접 쓰지 않고 **개념 묶음**을 참조한다:

```jsonc
// taxonomy.json
"titleStrong": { "w": 7, "terms": ["@개념:statusboard"] }
// glossary.json 의 statusboard 묶음 = 상태창 / 위젯 / 트래커 / 삼태창 …
```

그래서 새 플랫폼이 나와 그 플랫폼의 상태창 이름을 사전에 한 줄 추가하면, taxonomy 는 손대지 않아도 분류가 따라온다.

사전이 담는 것:

| 항목 | 내용 |
|---|---|
| `terms` | 확정 은어. `type`(platform/model/concept/artifact/role/action/meta) · `canon` · `gloss` · `aliases` · `concept` |
| `concepts` | 플랫폼마다 이름만 다른 같은 개념 묶음. **상태창 = 케덕의 위젯 = 롶의 트래커** 처럼 |
| `patterns` | 낱말이 아닌 조어 규칙. `젬이오`=Gemini 2.5, `5푸스`=Opus 5, `소넷3.6` — 새 버전이 나와도 자동으로 잡힌다 |
| `candidates` | 채굴기가 찾은 미확인 후보 |
| `stopwords` | 내가 기각한 말. 다시는 후보에 오르지 않는다 |

### 채굴 — 빈도가 아니라 특이도로

단순 빈도로 뽑으면 `캐릭터`·`채팅` 같은 일반어가 상위를 다 먹는다. 그래서 이렇게 점수를 매긴다:

1. **태그 자리** (`[케/팊/엘]` 처럼 대괄호 안) — 거의 확실한 고유어. 가중치 최대
2. **형제 단서** — 같은 태그 묶음에 아는 플랫폼이 있으면 이것도 같은 종류다. `[유니/움/엘]` → `움`은 플랫폼
3. **슬롯 위치** — 단, `[케덕/진도오]` 의 뒷칸은 플랫폼이 아니라 **그 플랫폼의 캐릭터 이름**이라 감점
4. **제목 등장** — 제목은 군더더기가 없어 은어 밀도가 높다
5. **본문 편재율** — 본문 곳곳에 고르게 퍼진 말은 일반어이므로 감점

```bash
node mine.mjs                     # 채굴 + 상위 후보 출력
node mine.mjs --min 3 --n 60      # 최소 등장 글 수 / 출력 개수
node mine.mjs --promote 움 --type platform --gloss "캐릭터챗 플랫폼"
node mine.mjs --reject 핑크        # 영구 제외
node mine.mjs --brief             # GLOSSARY.md 갱신
```

뷰어 `사전` 버튼을 누르면 후보 목록이 나온다. **`지금 채굴` 버튼으로 웹에서 바로 채굴할 수 있고**,
뜻을 달아 `확정` 하거나 `기각` 하면 곧바로 `glossary.json` 에 쓰인다.
**확정한 은어는 다음 분류부터 즉시 반영되고, 기각한 말은 다시는 후보에 오르지 않는다.** 쓸수록 정확해진다.

`GLOSSARY.md` 는 이 사전에서 자동 생성되는 문맥 브리핑이다 — 다음 세션에 이 갤러리 얘기를 할 때 이 파일만 읽으면 문맥이 잡힌다.

## 6. 수집 페이지와 내 서재

두 페이지는 목적이 다르다.

| | 수집 페이지 `/` | 내 서재 `/library` |
|---|---|---|
| 담긴 것 | 긁어온 전부 (안 궁금한 것 포함) | **내가 담은 것만** |
| 읽는 곳 | 크롤 데이터 (`posts/*.jsonl`) | **아카이브** (`archive/<번호>/`) |
| 원문 삭제 시 | 사라짐 | **그대로 남음** |
| 하는 일 | 훑고 걸러내기, 분류 교정, 은어 채굴 | 모아둔 것 읽기, 메모·태그 |

용어는 하나로 통일했다 — 담는 곳은 **서재**, 동작은 **서재에 담기 / 서재에서 빼기**, 표시는 ★.
수집 페이지에서 ★ 를 누르는 순간 그 글의 **본문·댓글·이미지를 전부 로컬로 떠온다.**
디시 본문도 이미지 서버도 언젠가 죽기 때문에, 링크만 저장하는 건 보존이 아니다.

```
data/aichatting/archive/373405/
  post.json    파싱된 스냅샷 (본문·댓글·메타·보존시각)
  raw.html     원본 HTML 그대로 — 파서를 고쳐도 다시 뽑을 수 있다
  img/001.png  본문 이미지 로컬 사본
```

### 여러 건 한꺼번에

체크박스로 골라서 일괄 처리한다. **shift+클릭으로 범위 선택**, `보이는 것 전체` 로 현재 필터 결과 전부 선택.

| 수집 페이지 | 내 서재 |
|---|---|
| ★ 서재에 담기 (보존까지) · 분류 일괄 변경 | 태그 일괄 추가 · 분류 일괄 변경 · 서재에서 빼기 |

### 화면 구성

상단은 성격이 다른 것을 섞지 않고 존으로 나눴다.

```
┌ 브랜드 / [수집][내 서재] 탭 ······················ [은어 사전][분류 내보내기] ┐  도구·이동
├ ⌕ 검색 ····························· [정렬▾][수집경로▾][추천▾] ┤  검색·정렬
├ 보기  [본문 있음][분류 애매][내가 수정][서재에 담김] ········· 811건 ┤  부분집합 토글
└ 분류  ‹ [전체][🧩위젯][🎭OOC][📐지침][🎨그깎]… ›              ┘  분류 탭(가로 스크롤)
```

- **이동**은 탭, **도구/행동**은 버튼, **검색·정렬**은 입력·드롭다운, **부분집합 토글**은 세그먼트 컨트롤 — 종류가 같으면 생김새도 같다
- 분류 탭은 화면이 좁아도 **절대 2줄로 넘어가지 않는다.** 좌우 화살표·가장자리 페이드·세로휠 가로스크롤로 처리

필터를 먼저 걸고 `보이는 것 전체` 를 누르는 게 핵심 사용법이다.
예: `📐 지침` 칩 + `추천 20+` → 전체 선택 → 서재에 담기.

보존은 글당 본문·댓글·이미지 요청이 붙어 **5초쯤** 걸리므로, 일괄 담기는 **북마크만 즉시 등록하고
보존은 백그라운드 큐**로 돌린다. 상단 바에 진행률이 뜨고 `중단` 으로 멈출 수 있다.
탭을 닫아도 서버가 계속 처리하고, 중간에 끊겼으면 `node archive.mjs --sync` 로 마저 받는다.

서재에서 할 수 있는 것: **분류별 필터**(수집 페이지와 같은 분류 체계), 내가 붙인 **태그별 필터**,
글마다 **메모**, 본문·댓글·메모 통합 검색, `원문 삭제됨` 만 모아보기.

### 원문이 지워져도 남는다

`--verify` 가 원문 생존을 확인해 `gone` 을 표시한다 (디시는 삭제된 글에 404 를 준다).
지워진 글은 서재에서 붉은 테두리와 `원문 삭제됨` 배지가 붙고 원문 링크가 감춰지지만,
**본문·댓글·이미지는 그대로 읽힌다.**

```bash
node archive.mjs                 # 현황 (북마크·아카이브 용량·삭제된 글 수)
node archive.mjs --add 373405 --note "글자수 지침 참고" --tags 지침,참고   # 서재에 담기
node archive.mjs --sync          # 북마크됐는데 아직 안 떠온 것 전부 보존
node archive.mjs --verify        # 원문 생존 확인
node archive.mjs --rm 373405     # 북마크 해제 (보존 파일은 남는다)
node archive.mjs --prune --yes   # 북마크 없는 아카이브 정리
```

북마크를 빼도 보존 파일은 일부러 남긴다 — 실수로 뺐을 때 원문이 이미 지워져 있으면 복구가 불가능하기 때문이다.

## 정기 실행

```bash
./run.sh daily     # 수집 → 채굴 → 브리핑 → 북마크 보존 → 원문 생존확인 → 리포트
```

crontab 예시 — 매일 오전 8시 daily, 일요일 새벽 4시 sweep:

```cron
0 8 * * *  ./run.sh daily
0 4 * * 0  cd /Users/minnoh/Documents/gitsource/character && ./run.sh sweep
```

`PATH` 에 node 가 없을 수 있으니 crontab 상단에 `PATH=/usr/local/bin:/usr/bin:/bin:$HOME/.nvm/versions/node/<버전>/bin` 를 넣어둘 것.

## 데이터를 다른 폴더에 두기 (여러 대에서 같은 내용 보기)

기본은 `data/` 지만, `--data` 로 어디든 가리킬 수 있다.
iCloud Drive 같은 동기화 폴더에 두면 **맥북 두 대가 같은 수집물과 서재를 본다.**

```bash
# 처음 한 번만 위치를 알려준다. 그 값이 .datadir 에 기억된다.
node classify.mjs --data ~/Library/Mobile\ Documents/com~apple~CloudDocs/dcgall

# 이후로는 옵션 없이 그냥 쓴다
node serve.mjs
```

우선순위는 `--data` > `DCGALL_DATA` > 기억해둔 위치(`.datadir`) > 코드 옆 `data/`.
`.datadir` 은 기기마다 경로가 달라서 git 에 올리지 않는다.
새 맥에서는 클론한 뒤 위 첫 줄만 한 번 실행하면 된다.
지정한 폴더에 `config.json` · `taxonomy.json` · `glossary.json` 이 없으면 기본값을 깔아준다.
**코드 옆 기본 위치를 쓸 때는 복사하지 않는다** (같은 파일이 두 곳에 생기면 헷갈리므로).

동기화 폴더에 담기는 것:

```
<동기화폴더>/
  config.json  taxonomy.json  glossary.json
  <갤러리ID>/
    posts/     수집 로그
    archive/   서재 보존본 (원문이 지워져도 남는 것)
    runs/      실행 기록
    bookmarks.json  labels.json  state.json
```

두 대에서 **동시에** 쓰지 말 것. 동기화가 끝난 뒤 다른 쪽을 켜야 충돌이 없다.

## 공개용 내보내기

원본 `data/` 에는 타인의 글과 닉네임·uid·댓글 IP 조각이 들어 있어 그대로 공개하면 안 된다.
공유가 필요하면 식별정보를 떼어낸 사본을 만든다. 원본은 건드리지 않는다.

```bash
node export.mjs --level meta   # 제목·날짜·지표·분류만
node export.mjs --level text   # + 본문·댓글 (식별정보는 제거)
```

어느 단계에서도 **닉네임·uid·IP·이미지·원본 HTML 은 나가지 않는다.**
결과물 옆에 무엇을 얼마나 제거했는지 적은 README 가 같이 생성된다.

## 주의

- 수집한 본문·댓글은 갤러리 이용자들이 쓴 글이다. 개인 열람·분석 용도로만 쓰고 재배포하지 말 것.
- `config.json` 의 `http.delayMs` 를 1000 미만으로 내리지 말 것 (차단 위험).
- 디시가 마크업을 바꾸면 목록 건수가 0으로 떨어진다. 그때는 `lib/parse.mjs` 의 정규식만 손보면 된다.
