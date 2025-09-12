"""
XGBoost 모델의 MLflow 추적 테스트 스크립트
"""

import logging
import sys
import os

# 프로젝트 경로 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Flask 앱 컨텍스트 설정 (세션 사용을 위해)
from flask import Flask, session

app = Flask(__name__)
app.secret_key = "test_secret_key"


def test_xgboost_tracking():
    """XGBoost 모델의 MLflow 추적 테스트"""

    # 환경 변수 설정 (중요!)
    os.environ["SERVER_ADDRESS_ADDRESS"] = "kr001s1804srv"

    with app.app_context():
        # 테스트용 세션 설정
        with app.test_request_context():
            session["username"] = "sel02776"  # 실제 사용자명으로 변경
            session["password"] = "1qaz!QAZ"  # 실제 비밀번호로 변경

            try:
                from pkg_MachineLearning.mlflow_integration import AOP_MLflowTracker

                # MLflow 추적기 초기화
                tracker = AOP_MLflowTracker()
                print(f"✅ MLflow 추적기 초기화 성공")
                print(f"   추적 활성화 상태: {tracker.tracking_enabled}")

                # XGBoost 훈련 실행 시작
                run_uuid = tracker.start_training_run("XGBoost")

                if run_uuid:
                    print(f"✅ XGBoost 훈련 실행 시작 성공")
                    print(f"   실행 UUID: {run_uuid}")
                    print(f"   실행 UUID (처음 8자리): {run_uuid[:8]}...")

                    # 테스트 완료 - 실행 종료
                    tracker.end_run(status="FINISHED")
                    print(f"✅ 실행 정상 종료")

                else:
                    print(f"❌ XGBoost 훈련 실행 시작 실패")
                    print("   가능한 원인:")
                    print(
                        "   1. ml_experiments 테이블에 'AOP_Model_Training' 실험 없음"
                    )
                    print("   2. 데이터베이스 연결 문제")

            except Exception as e:
                print(f"❌ 테스트 실패: {e}")
                print("\n상세 오류 정보:")
                import traceback

                traceback.print_exc()


if __name__ == "__main__":
    # 로깅 설정
    logging.basicConfig(level=logging.INFO)

    print("=== XGBoost MLflow 추적 테스트 ===")
    test_xgboost_tracking()
