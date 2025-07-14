import os
import configparser
import logging


class MachineLearning:
    def __init__(self, config_path=None):
        if config_path is None:
            config_path = os.path.join(
                os.path.dirname(__file__), "..", "AOP_config.cfg"
            )
        self.config_path = os.path.abspath(config_path)
        self.config = configparser.ConfigParser()
        self.config.read(self.config_path, encoding="utf-8")
        self.logger = logging.getLogger("MachineLearning")

    def get_ml_models(self):
        """
        [Machine_Learning] 섹션의 Model 값을 리스트로 반환
        """
        if (
            "Machine_Learning" in self.config
            and "Model" in self.config["Machine_Learning"]
        ):
            models = self.config["Machine_Learning"]["Model"]
            # 여러 줄에 걸쳐 있을 수 있으므로 줄바꿈/공백/콤마 처리
            models = models.replace("\n", ",").replace("\r", ",")
            model_list = [m.strip() for m in models.split(",") if m.strip()]
            return model_list
        return []

    def train_model(self, model_name, username, password):
        """
        머신러닝 모델 훈련 실행

        Args:
            model_name (str): 훈련할 모델명
            username (str): DB 연결용 사용자명
            password (str): DB 연결용 비밀번호

        Returns:
            dict: 훈련 결과 정보
        """
        try:
            self.logger.info(f"Starting training for model: {model_name}")

            # 환경변수 임시 설정
            original_username = os.environ.get("USER_NAME")
            original_password = os.environ.get("PASSWORD")

            os.environ["USER_NAME"] = username
            os.environ["PASSWORD"] = password

            try:
                # fetch_selectFeature.py의 함수 호출
                from .fetch_selectFeature import merge_selectionFeature

                # 데이터 로드 및 전처리
                feature_data, target_data = merge_selectionFeature()

                self.logger.info(
                    f"Data loaded successfully - Features: {feature_data.shape}, Target: {target_data.shape}"
                )

                # TODO: 실제 모델 훈련 로직 구현
                # 예: sklearn 모델 로드, 훈련, 저장
                training_result = self._execute_training(
                    model_name, feature_data, target_data
                )

                return {
                    "status": "success",
                    "message": f"모델 '{model_name}' 훈련이 완료되었습니다.",
                    "data_info": {
                        "features_shape": feature_data.shape,
                        "target_shape": target_data.shape,
                        "training_result": training_result,
                    },
                }

            finally:
                # 환경변수 복원
                if original_username:
                    os.environ["USER_NAME"] = original_username
                if original_password:
                    os.environ["PASSWORD"] = original_password

        except Exception as e:
            self.logger.error(f"Training failed: {str(e)}", exc_info=True)
            raise Exception(f"모델 훈련 중 오류가 발생했습니다: {str(e)}")

    def _execute_training(self, model_name, feature_data, target_data):
        """
        실제 모델 훈련 실행 (추후 구현)

        Args:
            model_name (str): 모델명
            feature_data (numpy.ndarray): 특성 데이터
            target_data (numpy.ndarray): 타겟 데이터

        Returns:
            dict: 훈련 결과
        """
        # TODO: 실제 모델 훈련 로직 구현
        # 예시:
        # - 모델별 분기 처리
        # - 하이퍼파라미터 설정
        # - 모델 훈련 및 검증
        # - 모델 저장

        self.logger.info(f"Executing training for {model_name}")

        # 임시 결과 반환
        return {
            "model": model_name,
            "data_size": len(feature_data),
            "feature_count": (
                feature_data.shape[1] if len(feature_data.shape) > 1 else 0
            ),
            "status": "completed",
        }
