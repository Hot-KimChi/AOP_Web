---
name: web-design-review
description: '프론트엔드 UI를 디자인 시스템·WCAG 2.2 AA 접근성·반응형·인터랙션 상태·다크 테마 기준으로 감사하고 안전한 개선안을 D-ID로 산출한다. "디자인 리뷰", "UI 개선", "접근성 점검", "다크모드 깨짐", "웹디자인 감사" 요청 시 사용.'
---

# Web Design Review

AOP_Web 프론트엔드(Next.js 15 + Bootstrap + CSS 변수 테마)의 UI 품질을 **측정 가능한 기준**으로 감사한다.
코드 규칙은 `frontend/AGENTS.md`가 우선한다. 기능·API·인증 동작은 범위 밖이다.

## 절차

1. `frontend/src/globals.css`의 `:root`·`[data-theme="dark"]` 토큰을 먼저 읽고 토큰 표를 만든다.
2. 아래 체크리스트를 순서대로 판정한다(grep으로 위반 후보 수집 → 해당 라인 확인).
3. 결함마다 `D-ID | 심각도 | 파일:라인 | 문제 | 수정안`을 작성한다. 수정안은 CSS 변수를 사용한다.
4. 구현 후 `npm run build`와 라이트/다크 양쪽 화면을 확인한다(가능하면 Playwright MCP 스냅샷).

## 체크리스트

| # | 항목 | 기준 | 위반 후보 수집 |
|---|------|------|----------------|
| 1 | 텍스트 대비 | 본문 4.5:1, 큰 글씨·UI 경계·포커스 링 3:1 (라이트·다크 모두, 실제 HEX로 계산. 반투명·`opacity`는 합성 후 계산) | 토큰 표의 전경/배경 조합 |
| 2 | 포커스 표시 | 모든 인터랙티브 요소에 `:focus-visible` 실선 윤곽선. `outline: none` 단독 사용 금지 | `outline: *none`, `outline: 'none'` |
| 3 | 키보드 조작 | 클릭 가능한 `div`/`tr`은 `role` + `tabIndex={0}` + Enter/Space 처리, 또는 `<button>` 사용. 닫힌 메뉴의 링크는 탭 순서에서 제외 | `<div[^>]*onClick` |
| 4 | 접근 가능한 이름 | 아이콘 전용 버튼·링크에 `aria-label`(`title`만으로는 불충분), 장식 아이콘은 `aria-hidden` | 텍스트 없는 `<button` |
| 5 | 모션 | `prefers-reduced-motion: reduce`에서 애니메이션·트랜지션 최소화 | `animation`, `transition` |
| 6 | 토큰 일관성 | 하드코딩 색(`#hex`, `rgb(`, `white`)·radius·shadow 금지 — 차트 팔레트는 `isDark` 팩토리 허용 | `#[0-9a-fA-F]{3,8}`, `rgba(` (globals.css 토큰 정의부 제외) |
| 7 | 상태 표시 | 로딩·빈 결과·오류·비활성·선택 상태가 색 외 수단(텍스트·아이콘·테두리)으로도 구분 | 페이지별 fetch 처리부 |
| 8 | 반응형 | 넓은 표는 `overflow: auto` 래퍼, 320px에서 내비 붕괴 없음, 터치 대상 ≥ 24px | `<table` 주변 래퍼 |
| 9 | 다크 테마 | `[data-theme="dark"]` 선택자만, 새 토큰은 양쪽 정의, Bootstrap 오버라이드 `!important` | `\.dark` |

## 심각도

- **Blocker**: 기능 파손, 텍스트가 읽히지 않음(대비 < 3:1), 핵심 기능을 키보드로 조작 불가
- **Major**: AA 미달(3:1~4.5:1), 포커스 표시 누락, 아이콘 버튼 이름 없음, 다크 모드에서 하드코딩 색으로 깨짐
- **Minor**: 간격·정렬 불일치, 토큰화 미비(시각 영향 없음), 미세한 시각 개선

## 출력

```markdown
D-001 | Major | frontend/src/globals.css:353 | 내비 포커스 링 대비 1.3:1 | outline: 2px solid var(--border-focus)
Q# | 값 | p | E=실행/코드/추론 | 근거   ← 판정 질문을 받은 경우(JEV 형식)
```
