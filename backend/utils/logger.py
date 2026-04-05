import logging

# 루트 로거에 핸들러가 없을 때만 basicConfig 설정 (중복 핸들러 방지)
if not logging.root.handlers:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
logger = logging.getLogger("AOP_Web")
