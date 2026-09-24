import configparser
import os
import re

# 개발 편의를 위한 기본값 — 운영(AOP_ENV=production)에서는 사용이 차단된다.
DEFAULT_AUTH_SECRET = "AOP_Admin_Token"
DEFAULT_FLASK_SECRET = "AOP_Web_Dev_Secret_Key"

# 개발 모드에서 ALLOWED_ORIGINS 미지정 시 허용할 Origin 패턴.
# 과거 기본값이던 "*" 는 supports_credentials=True 와 결합하면 임의 사이트가
# 인증 쿠키를 실은 요청을 보낼 수 있어(CSRF·데이터 탈취) 사용하지 않는다.
DEV_ORIGIN_PATTERN = re.compile(
    r"^https?://("
    r"localhost|127\.0\.0\.1|\[::1\]|"
    r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"192\.168\.\d{1,3}\.\d{1,3}|"
    r"172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
    r")(:\d+)?$"
)


def _parse_origins(raw: str):
    """쉼표 구분 Origin 문자열을 파싱한다. 비어 있으면 개발용 사설망 패턴을 쓴다."""
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    return origins or [DEV_ORIGIN_PATTERN]


def _is_production() -> bool:
    return os.environ.get("AOP_ENV", "development").lower() == "production"


def _parse_allowed_users(raw: str):
    """로그인을 허용할 사용자(selxxxxx) 목록을 파싱한다.

    비어 있으면 None 을 돌려주고, 이는 "제한 없음"(기존 동작)을 뜻한다.
    SQL Server 로그인명은 대소문자를 구분하지 않으므로 소문자로 정규화한다.
    """
    users = {u.strip().lower() for u in raw.split(",") if u.strip()}
    return users or None


# 업로드/생성 파일의 단일 기준 루트(절대 경로).
# 상대 경로를 쓰면 Flask 프로세스의 작업 디렉터리에 따라 저장 위치와 조회 위치가
# 어긋나므로(생성은 성공하지만 다운로드는 400), 저장소 루트 기준으로 고정한다.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_ROOT = os.path.join(PROJECT_ROOT, "1_uploads")


class Config:
    UPLOAD_FOLDER = UPLOADS_ROOT
    UPLOADS_ROOT = UPLOADS_ROOT
    # JWT 서명 키
    SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", DEFAULT_AUTH_SECRET)
    EXPIRE_TIME = int(os.environ.get("AUTH_EXPIRE_TIME", 7200))
    # Flask 세션 서명 키 (운영 환경에서는 반드시 환경변수로 지정)
    FLASK_SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", DEFAULT_FLASK_SECRET)
    # CORS 허용 Origins (쉼표 구분)
    ALLOWED_ORIGINS = _parse_origins(os.environ.get("ALLOWED_ORIGINS", ""))
    # 쿠키 Secure 플래그 (운영=true, 개발=false)
    COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
    # 로그인 허용 사용자 목록 (미지정 시 제한 없음)
    ALLOWED_USERS = _parse_allowed_users(os.environ.get("AUTH_ALLOWED_USERS", ""))

    @staticmethod
    def is_login_allowed(username: str) -> bool:
        """해당 사용자가 로그인 가능한지 판단한다. 목록 미지정이면 전원 허용."""
        if not Config.ALLOWED_USERS:
            return True
        if not username:
            return False
        # 목록이 코드로 직접 주입되어 정규화를 거치지 않았을 수도 있으므로
        # 비교 시점에도 양쪽을 소문자로 맞춘다.
        target = username.strip().lower()
        return any(target == str(u).strip().lower() for u in Config.ALLOWED_USERS)

    @staticmethod
    def _validate_production():
        """운영 모드에서 개발용 기본 시크릿이 그대로 쓰이면 부팅을 중단한다."""
        if not _is_production():
            return
        weak = []
        if Config.SECRET_KEY == DEFAULT_AUTH_SECRET:
            weak.append("AUTH_SECRET_KEY")
        if Config.FLASK_SECRET_KEY == DEFAULT_FLASK_SECRET:
            weak.append("FLASK_SECRET_KEY")
        if weak:
            raise RuntimeError(
                "운영 모드에서는 다음 환경변수를 반드시 지정해야 합니다: "
                + ", ".join(weak)
            )
        if not Config.ALLOWED_ORIGINS:
            raise RuntimeError(
                "운영 모드에서는 ALLOWED_ORIGINS 를 명시적으로 지정해야 합니다."
            )

    @staticmethod
    def load_config():
        # 현재 파일(config.py)의 디렉토리를 기준으로 config 파일 경로 설정
        current_dir = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(current_dir, "AOP_config.cfg")

        # 로컬 .env 또는 .env.production 파일이 존재하면 환경변수로 먼저 로드
        for env_filename in (".env.production", ".env"):
            env_file_path = os.path.join(current_dir, env_filename)
            if os.path.isfile(env_file_path):
                try:
                    with open(env_file_path, "r", encoding="utf-8-sig") as f:
                        for line in f:
                            line = line.strip()
                            if not line or line.startswith("#") or "=" not in line:
                                continue
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip("'\"")
                            if k and v:
                                os.environ.setdefault(k, v)
                except Exception:
                    pass

        config = configparser.ConfigParser()

        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Config file not found: {config_path}")

        config.read(config_path, encoding="utf-8")

        if not config.sections():
            raise ValueError(f"Config file is empty or invalid: {config_path}")

        # CFG 섹션/키 → 환경변수 변환 (예: [Auth] SECRET_KEY → AUTH_SECRET_KEY)
        # 이미 설정된 환경변수는 덮어쓰지 않는다 — 운영 배포 시 환경변수로 주입한
        # 시크릿이 저장소에 커밋된 CFG 값으로 되돌아가는 것을 막기 위함이다.
        for section in config.sections():
            for key, value in config[section].items():
                env_var_name = f"{section.replace(' ', '_').upper()}_{key.replace(' ', '_').upper()}"
                os.environ.setdefault(env_var_name, value)

        # 섹션 접두사가 붙어 실제 설정 키와 이름이 달라지는 항목의 별칭 매핑.
        # 예: [Flask] COOKIE_SECURE → FLASK_COOKIE_SECURE 로 변환되어
        #     COOKIE_SECURE 를 읽는 설정에 전달되지 않던 문제를 보정한다.
        for prefixed, canonical in (
            ("FLASK_COOKIE_SECURE", "COOKIE_SECURE"),
            ("FLASK_ALLOWED_ORIGINS", "ALLOWED_ORIGINS"),
        ):
            if prefixed in os.environ:
                os.environ.setdefault(canonical, os.environ[prefixed])

        if "database" in config and "name" in config["database"]:
            os.environ.setdefault("DATABASE_NAME", config["database"]["name"])

        # 클래스 속성은 import 시점에 평가되므로, CFG 로드 후 재적용
        Config.SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", DEFAULT_AUTH_SECRET)
        Config.EXPIRE_TIME = int(os.environ.get("AUTH_EXPIRE_TIME", 7200))
        Config.FLASK_SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", DEFAULT_FLASK_SECRET)
        Config.COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
        Config.ALLOWED_ORIGINS = _parse_origins(os.environ.get("ALLOWED_ORIGINS", ""))
        Config.ALLOWED_USERS = _parse_allowed_users(os.environ.get("AUTH_ALLOWED_USERS", ""))

        Config._validate_production()
