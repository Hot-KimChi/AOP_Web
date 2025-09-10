import uuid
import json
import datetime
import logging
import sys
import sklearn
from flask import session
from pkg_SQL.database import SQL


class AOP_MLflowTracker:
    """
    machine_learning.py와 완벽 통합된 MLflow 추적 시스템
    AOP 시스템에 특화된 ML 실험 추적 및 관리
    """

    def __init__(self):
        self.username = session.get("username")
        self.password = session.get("password")

        if not self.username or not self.password:
            raise ValueError("사용자 인증 정보가 없습니다.")

        try:
            self.db = SQL(
                username=self.username,
                password=self.password,
                database="AOP_MLflow_Tracking",
            )
            self.tracking_enabled = True
        except Exception as e:
            logging.warning(f"MLflow tracking disabled: {e}")
            self.tracking_enabled = False
            self.db = None

        self.logger = logging.getLogger("AOP_MLflowTracker")
        self.current_run_uuid = None

    def start_training_run(self, model_name, experiment_name="AOP_Model_Training"):
        """machine_learning.py의 훈련 시작 시 호출"""
        if not self.tracking_enabled:
            return None

        try:
            # 실험 ID 조회
            exp_query = (
                "SELECT experiment_id FROM ml_experiments WHERE experiment_name = ?"
            )
            exp_result = self.db.execute_query(exp_query, (experiment_name,))

            if exp_result.empty:
                self.logger.warning(f"Experiment '{experiment_name}' not found")
                return None

            experiment_id = exp_result.iloc[0]["experiment_id"]

            # 새 실행 UUID 생성
            self.current_run_uuid = str(uuid.uuid4()).replace("-", "")

            # 실행 시작 기록
            query = """
                INSERT INTO ml_runs (
                    run_uuid, experiment_id, user_id, run_name, 
                    run_type, model_name, source_code_version, start_time
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """

            run_name = (
                f"{model_name}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}"
            )
            source_version = f"python{sys.version_info.major}.{sys.version_info.minor}_sklearn{sklearn.__version__}"

            self.db.execute_query(
                query,
                (
                    self.current_run_uuid,
                    experiment_id,
                    self.username,
                    run_name,
                    "training",
                    model_name,
                    source_version,
                    datetime.datetime.now(),
                ),
            )

            self.logger.info(
                f"Training run started: {self.current_run_uuid[:8]}... for {model_name}"
            )
            return self.current_run_uuid

        except Exception as e:
            self.logger.error(f"Failed to start training run: {e}")
            return None

    def log_data_info(self, feature_data, target_data):
        """데이터 정보 로깅"""
        if not self.tracking_enabled or not self.current_run_uuid:
            return

        try:
            # 데이터 형태 정보
            data_shape_info = (
                f"Features: {feature_data.shape}, Target: {target_data.shape}"
            )

            # 파라미터로 저장
            params = [
                ("features_count", str(feature_data.shape[1]), "data"),
                ("samples_count", str(feature_data.shape[0]), "data"),
                ("target_shape", str(target_data.shape), "data"),
                (
                    "feature_names",
                    (
                        ",".join(feature_data.columns.tolist())
                        if hasattr(feature_data, "columns")
                        else "unknown"
                    ),
                    "data",
                ),
            ]

            for param_key, param_value, param_type in params:
                query = """
                    INSERT INTO ml_params (run_uuid, param_key, param_value, param_type)
                    VALUES (?, ?, ?, ?)
                """
                self.db.execute_query(
                    query, (self.current_run_uuid, param_key, param_value, param_type)
                )

            # 실행 정보 업데이트
            update_query = "UPDATE ml_runs SET data_shape_info = ? WHERE run_uuid = ?"
            self.db.execute_query(
                update_query, (data_shape_info, self.current_run_uuid)
            )

            self.logger.info(f"Data info logged: {data_shape_info}")

        except Exception as e:
            self.logger.error(f"Failed to log data info: {e}")

    def log_preprocessing_info(self, model_type, preprocessing_steps=None):
        """전처리 정보 로깅"""
        if not self.tracking_enabled or not self.current_run_uuid:
            return

        try:
            params = [
                ("preprocessing_model_type", model_type, "preprocessing"),
                (
                    "preprocessing_timestamp",
                    datetime.datetime.now().isoformat(),
                    "preprocessing",
                ),
            ]

            if preprocessing_steps:
                params.append(
                    (
                        "preprocessing_steps",
                        json.dumps(preprocessing_steps),
                        "preprocessing",
                    )
                )

            for param_key, param_value, param_type in params:
                query = """
                    INSERT INTO ml_params (run_uuid, param_key, param_value, param_type)
                    VALUES (?, ?, ?, ?)
                """
                self.db.execute_query(
                    query, (self.current_run_uuid, param_key, param_value, param_type)
                )

            self.logger.info(f"Preprocessing info logged for model type: {model_type}")

        except Exception as e:
            self.logger.error(f"Failed to log preprocessing info: {e}")

    def log_model_params(self, model):
        """모델 하이퍼파라미터 로깅"""
        if not self.tracking_enabled or not self.current_run_uuid:
            return

        try:
            if hasattr(model, "get_params"):
                params = model.get_params()

                for param_key, param_value in params.items():
                    query = """
                        INSERT INTO ml_params (run_uuid, param_key, param_value, param_type)
                        VALUES (?, ?, ?, ?)
                    """
                    self.db.execute_query(
                        query,
                        (
                            self.current_run_uuid,
                            param_key,
                            str(param_value)[:1000],
                            "model",
                        ),
                    )

                self.logger.info(f"Model parameters logged: {len(params)} params")

        except Exception as e:
            self.logger.error(f"Failed to log model params: {e}")

    def log_training_result(self, training_result):
        """machine_learning.py의 training_result 로깅"""
        if not self.tracking_enabled or not self.current_run_uuid:
            return

        try:
            # 메트릭 로깅
            metrics = [
                (
                    "train_cv_score",
                    training_result.get("train_cv_score", 0.0),
                    "performance",
                ),
                (
                    "validation_cv_score",
                    training_result.get("validation_cv_score", 0.0),
                    "performance",
                ),
                ("test_score", training_result.get("test_score", 0.0), "performance"),
                ("cv_folds", training_result.get("cv_folds", 5), "data_quality"),
            ]

            for metric_key, metric_value, metric_type in metrics:
                if metric_value is not None:
                    query = """
                        INSERT INTO ml_metrics (run_uuid, metric_key, value, metric_type)
                        VALUES (?, ?, ?, ?)
                    """
                    self.db.execute_query(
                        query,
                        (
                            self.current_run_uuid,
                            metric_key,
                            float(metric_value),
                            metric_type,
                        ),
                    )

            self.logger.info(
                f"Training result logged successfully: {self.current_run_uuid[:8]}..."
            )

        except Exception as e:
            self.logger.error(f"Failed to log training result: {e}")

    def end_run(self, status="FINISHED", error_message=None):
        """실행 종료"""
        if not self.tracking_enabled or not self.current_run_uuid:
            return

        try:
            query = """
                UPDATE ml_runs 
                SET end_time = ?, status = ?
                WHERE run_uuid = ?
            """

            self.db.execute_query(
                query, (datetime.datetime.now(), status, self.current_run_uuid)
            )

            if error_message:
                # 에러 정보를 파라미터로 저장
                error_query = """
                    INSERT INTO ml_params (run_uuid, param_key, param_value, param_type)
                    VALUES (?, ?, ?, ?)
                """
                self.db.execute_query(
                    error_query,
                    (
                        self.current_run_uuid,
                        "error_message",
                        str(error_message)[:1000],
                        "system",
                    ),
                )

            self.logger.info(
                f"Run ended: {self.current_run_uuid[:8]}... with status: {status}"
            )
            self.current_run_uuid = None

        except Exception as e:
            self.logger.error(f"Failed to end run: {e}")

    @classmethod
    def get_best_model_info(cls, model_type=None):
        """최적 모델 정보 조회"""
        try:
            # 임시 인스턴스 생성 (세션 정보 필요)
            username = session.get("username")
            password = session.get("password")

            if not username or not password:
                return None

            db = SQL(
                username=username, password=password, database="AOP_MLflow_Tracking"
            )

            query = """
                SELECT TOP 1
                    rm.model_name,
                    rm.model_type,
                    mv.version_number,
                    mv.file_path,
                    mp.metric_value,
                    mv.creation_time
                FROM ml_registered_models rm
                JOIN ml_model_versions mv ON rm.model_id = mv.model_id
                JOIN ml_model_performance mp ON mv.version_id = mp.model_version_id
                WHERE mp.metric_name = 'test_score'
                    AND mv.stage = 'Production'
                    AND (? IS NULL OR rm.model_type = ?)
                ORDER BY mp.metric_value DESC
            """

            result = db.execute_query(query, (model_type, model_type))

            if not result.empty:
                return result.iloc[0].to_dict()

            return None

        except Exception as e:
            logging.error(f"Failed to get best model info: {e}")
            return None
