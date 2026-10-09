"""agentStop 결정론적 게이트: 이번 작업에서 변경된 .py 파일의 구문 오류를 턴 종료 전에 잡는다.

- 변경 파일만 검사(git diff HEAD + untracked)한다. 일반적으로 약 1초(파이썬 기동 포함).
- 오류가 있으면 decision=block 으로 에이전트에게 한 턴 더 수정하게 한다.
- stop_hook_active 이면 이미 한 번 강제 진행된 턴이므로 다시 막지 않는다(무한 루프 방지).
- 훅 자체 오류는 항상 통과시킨다(fail-open). 게이트가 작업을 망가뜨리면 안 된다.
"""
import json
import subprocess
import sys
from pathlib import Path

EXCLUDED_PARTS = {".venv", "__pycache__", "node_modules", ".next", "ML_Models"}


def changed_python_files(root: Path) -> list[Path]:
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
        if path.suffix == ".py" and path.is_file() and not EXCLUDED_PARTS & set(path.parts):
            files.append(path)
    return files


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
    for path in changed_python_files(root):
        try:
            compile(path.read_bytes(), str(path), "exec")
        except SyntaxError as exc:
            errors.append(f"{path.relative_to(root)}:{exc.lineno}: {exc.msg}")

    if errors:
        reason = (
            "[stop_gate] 변경된 Python 파일에 구문 오류가 있습니다. 수정 후 종료하세요:\n"
            + "\n".join(errors[:20])
        )
        print(json.dumps({"decision": "block", "reason": reason}, ensure_ascii=True))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
