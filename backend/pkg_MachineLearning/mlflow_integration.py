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

    def start_training_run(self, model_name, experiment_name="Est_zt_Training"):
        """machine_learning.py의 훈련 시작 시 호출 (자동 실험 생성 포함)"""
        if not self.tracking_enabled:
            return None

        try:
            # 🆕 개선: 실험 자동 생성 또는 조회
            experiment_id = self._ensure_experiment_exists(experiment_name)
            if experiment_id is None:
                self.logger.error(
                    f"Failed to create or find experiment: {experiment_name}"
                )
                return None

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

    def _ensure_experiment_exists(self, experiment_name):
        """
        실험이 존재하는지 확인하고, 없으면 자동 생성

        Returns:
            int: experiment_id, 실패 시 None
        """
        try:
            # 1. 기존 실험 조회
            exp_query = (
                "SELECT experiment_id FROM ml_experiments WHERE experiment_name = ?"
            )
            exp_result = self.db.execute_query(exp_query, (experiment_name,))

            if not exp_result.empty:
                # 기존 실험 존재
                experiment_id = int(exp_result.iloc[0]["experiment_id"])
                self.logger.info(
                    f"Found existing experiment: {experiment_name} (ID: {experiment_id})"
                )

                # 🆕 실험 활동 시간 업데이트
                self._update_experiment_activity(experiment_name)
                return experiment_id

            # 2. 새 실험 생성
            self.logger.info(f"Creating new experiment: {experiment_name}")

            create_query = """
                INSERT INTO ml_experiments 
                (experiment_name, artifact_location, lifecycle_stage, creation_time, last_update_time)
                VALUES (?, ?, ?, GETDATE(), GETDATE())
            """

            artifact_location = f"/models/artifacts/{experiment_name}"

            self.db.execute_query(
                create_query, (experiment_name, artifact_location, "active")
            )

            # 3. 생성된 실험 ID 조회
            exp_result = self.db.execute_query(exp_query, (experiment_name,))

            if not exp_result.empty:
                experiment_id = int(exp_result.iloc[0]["experiment_id"])
                self.logger.info(
                    f"Created new experiment: {experiment_name} (ID: {experiment_id})"
                )
                return experiment_id
            else:
                self.logger.error(
                    f"Failed to retrieve created experiment: {experiment_name}"
                )
                return None

        except Exception as e:
            self.logger.error(f"Failed to ensure experiment exists: {e}")
            return None

    def _update_experiment_activity(self, experiment_name):
        """실험의 마지막 활동 시간 업데이트"""
        try:
            update_query = """
                UPDATE ml_experiments 
                SET last_update_time = GETDATE()
                WHERE experiment_name = ?
            """
            self.db.execute_query(update_query, (experiment_name,))
            self.logger.debug(f"Updated experiment activity: {experiment_name}")

        except Exception as e:
            # 업데이트 실패해도 전체 프로세스는 계속 진행
            self.logger.warning(f"Failed to update experiment activity: {e}")

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
                    query,
                    (self.current_run_uuid, param_key, param_value, param_type),
                )

            # 실행 정보 업데이트
            update_query = "UPDATE ml_runs SET data_shape_info = ? WHERE run_uuid = ?"
            self.db.execute_query(
                update_query,
                (data_shape_info, self.current_run_uuid),
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
                    query,
                    (self.current_run_uuid, param_key, param_value, param_type),
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
                query,
                (datetime.datetime.now(), status, self.current_run_uuid),
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

    def register_model(
        self, model_name, model_file_path, training_result, stage="None"
    ):
        """
        훈련 완료 후 모델 등록 및 버전 관리

        Args:
            model_name (str): 모델명 (예: "XGBoost_AOP")
            model_file_path (str): 모델 파일 경로
            training_result (dict): 훈련 결과 딕셔너리
            stage (str): 모델 스테이지 ("None", "Staging", "Production")

        Returns:
            int: 생성된 model_version_id, 실패 시 None
        """
        if not self.tracking_enabled or not self.current_run_uuid:
            self.logger.warning(
                "Model registration skipped: tracking disabled or no active run"
            )
            return None

        try:
            # 1. 등록된 모델 ID 조회 (이미 등록된 모델인지 확인)
            model_query = (
                "SELECT model_id FROM ml_registered_models WHERE model_name = ?"
            )
            model_result = self.db.execute_query(model_query, (model_name,))

            if model_result.empty:
                self.logger.warning(
                    f"Model '{model_name}' not found in registry. Please register the model first."
                )
                return None

            model_id = int(model_result.iloc[0]["model_id"])

            # 2. 다음 버전 번호 계산
            version_query = "SELECT MAX(version_number) as max_version FROM ml_model_versions WHERE model_id = ?"
            version_result = self.db.execute_query(version_query, (model_id,))

            next_version = 1
            if (
                not version_result.empty
                and version_result.iloc[0]["max_version"] is not None
            ):
                next_version = int(version_result.iloc[0]["max_version"]) + 1

            # 3. 모델 파일 크기 계산
            import os

            file_size = 0
            if os.path.exists(model_file_path):
                file_size = os.path.getsize(model_file_path)

            # 4. 새 모델 버전 등록
            version_query = """
                INSERT INTO ml_model_versions (
                    model_id, version_number, user_id, stage, 
                    run_uuid, file_path, description
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """

            description = f"Auto-registered from training run. Test score: {training_result.get('test_score', 'N/A')}"

            self.db.execute_query(
                version_query,
                (
                    model_id,
                    next_version,
                    self.username,
                    stage,
                    self.current_run_uuid,
                    model_file_path,
                    description,
                ),
            )

            # 5. 생성된 version_id 조회
            version_id_query = """
                SELECT version_id FROM ml_model_versions 
                WHERE model_id = ? AND version_number = ?
            """
            version_id_result = self.db.execute_query(
                version_id_query, (model_id, next_version)
            )
            version_id = int(version_id_result.iloc[0]["version_id"])

            # 6. 모델 성능 정보 저장
            self._log_model_performance(version_id, training_result)

            # 7. 최고 성능 모델인 경우 자동으로 Production 단계로 승격
            self._auto_promote_best_model(
                model_id, version_id, training_result.get("test_score", 0)
            )

            self.logger.info(
                f"Model registered: {model_name} v{next_version} (version_id: {version_id})"
            )
            return version_id

        except Exception as e:
            self.logger.error(f"Failed to register model: {e}")
            return None

    def _log_model_performance(self, version_id, training_result):
        """모델 성능 정보를 ml_model_performance 테이블에 저장"""
        try:
            performance_metrics = [
                ("train_cv_score", training_result.get("train_cv_score"), "train"),
                (
                    "validation_cv_score",
                    training_result.get("validation_cv_score"),
                    "validation",
                ),
                ("test_score", training_result.get("test_score"), "test"),
                ("cv_folds", training_result.get("cv_folds"), "cv"),
            ]

            for metric_name, metric_value, dataset_type in performance_metrics:
                if metric_value is not None:
                    perf_query = """
                        INSERT INTO ml_model_performance (
                            model_version_id, metric_name, metric_value, dataset_type
                        )
                        VALUES (?, ?, ?, ?)
                    """
                    self.db.execute_query(
                        perf_query,
                        (version_id, metric_name, float(metric_value), dataset_type),
                    )

            self.logger.info(f"Performance metrics logged for version_id: {version_id}")

        except Exception as e:
            self.logger.error(f"Failed to log model performance: {e}")

    def _auto_promote_best_model(self, model_id, new_version_id, new_test_score):
        """
        새 모델이 최고 성능이면 자동으로 Production으로 승격
        기존 Production 모델은 Staging으로 강등
        """
        try:
            if new_test_score is None:
                return

            # 현재 Production 모델의 성능 조회
            current_prod_query = """
                SELECT mv.version_id, mp.metric_value
                FROM ml_model_versions mv
                JOIN ml_model_performance mp ON mv.version_id = mp.model_version_id
                WHERE mv.model_id = ? AND mv.stage = 'Production' 
                    AND mp.metric_name = 'test_score'
            """
            current_prod_result = self.db.execute_query(current_prod_query, (model_id,))

            should_promote = False

            if current_prod_result.empty:
                # Production 모델이 없으면 승격
                should_promote = True
                self.logger.info("No Production model found. Promoting new model.")
            else:
                # 기존 Production 모델보다 성능이 좋으면 승격
                current_score = float(current_prod_result.iloc[0]["metric_value"])
                if new_test_score > current_score:
                    should_promote = True
                    current_prod_version_id = int(
                        current_prod_result.iloc[0]["version_id"]
                    )

                    # 기존 Production 모델을 Staging으로 강등
                    demote_query = "UPDATE ml_model_versions SET stage = 'Staging' WHERE version_id = ?"
                    self.db.execute_query(demote_query, (current_prod_version_id,))

                    self.logger.info(
                        f"Demoted version_id {current_prod_version_id} to Staging"
                    )

            if should_promote:
                # 새 모델을 Production으로 승격
                promote_query = "UPDATE ml_model_versions SET stage = 'Production' WHERE version_id = ?"
                self.db.execute_query(promote_query, (new_version_id,))

                self.logger.info(
                    f"Promoted version_id {new_version_id} to Production (score: {new_test_score})"
                )

        except Exception as e:
            self.logger.error(f"Failed to auto-promote model: {e}")

    def log_prediction(
        self,
        model_version_id,
        input_features,
        prediction_result,
        request_source="unknown",
        prediction_type="intensity",
        processing_time_ms=0,
    ):
        """
        예측 결과를 aop_prediction_logs 테이블에 로깅

        Args:
            model_version_id (int): 사용된 모델 버전 ID
            input_features (dict or str): 입력 특성 (JSON으로 저장)
            prediction_result (list or str): 예측 결과 (JSON으로 저장)
            request_source (str): 요청 출처 ("intensity_estimation", "power_estimation" 등)
            prediction_type (str): 예측 타입 ("intensity", "power", "temperature")
            processing_time_ms (int): 처리 시간 (밀리초)

        Returns:
            int: 생성된 log_id, 실패 시 None
        """
        if not self.tracking_enabled:
            return None

        try:
            # JSON 형태로 변환
            if isinstance(input_features, dict):
                input_features_json = json.dumps(input_features)
            else:
                input_features_json = str(input_features)

            if isinstance(prediction_result, (list, dict)):
                prediction_result_json = json.dumps(prediction_result)
            else:
                prediction_result_json = str(prediction_result)

            # 예측 로그 저장
            log_query = """
                INSERT INTO aop_prediction_logs (
                    model_version_id, input_features, prediction_result,
                    user_id, request_source, processing_time_ms, prediction_type
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """

            self.db.execute_query(
                log_query,
                (
                    model_version_id,
                    input_features_json,
                    prediction_result_json,
                    self.username,
                    request_source,
                    processing_time_ms,
                    prediction_type,
                ),
            )

            self.logger.info(
                f"Prediction logged: {prediction_type} prediction using model version {model_version_id}"
            )
            return True

        except Exception as e:
            self.logger.error(f"Failed to log prediction: {e}")
            return None

    @classmethod
    def get_best_model_info(cls, model_type=None):
        """최적 모델 정보 조회 (개선된 버전)"""
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
                    mp.metric_value as test_score,
                    mv.creation_time,
                    mv.stage,
                    mv.version_id
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

    @classmethod
    def get_model_by_name(cls, model_name, stage="Production"):
        """모델명으로 특정 스테이지의 모델 정보 조회"""
        try:
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
                    mv.stage,
                    mv.version_id,
                    mp.metric_value as test_score
                FROM ml_registered_models rm
                JOIN ml_model_versions mv ON rm.model_id = mv.model_id
                LEFT JOIN ml_model_performance mp ON mv.version_id = mp.model_version_id 
                    AND mp.metric_name = 'test_score'
                WHERE rm.model_name = ?
                    AND mv.stage = ?
                ORDER BY mv.version_number DESC
            """

            result = db.execute_query(query, (model_name, stage))

            if not result.empty:
                return result.iloc[0].to_dict()

            return None

        except Exception as e:
            logging.error(f"Failed to get model by name: {e}")
            return None

    @classmethod
    def log_prediction(
        cls, model_name, input_features, prediction_result, prediction_type="regression"
    ):
        """예측 결과 로깅 (aop_prediction_logs 테이블에 저장)"""
        try:
            username = session.get("username")
            password = session.get("password")

            if not username or not password:
                return None

            db = SQL(
                username=username, password=password, database="AOP_MLflow_Tracking"
            )

            # 입력 특성들을 JSON 형태로 저장
            input_features_json = (
                json.dumps(input_features)
                if isinstance(input_features, dict)
                else str(input_features)
            )

            # 예측 결과도 JSON 형태로 저장
            prediction_json = (
                json.dumps(prediction_result)
                if not isinstance(prediction_result, str)
                else prediction_result
            )

            query = """
                INSERT INTO aop_prediction_logs 
                (model_name, input_features, prediction_result, prediction_type, prediction_timestamp, user_id)
                VALUES (?, ?, ?, ?, GETDATE(), ?)
            """

            db.execute_query(
                query,
                (
                    model_name,
                    input_features_json,
                    prediction_json,
                    prediction_type,
                    username,
                ),
            )
            logging.info(f"Prediction logged for model: {model_name}")
            return True

        except Exception as e:
            logging.error(f"Failed to log prediction: {e}")
            return False

    @classmethod
    def get_recent_predictions(cls, model_name=None, limit=10):
        """최근 예측 결과 조회"""
        try:
            username = session.get("username")
            password = session.get("password")

            if not username or not password:
                return None

            db = SQL(
                username=username, password=password, database="AOP_MLflow_Tracking"
            )

            if model_name:
                query = """
                    SELECT TOP (?)
                        model_name,
                        input_features,
                        prediction_result,
                        prediction_type,
                        prediction_timestamp,
                        user_id
                    FROM aop_prediction_logs
                    WHERE model_name = ?
                    ORDER BY prediction_timestamp DESC
                """
                result = db.execute_query(query, (limit, model_name))
            else:
                query = """
                    SELECT TOP (?)
                        model_name,
                        input_features,
                        prediction_result,
                        prediction_type,
                        prediction_timestamp,
                        user_id
                    FROM aop_prediction_logs
                    ORDER BY prediction_timestamp DESC
                """
                result = db.execute_query(query, (limit,))

            return result

        except Exception as e:
            logging.error(f"Failed to get recent predictions: {e}")
            return None
