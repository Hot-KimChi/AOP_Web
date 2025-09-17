import os
import configparser
import logging
from .mlflow_integration import AOP_MLflowTracker


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

    def train_model(self, model_name):
        """
        머신러닝 모델 훈련 실행

        Args:
            model_name (str): 훈련할 모델명
        Returns:
            dict: 훈련 결과 정보
        """
        # MLflow 추적기 초기화
        mlflow_tracker = None
        try:
            mlflow_tracker = AOP_MLflowTracker()
            run_uuid = mlflow_tracker.start_training_run(model_name)
            self.logger.info(
                f"MLflow tracking started for {model_name} (Run: {run_uuid[:8] if run_uuid else 'disabled'}...)"
            )
        except Exception as e:
            self.logger.warning(f"MLflow tracker initialization failed: {e}")
            mlflow_tracker = None

        try:
            self.logger.info(f"Starting training for model: {model_name}")

            # 1. 데이터 로드 및 전처리 (session 기반 DB 연결 사용)
            from .fetch_selectFeature import merge_selectionFeature

            feature_data, target_data = merge_selectionFeature()
            self.logger.info(
                f"Data loaded - Features: {feature_data.shape}, Target: {target_data.shape}"
            )

            # MLflow: 데이터 정보 로깅
            if mlflow_tracker:
                mlflow_tracker.log_data_info(feature_data, target_data)

            # 2. 데이터 분할 (test_size=0.2)
            from .data_splitting import dataSplit

            train_input, test_input, train_target, test_target = dataSplit(
                feature_data, target_data
            )
            self.logger.info(
                f"Data split - Train: {train_input.shape}, Test: {test_input.shape}"
            )

            # 3. 데이터 전처리 (스케일링 및 polynomial features)
            from .data_preprocessing import DataPreprocess

            data_preprocessor = DataPreprocess(train_input, test_input)
            train_scaled, test_scaled = data_preprocessor.preprocess(
                model_type=model_name
            )
            self.logger.info(f"Data preprocessing completed for model: {model_name}")

            # MLflow: 전처리 정보 로깅
            if mlflow_tracker:
                mlflow_tracker.log_preprocessing_info(model_name)

            # 4. 모델 선택
            from .model_selection import MLModel

            model_selector = MLModel(model_name)
            model = model_selector.select_model()
            self.logger.info(f"Model selected: {model.__class__.__name__}")

            # MLflow: 모델 하이퍼파라미터 로깅
            if mlflow_tracker:
                mlflow_tracker.log_model_params(model)

            # 5. 모델 훈련 및 평가
            from .training_evaluation import ModelEvaluator

            evaluator = ModelEvaluator(
                model, train_scaled, train_target, test_scaled, test_target
            )
            training_result = evaluator.evaluate_model()

            # MLflow: 훈련 결과 로깅
            if mlflow_tracker:
                mlflow_tracker.log_training_result(training_result)

            # 6. 모델 저장
            evaluator.modelSave()

            # 🆕 Step 3: 모델 등록 및 버전 관리 추가
            if mlflow_tracker:
                try:
                    # 저장된 모델 파일 경로 생성
                    import platform
                    import sklearn

                    python_version = platform.python_version().replace(".", "")[:3]
                    sklearn_version = sklearn.__version__.replace(".", "")

                    # evaluator.modelSave()에서 저장하는 경로와 동일하게 생성
                    current_dir = os.path.dirname(os.path.abspath(__file__))
                    model_dir = os.path.join(current_dir, "..", "ML_Models")
                    filename = f"{model_name}_v1_python{python_version}_sklearn{sklearn_version}.pkl"
                    file_path = os.path.join(model_dir, filename)

                    # 상대 경로로 변환 (DB 저장용)
                    relative_path = f"backend/ML_Models/{filename}"

                    # 모델 등록
                    model_version_id = mlflow_tracker.register_model(
                        model_name=f"{model_name}_AOP",
                        model_file_path=relative_path,
                        training_result=training_result,
                        stage="Production",
                    )

                    self.logger.info(
                        f"Model registered: {model_name}_AOP v{model_version_id}"
                    )

                except Exception as e:
                    self.logger.warning(f"Model registration failed: {e}")

            # MLflow: 성공적으로 실행 종료
            if mlflow_tracker:
                mlflow_tracker.end_run(status="FINISHED")

            # 최종 완료 로그 (한 번만)
            self.logger.info(f"Model training pipeline completed for: {model_name}")

            return {
                "status": "success",
                "message": f"모델 '{model_name}' 훈련이 완료되었습니다.",
                "data_info": {
                    "features_shape": feature_data.shape,
                    "target_shape": target_data.shape,
                    "training_result": training_result,
                },
            }

        except Exception as e:
            # MLflow: 에러 발생 시 실행 종료
            if mlflow_tracker:
                mlflow_tracker.end_run(status="FAILED", error_message=str(e))

            self.logger.error(
                f"Training failed for {model_name}: {str(e)}", exc_info=True
            )
            raise Exception(
                f"모델 '{model_name}' 훈련 중 오류가 발생했습니다: {str(e)}"
            )
