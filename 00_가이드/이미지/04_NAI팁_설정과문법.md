> `[정리]` **원문에서 뽑아 재구성: 값·문구는 원문 것** · 근거: 디시 AI채팅 갤러리 #206486 (원문 전재 아님 · 설정값·문법만 추림)
# AI 그림의 거의 모든 것 1.1 (V4.5 Full): 참고 정리

> 원문: https://gall.dcinside.com/mgallery/board/view/?id=aichatting&no=206486
> NAI V4.5 Full 기준 장문 정보글. `00_가이드/이미지/02-2`가 퀄리티 프롬프트 출처로 인용.
> 원문의 설명 대신, 반복해서 찾아보게 되는 **설정값·문법·태그 어휘**만 추려 재구성했습니다.
> 서술이나 배경 설명이 필요하면 원문을 보세요.

---

## 1. 기본 설정값

| 항목 | 추천 | 메모 |
|---|---|---|
| Steps | 28 | 높을수록 선명, 과하면 색이 진해짐 |
| Prompt Guidance (CPG) | 5~7 | 프롬프트 반영 강도 |
| Seed | - | 고정 후 프롬프트만 바꾸면 구도 유지한 바리에이션 |
| Variety+ | 선택 | 초기 개입을 늦춰 자세·구도 다양화 |

**CPG 조절 기준: 출처별 척도가 다르다. 둘 다 참고값으로만 본다.**

| | 낮음 | 중간 | 높음 |
|---|---|---|---|
| 이 글 | 3~4 · 부드럽고 몽환적, AI 창의성 개입 | 5~7 (추천) | 8~10+ · 색이 쨍하고 명암 과다("튀겨짐") |
| `00_가이드/이미지/05_NAI팁_프롬프팅과기능.md` §4 | 2~6 · 창의적 자유 | 7~14 · 충실 + 자유도 | 15+ · 뻣뻣해지고 과포화(deepfried) |

- 너무 쨍하다 → CPG를 낮춤
- 말을 안 듣는다 → CPG를 올림
- Seed 고정 후 0.1 단위 미세 조절 → `00_가이드/이미지/05_NAI팁_프롬프팅과기능.md` §4

공식 문서: https://docs.novelai.net/en/image

---

## 2. 가중치 문법 (NAI 기준)

`{}`, `[]`는 쓰지 말고 숫자 가중치를 사용.

| 문법 | 형식 | 예시 |
|---|---|---|
| 가중치 | `숫자::태그::` | `1.2::hat::`: 모자 1.2배 강조 |
| 음수 가중치 (제거) | `-숫자::태그::` | `-1::hat::`: 모자만 제거 |
| 음수 가중치 (반전) | `-숫자::태그::` | `-1::monochrome::`: 흑백의 반대, 색감 부여 |

- **주의:** 태그 끝이 숫자면 한 칸 띄어야 함 → `1.2::1girl ::`
- 음수 가중치는 네거티브 프롬프트와 다른 기능. 특정 요소만 핀셋으로 뺄 때 사용

> **이어서 볼 것**: 음수 가중치의 활용 예시(`-1.5::simple background::` 등)와
> 다중 인물 `Add Character`·액션 태그(`source#`/`target#`/`mutual#`)는
> `00_가이드/이미지/05_NAI팁_프롬프팅과기능.md` §2·§6 에 자세히 있다. 여기서는 문법만 다룬다.

---

## 3. 태그 배치 순서

> **정본은 `02_템플릿/이미지/01_기본출력_구조_템플릿.md` 의 26슬롯이다.**
> 아래와 `00_가이드/이미지/05_NAI팁_프롬프팅과기능.md` §2 의 권장 순서는 서로 다르다. 참고값으로만 본다.

```
NAI   : [Frame] → [Creator] → [Setting] → [Style]
로컬  : [Frame] → [Setting] → [캐릭터] → [Creator] → [Style]
```

| 블록 | 넣는 것 |
|---|---|
| Frame | 인원수(`1girl`, `2boys`), 프레이밍(`upper body`, `cowboy shot`), 앵글(`from above`, `dutch angle`) |
| Setting | 장소(`classroom`, `beach`), 광원(`sunlight`, `backlight`), 이펙트(`depth of field`, `lens flare`) |
| Creator | 작가(`artist:name`), 연도(`year 2024`, `year 2025`) |
| Render | 원작(`official art`), 스타일(`anime coloring`), 퀄리티(`masterpiece`, `highres`) |
| Basic | 캐릭터명, 시선(`looking at viewer`) |
| Context | 직업·종족(`knight`, `elf`), 처한 상황(`fighting`, `restrained`) |
| Action | 자세(`standing`), 행동(`holding sword`), 감정(`smile`, `blush`) |
| Appearance | 얼굴 / 머리카락 / 상체 / 하체 / 신체상태(`wet`, `sweating`) |
| Outfit | 장르 · 소재 · 구조 · 상의 · 겉옷 · 하의 |
| Accessories | 머리·목 / 팔·허리 / 다리·가방 |
| Finish | 신발 |

---

## 4. 구도 어휘

### 샷 종류

| 태그 | 범위 |
|---|---|
| `extreme close-up` | 눈·입 등 극단적 확대 |
| `close-up` | 얼굴 위주 |
| `bust shot` | 가슴 윗부분부터 |
| `portrait` | 초상화 구도 |
| `upper body` | 허리 위 |
| `cowboy shot` | 무릎 위·허벅지 |
| `full body` | 전신 |
| `long shot` / `wide shot` | 인물 작게, 배경 넓게 |

### 카메라 앵글

| 태그 | 시점 |
|---|---|
| `eye-level shot` | 눈높이 |
| `high angle` / `from above` | 위에서 아래로 |
| `bird's-eye view` | 수직으로 내려다봄 |
| `low angle` / `from below` | 아래에서 위로 |
| `worm's-eye view` | 바닥에서 올려다봄 |
| `dutch angle` | 비스듬히 기울임 |
| `profile` | 옆모습 |

---

## 5. 퀄리티 / 네거티브 태그 갈래

**실제로 쓸 조합은 `03_프롬프트/이미지/스타일프리셋/` 에 Q1~Q6 · N1~N7 로 정리돼 있다.**
여기는 그 조합을 손볼 때 참고하는 **갈래별 어휘**만 남긴다.

**퀄리티**
- 기본 품질: `masterpiece, best quality, amazing quality, very aesthetic, best illustration, novel illustration`
- 해상도·디테일: `highres, absurdres, incredibly absurdres, ultra-detailed, intricate details`
- 스타일 제어: `solo artist`, `artist collaboration` (음수 가중치나 네거티브로 활용)

**네거티브**
- 품질 저하: `worst quality, bad quality, low quality, lowres, blurry, jpeg artifacts, scan artifacts, dithering, halftone, screentones, film grain, chromatic aberration`
- 불필요 요소: `text, logo, watermark, signature, artist name, blank page`
- 신체·구도 오류: `bad anatomy, mutation, deformed, distorted, disfigured, bad hands, extra digits, fewer digits, bad face, mob face, bad eyes, bad proportions, amputee, bad perspective`

> **이어서 볼 것**: 품질/미학/연도/매체 태그의 뜻과 `Add Quality Tags` 토글, 네거티브 프리셋(Light·Heavy),
> `freckles`를 자연스럽게 만드는 응용 등은 `00_가이드/이미지/05_NAI팁_프롬프팅과기능.md` §2·§3 에 있다.
> 매체·아트스타일·색상·효과 태그의 개별 뜻은 `01_자료/이미지/1-스타일태그.csv`.

---

## 6. 작가 태그 표기 주의

이름이 두 갈래로 나오는 작가(`alexi (tits!)` 형태)는 괄호까지 포함해
`artist: alexi (tits!)` 로 통째로 써야 합니다.

> 작가 태그 검색·브라우징 사이트 목록은 `01_자료/이미지/0-참고링크.csv` 한 곳에 모아뒀다.

---

## 7. 자주 겪는 문제

| 증상 | 대응 |
|---|---|
| 안 부른 캐릭터가 하나 더 생김 | 네거티브에 `multiple girls, extra girls`, `1girl, solo, solo focus` 가중치 상향 |
| 인물이 너무 크게 나옴 | `far away`, `full body` 추가 후 가중치 상향 |
| 세로 그림에 배경을 넓게 | `wide angle lens`, `zoom out`, `from below` 강하게 |

**비율별 성향**: 세로(2:3~9:16)는 캐릭터·의상 디테일, 가로(3:2~16:9)는 분위기·배경 연출, 정사각은 무난.

---

## 8. 캐릭터 시트 / 레퍼런스

**Character Reference**는 이미지 속 캐릭터의 체형·얼굴·의상 전반을 참조하므로, 단순 배경에 여러 시점이 담긴 턴어라운드 시트를 쓰는 게 좋습니다. 참조 이미지와 태그가 어긋나면(체형·성별 등) 결과가 불안정해지므로 Fidelity·StyleAware로 조정합니다.

> **이어서 볼 것**: Vibe Transfer(Reference Strength · Information Extracted)와
> img2img·Inpaint·Canvas는 `00_가이드/이미지/05_NAI팁_프롬프팅과기능.md` §7 에 있다.
>
> 시트를 실제로 뽑는 4단계 프롬프트는 `02_템플릿/이미지/01_기본출력_구조_템플릿.md` 로 옮겼다.

---

## 원문 목차

0 그림체란 · 1 기본 설정 · 2 바이브 트랜스퍼/캐릭터 레퍼런스 · 3 작가 태그 ·
4 드로잉 스타일 · 5 구도/시점 · 6 퀄리티·네거티브 · 7 잡다한 팁 · 8 마치며

원문 7장에는 위에 옮기지 않은 항목이 더 있습니다. 체형 이론과 남녀 체형 태그, NSFW 등급 제어(`rating` 태그, censored/uncensored), 상호작용 태그, 텍스트 렌더링, 캐릭터 유지(i2i) 등. 필요할 때 원문에서 해당 절을 펼쳐 보세요.
