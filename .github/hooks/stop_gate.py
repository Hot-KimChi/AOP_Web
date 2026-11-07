"""agentStop 결정론적 게이트: 이번 작업에서 변경된 파일의 기계 감지 가능한 실수를 턴 종료 전에 잡는다.

- Python: 변경 .py 구문 오류.
- Frontend(frontend/AGENTS.md Top 5 중 오탐 없이 감지 가능한 것만):
  · app 라우트 엔트리(page/layout/template)가 React 훅을 쓰면서 'use client' 누락 → 빌드 에러
  · 문자열 리터럴로 고정한 http(s)://localhost:5000 → 원격 사용자 API 호출 실패(apiBase.js 사용)
  · CSS의 .dark 선택자 → 테마 미적용([data-theme="dark"] 사용)
- 변경 파일만 검사(git diff HEAD + untracked)한다. 일반적으로 약 1초(파이썬 기동 포함), 1MB 초과 파일은 생략.
- 프론트 검사는 완전한 파서가 아닌 경량 토크나이저(주석·문자열·정규식 리터럴 마스킹)다.
  판정이 애매하면 통과시킨다(오탐 회피 우선). 최종 방어선은 `npm run build`다.
- 오류가 있으면 decision=block 으로 에이전트에게 한 턴 더 수정하게 한다.
- stop_hook_active 이면 이미 한 번 강제 진행된 턴이므로 다시 막지 않는다(무한 루프 방지).
- 훅 자체 오류는 항상 통과시킨다(fail-open). 게이트가 작업을 망가뜨리면 안 된다.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

EXCLUDED_PARTS = {".venv", "__pycache__", "node_modules", ".next", "ML_Models"}
FRONTEND_SRC = ("frontend", "src")
JS_SUFFIXES = {".js", ".jsx", ".ts", ".tsx"}
ROUTE_ENTRY_STEMS = {"page", "layout", "template"}
MAX_SCAN_BYTES = 1_000_000  # 생성물·번들 등 대용량 파일은 건너뛰어 훅 시간을 수 초 이내로 유지

REACT_HOOK_RE = re.compile(r"\buse(?:State|Effect|LayoutEffect|Ref|Context|Callback|Memo|Reducer|Router|SearchParams|Pathname|Auth)\s*\(")
HARDCODED_API_RE = re.compile(r"https?://localhost:5000")
DARK_CLASS_RE = re.compile(r"\.dark(?![\w-])")


_STRING_ALTS = (
    r"|(?P<q>['\"])(?P<qs>(?:\\.|(?!(?P=q))[^\\\n])*)(?P=q)?"
    r"|`(?P<ts>(?:\\.|[^`\\])*)`?"
)
JS_TOKEN_RE = re.compile(
    r"/\*.*?(?:\*/|\Z)"
    r"|//[^\n]*"
    # 정규식 리터럴: 연산자·여는 괄호·return 뒤의 '/'만 인정(나눗셈과 구분). 전체를 가린다.
    r"|(?:(?<=[=(,:\[!&|?{;])|(?<=\breturn))\s*/(?![/*])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n\[])+/[a-z]*"
    + _STRING_ALTS,
    re.S,
)
CSS_TOKEN_RE = re.compile(r"/\*.*?(?:\*/|\Z)" + _STRING_ALTS + r"|url\([^)'\"]*\)", re.S | re.I)
NON_NEWLINE_RE = re.compile(r"[^\n]")


def scan_source(text: str, css: bool = False) -> tuple[str, list[tuple[int, str, str]]]:
    """주석·정규식·URL과 문자열 내용을 공백으로 가린 코드(줄 위치 보존)와 문자열 리터럴 목록(시작 오프셋, 따옴표, 내용)을 반환한다."""
    strings: list[tuple[int, str, str]] = []

    def mask(m: re.Match) -> str:
        token = m.group(0)
        content = m.group("qs") if m.group("q") else m.group("ts")
        if content is None:
            return NON_NEWLINE_RE.sub(" ", token)
        strings.append((m.start(), token[0], content))
        return token[0] + NON_NEWLINE_RE.sub(" ", token[1:])

    return (CSS_TOKEN_RE if css else JS_TOKEN_RE).sub(mask, text), strings


def has_use_client_directive(code: str, strings: list[tuple[int, str, str]]) -> bool:
    # 지시문은 주석·공백 뒤 첫 문장인 독립 따옴표 문자열이어야 한다(code 는 주석이 가려진 상태).
    first = len(code) - len(code.lstrip())
    if not strings or strings[0][0] != first or strings[0][1] not in "'\"" or strings[0][2] != "use client":
        return False
    rest = code[first + len("use client") + 2:].lstrip(" \t")
    return not rest or rest[0] in ";\r\n"


def changed_files(root: Path) -> list[Path]:
    def git_paths(*args: str) -> set[str]:
        result = subprocess.run(["git", *args], cwd=root, capture_output=True, timeout=10)
        if result.returncode != 0:
            return set()
        # -z 출력은 인용·이스케이프 없이 원래 경로를 보존한다(한글·공백 파일명).
        return {p for p in result.stdout.decode("utf-8", "replace").split("\0") if p}

    has_head = subprocess.run(
        ["git", "rev-parse", "--verify", "-q", "HEAD"], cwd=root, capture_output=True, timeout=10
    ).returncode == 0
    names = git_paths("diff", "--name-only", "-z", "HEAD") if has_head else git_paths("ls-files", "-z", "--cached")
    names |= git_paths("ls-files", "-z", "--others", "--exclude-standard")
    files = []
    for name in sorted(names):
        path = root / name
        if path.is_file() and not EXCLUDED_PARTS & set(path.parts):
            files.append(path)
    return files


def frontend_errors(root: Path, path: Path) -> list[str]:
    rel = path.relative_to(root)
    if tuple(rel.parts[:2]) != FRONTEND_SRC or path.stat().st_size > MAX_SCAN_BYTES:
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    errors = []
    if path.suffix in JS_SUFFIXES:
        code, strings = scan_source(text)
        if (
            "app" in rel.parts
            and path.stem in ROUTE_ENTRY_STEMS
            and REACT_HOOK_RE.search(code)
            and not has_use_client_directive(code, strings)
        ):
            errors.append(f"{rel}: React 훅을 쓰는 라우트 엔트리에 'use client' 선언이 없습니다")
        for offset, _quote, content in strings:
            if HARDCODED_API_RE.match(content):
                lineno = text.count("\n", 0, offset) + 1
                errors.append(f"{rel}:{lineno}: API 주소 하드코딩 금지 — lib/apiBase.js 의 API_BASE_URL 사용")
    elif path.suffix == ".css":
        code, _ = scan_source(text, css=True)
        for lineno, line in enumerate(code.splitlines(), 1):
            if DARK_CLASS_RE.search(line):
                errors.append(f"{rel}:{lineno}: .dark 선택자 금지 — [data-theme=\"dark\"] 사용")
    return errors


def main() -> None:
    raw = sys.stdin.buffer.read().decode("utf-8", "replace") if not sys.stdin.isatty() else ""
    payload = json.loads(raw) if raw.strip() else {}
    if payload.get("stop_hook_active") or payload.get("stopHookActive"):
        return

    root = Path(
        subprocess.run(
            ["git", "rev-parse", "--show-toplevel"], capture_output=True, timeout=10
        ).stdout.decode().strip()
        or "."
    )

    errors = []
    for path in changed_files(root):
        try:
            if path.suffix == ".py":
                compile(path.read_bytes(), str(path), "exec")
            else:
                errors.extend(frontend_errors(root, path))
        except SyntaxError as exc:
            errors.append(f"{path.relative_to(root)}:{exc.lineno}: {exc.msg}")
        except (OSError, ValueError):
            continue

    if errors:
        reason = (
            "[stop_gate] 변경 파일에 규칙 위반이 있습니다. 수정 후 종료하세요:\n"
            + "\n".join(errors[:20])
        )
        print(json.dumps({"decision": "block", "reason": reason}, ensure_ascii=True))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
