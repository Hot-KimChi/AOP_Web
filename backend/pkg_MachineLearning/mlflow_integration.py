import uuid
import json
import datetime
import logging
import sys
import sklearn
from flask import session
from pkg_SQL.database import SQL
from utils.database_manager import get_mlflow_db


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

    def _normalize_model_name(self, model_name, prediction_type="intensity"):
        """
        모델명을 예측 타입별 데이터베이스 등록명으로 변환

        Args:
            model_name (str): model_selection.py에서 사용하는 모델명
            prediction_type (str): 'intensity', 'power', 'temperature'

        Returns:
            str: 데이터베이스에 등록할 표준화된 모델명
        """
        base_mapping = {
            "RandomForestRegressor": "RandomForest_AOP",
            "Gradient_Boosting": "GradientBoosting_AOP",
            "Histogram-based_Gradient_Boosting": "HistGradientBoosting_AOP",
            "XGBoost": "XGBoost_AOP",
            "VotingRegressor": "VotingRegressor_AOP",
            "LinearRegression": "LinearRegression_AOP",
            "PolynomialFeatures_with_linear_regression": "PolynomialLinear_AOP",
            "Ridge_regularization(L2_regularization)": "Ridge_AOP",
            "DecisionTreeRegressor": "DecisionTree_AOP",
            "DL_DNN": "DL_DNN_AOP",
        }

        base_name = base_mapping.get(model_name, f"{model_name}_AOP")

        # 예측 타입별 모델명 생성
        prediction_suffix = prediction_type.capitalize()
        return f"{base_name}_{prediction_suffix}"

    def _serialize_model(self, model_object):
        """
        모델 객체를 바이너리로 직렬화하고 압축

        Args:
            model_object: 훈련된 모델 객체

        Returns:
            tuple: (compressed_binary_data, compression_type, checksum, original_size)
        """
        import pickle
        import gzip
        import hashlib

        try:
            # 1. 모델 직렬화
            model_binary = pickle.dumps(model_object)
            original_size = len(model_binary)

            # 2. gzip 압축
            compressed_binary = gzip.compress(model_binary)

            # 3. MD5 체크섬 계산
            checksum = hashlib.md5(compressed_binary).hexdigest()

            return compressed_binary, "gzip", checksum, original_size

        except Exception as e:
            self.logger.error(f"Model serialization failed: {e}")
            return None, None, None, None

    def _deserialize_model(self, binary_data, compression_type="gzip"):
        """
        압축된 바이너리 데이터에서 모델 객체 복원

        Args:
            binary_data (bytes): 압축된 모델 바이너리 데이터
            compression_type (str): 압축 타입 ("gzip")

        Returns:
            object: 복원된 모델 객체, 실패 시 None
        """
        import pickle
        import gzip

        try:
            # 1. 압축 해제
            if compression_type == "gzip":
                model_binary = gzip.decompress(binary_data)
            else:
                model_binary = binary_data

            # 2. 모델 객체 복원
            model_object = pickle.loads(model_binary)

            return model_object

        except Exception as e:
            self.logger.error(f"Model deserialization failed: {e}")
            return None

    def _extract_model_metadata(self, model_object, model_name):
        """
        모델 객체에서 메타데이터 추출

        Args:
            model_object: 훈련된 모델 객체
            model_name (str): 모델명

        Returns:
            dict: 모델 메타데이터 (DB 컬럼에 직접 매핑)
        """
        import json

        # 기본 메타데이터
        metadata = {
            "python_version": "unknown",
            "sklearn_version": "unknown",
            "model_class_name": type(model_object).__name__,
            "model_parameters": "{}",
            "feature_names": "[]",
            "feature_count": 0,
        }

        try:
            # Python 버전 확인
            import sys

            metadata["python_version"] = (
                f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
            )

            # sklearn 버전 확인
            import sklearn

            metadata["sklearn_version"] = sklearn.__version__

            # 모델 하이퍼파라미터 추출
            if hasattr(model_object, "get_params"):
                params = model_object.get_params()
                # JSON 직렬화 가능한 형태로 변환
                serializable_params = {}
                for key, value in params.items():
                    try:
                        json.dumps(value)  # 직렬화 가능한지 테스트
                        serializable_params[key] = value
                    except (TypeError, ValueError):
                        serializable_params[key] = str(value)

                metadata["model_parameters"] = json.dumps(
                    serializable_params, ensure_ascii=False
                )

            # 특성 개수 및 이름
            if hasattr(model_object, "n_features_in_"):
                metadata["feature_count"] = int(model_object.n_features_in_)

            if hasattr(model_object, "feature_names_in_"):
                feature_names = (
                    model_object.feature_names_in_.tolist()
                    if hasattr(model_object.feature_names_in_, "tolist")
                    else list(model_object.feature_names_in_)
                )
                metadata["feature_names"] = json.dumps(
                    feature_names, ensure_ascii=False
                )
            else:
                # feature_names_in_이 없는 경우 AOP 기본 feature 명들 사용
                default_feature_names = [
                    "TxFrequencyHz",
                    "TxFocusLocCm",
                    "NumTxElements",
                    "TxpgWaveformStyle",
                    "ProbeNumTxCycles",
                    "ElevAperIndex",
                    "IsTxChannelModulationEn",
                    "IsTxAperModulationEn",
                    "probePitchCm",
                    "probeRadiusCm",
                    "probeElevAperCm0",
                    "probeElevAperCm1",
                    "probeElevFocusRangCm",
                    "probeElevFocusRangCm1",
                ]
                # n_features_in_과 일치하는 만큼만 사용
                if hasattr(model_object, "n_features_in_"):
                    feature_count = int(model_object.n_features_in_)
                    feature_names = default_feature_names[:feature_count]
                    metadata["feature_names"] = json.dumps(
                        feature_names, ensure_ascii=False
                    )
                    self.logger.info(
                        f"Used default feature names for {feature_count} features"
                    )

        except Exception as e:
            self.logger.warning(f"Could not extract full model metadata: {e}")

        return metadata

    def _ensure_model_exists(self, normalized_model_name):
        """
        등록된 모델이 존재하는지 확인하고, 없으면 생성

        Args:
            normalized_model_name (str): 정규화된 모델명

        Returns:
            int: registered_model_id, 실패 시 None
        """
        try:
            # 1. 기존 모델 조회
            model_query = (
                "SELECT model_id FROM ml_registered_models WHERE model_name = ?"
            )
            model_result = self.db.execute_query(model_query, (normalized_model_name,))

            if not model_result.empty:
                return int(model_result.iloc[0]["model_id"])

            # 2. 새 모델 생성
            from datetime import datetime

            insert_query = """
                INSERT INTO ml_registered_models (model_name, creation_time, last_updated_time)
                OUTPUT INSERTED.model_id
                VALUES (?, ?, ?)
            """
            current_time = datetime.now()

            result = self.db.execute_query(
                insert_query,
                (normalized_model_name, current_time, current_time),
                return_type="insert",
            )

            if (
                isinstance(result, dict)
                and "insert_id" in result
                and result["insert_id"] is not None
            ):
                registered_model_id = result["insert_id"]
                self.logger.info(
                    f"Created new registered model: {normalized_model_name} (ID: {registered_model_id})"
                )
                return registered_model_id
            else:
                self.logger.error(
                    f"Failed to create registered model: {normalized_model_name} - result: {result}"
                )
                return None

        except Exception as e:
            self.logger.error(f"Error ensuring model exists: {e}")
            return None

    def _get_next_version_number(self, registered_model_id):
        """
        다음 모델 버전 번호 계산

        Args:
            registered_model_id (int): 등록된 모델 ID

        Returns:
            int: 다음 버전 번호
        """
        try:
            version_query = """
                SELECT COALESCE(MAX(version_number), 0) + 1 as next_version 
                FROM ml_model_versions 
                WHERE model_id = ?
            """
            result = self.db.execute_query(version_query, (registered_model_id,))

            if not result.empty:
                return int(result.iloc[0]["next_version"])
            else:
                return 1

        except Exception as e:
            self.logger.error(f"Error getting next version number: {e}")
            return 1

    def _create_model_version(
        self,
        registered_model_id,
        version_number,
        binary_data,
        compression_type,
        checksum,
        metadata,
        prediction_type,
        stage,
        description,
    ):
        """
        새 모델 버전을 데이터베이스에 생성

        Args:
            registered_model_id (int): 등록된 모델 ID
            version_number (int): 버전 번호
            binary_data (bytes): 압축된 모델 바이너리
            compression_type (str): 압축 타입
            checksum (str): MD5 체크섬
            metadata (dict): 모델 메타데이터
            prediction_type (str): 예측 타입
            stage (str): 모델 스테이지
            description (str): 설명

        Returns:
            int: 생성된 model_version_id, 실패 시 None
        """
        try:
            from datetime import datetime
            import json

            # 메타데이터를 JSON 문자열로 변환
            metadata_json = json.dumps(metadata, ensure_ascii=False)

            # SQL Server에서 VARBINARY 데이터 삽입 시 파라미터 처리
            insert_query = """
                INSERT INTO ml_model_versions (
                    model_id, version_number, run_uuid, model_binary, model_size_bytes,
                    compression_type, model_format, checksum, prediction_type, target_variable, 
                    stage, description, user_id, python_version, sklearn_version, model_class_name, 
                    model_parameters, feature_names, feature_count,
                    creation_time, last_updated_time
                )
                OUTPUT INSERTED.version_id
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """

            current_time = datetime.now()

            # 바이너리 데이터 크기 로그
            self.logger.info(f"Inserting model binary data: {len(binary_data)} bytes")

            result = self.db.execute_query(
                insert_query,
                (
                    registered_model_id,
                    version_number,
                    self.current_run_uuid,
                    binary_data,  # bytes 객체를 직접 전달
                    len(binary_data),  # model_size_bytes - 바이너리 데이터 크기
                    compression_type,
                    "pickle",  # model_format - 직렬화 형식
                    checksum,
                    prediction_type,
                    f"aop_{prediction_type}_value",  # target_variable - 구체적 타겟 변수명
                    stage,
                    description,
                    "system",  # user_id - 시스템 사용자로 설정
                    metadata["python_version"],
                    metadata["sklearn_version"],
                    metadata["model_class_name"],
                    metadata["model_parameters"],
                    metadata["feature_names"],
                    metadata["feature_count"],
                    current_time,
                    current_time,
                ),
                return_type="insert",
            )

            if (
                isinstance(result, dict)
                and "insert_id" in result
                and result["insert_id"] is not None
            ):
                version_id = result["insert_id"]
                self.logger.info(
                    f"Model version created: ID {version_id}, version {version_number}, "
                    f"prediction_type {prediction_type}"
                )
                return version_id
            else:
                self.logger.error(f"Failed to create model version - result: {result}")
                return None

        except Exception as e:
            self.logger.error(f"Error creating model version: {e}")
            return None

    def register_model(
        self,
        model_name,
        model_object,
        training_result,
        prediction_type="intensity",
        stage="None",
        description=None,
    ):
        """
        훈련 완료 후 모델을 데이터베이스에 바이너리로 등록 (옵션 1)

        Args:
            model_name (str): 기본 모델명 (예: "XGBoost")
            model_object: 훈련된 모델 객체
            training_result (dict): 훈련 결과 딕셔너리
            prediction_type (str): 예측 타입 ('intensity', 'power', 'temperature')
            stage (str): 모델 스테이지 ("None", "Staging", "Production")
            description (str): 모델 설명

        Returns:
            int: 생성된 model_version_id, 실패 시 None
        """
        if not self.tracking_enabled or not self.current_run_uuid:
            self.logger.warning(
                "Model registration skipped: tracking disabled or no active run"
            )
            return None

        try:
            # 1. 모델명 정규화 (예측 타입 포함)
            normalized_model_name = self._normalize_model_name(
                model_name, prediction_type
            )

            # 2. 등록된 모델 ID 조회 또는 생성
            registered_model_id = self._ensure_model_exists(normalized_model_name)
            if registered_model_id is None:
                return None

            # 3. 다음 버전 번호 계산
            version_number = self._get_next_version_number(registered_model_id)

            # 4. 모델 바이너리 직렬화
            binary_data, compression_type, checksum, original_size = (
                self._serialize_model(model_object)
            )
            if binary_data is None:
                return None

            # 5. 모델 메타데이터 추출
            metadata = self._extract_model_metadata(model_object, model_name)

            # 6. 새 모델 버전 DB 저장
            version_id = self._create_model_version(
                registered_model_id,
                version_number,
                binary_data,
                compression_type,
                checksum,
                metadata,
                prediction_type,
                stage,
                description,
            )

            if version_id:
                # 7. 훈련 성능 메트릭 저장
                self._log_model_performance(version_id, training_result)

                # 8. 모델 등록 완료 로그
                self.logger.info(
                    f"Model registered in database: {normalized_model_name} v{version_number} (ID: {version_id})"
                )
                return version_id
            else:
                return None

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

    def log_prediction_points(
        self, version_id, target_values, estimation_values, dataset_type="test"
    ):
        """
        Target vs Estimation 데이터 포인트를 ml_prediction_points 테이블에 저장
        (산점도 시각화용)

        Args:
            version_id (int): 모델 버전 ID
            target_values (array-like): 실제 값 배열 (X축)
            estimation_values (array-like): 예측 값 배열 (Y축)
            dataset_type (str): 'train' or 'test'
        """
        if not self.tracking_enabled:
            return

        try:
            import numpy as np

            target_arr = np.array(target_values).flatten()
            estimation_arr = np.array(estimation_values).flatten()

            if len(target_arr) != len(estimation_arr):
                self.logger.error(
                    f"Target and estimation arrays must have the same length: "
                    f"{len(target_arr)} vs {len(estimation_arr)}"
                )
                return

            # 배치 INSERT로 성능 최적화 (단일 커넥션에서 executemany 사용)
            insert_query = """
                INSERT INTO ml_prediction_points 
                    (model_version_id, target_value, estimation_value, data_index, dataset_type)
                VALUES (?, ?, ?, ?, ?)
            """

            # 모든 파라미터를 리스트로 한번에 준비
            batch_params = [
                (
                    version_id,
                    float(target_arr[idx]),
                    float(estimation_arr[idx]),
                    idx,
                    dataset_type,
                )
                for idx in range(len(target_arr))
            ]

            # 단일 커넥션으로 배치 실행
            with self.db.connect() as connection:
                raw_conn = connection.connection
                cursor = raw_conn.cursor()
                cursor.fast_executemany = True
                cursor.executemany(insert_query, batch_params)
                raw_conn.commit()
                cursor.close()

            self.logger.info(
                f"Prediction points logged: {len(target_arr)} points for version_id {version_id} ({dataset_type})"
            )

        except Exception as e:
            self.logger.error(f"Failed to log prediction points: {e}")

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
            # DatabaseManager를 사용하여 DB 연결
            db = get_mlflow_db()

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
    def log_simple_prediction(
        cls, input_features, prediction_result, prediction_type="regression"
    ):
        """예측 결과 로깅 (aop_prediction_logs 테이블에 저장)"""
        try:
            # DatabaseManager를 사용하여 MLflow DB 연결
            db = get_mlflow_db()

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
                (input_features, prediction_result, prediction_type, user_id, 
                 request_source, processing_time_ms)
                VALUES (?, ?, ?, ?, ?, ?)
            """

            # 기본값 설정
            request_source = f"{prediction_type}_calculation"
            processing_time_ms = 0  # 계산 기반이므로 0으로 설정

            username = session.get("username", "system")  # 기본값 설정

            db.execute_query(
                query,
                (
                    input_features_json,
                    prediction_json,
                    prediction_type,
                    username,
                    request_source,
                    processing_time_ms,
                ),
            )
            logging.info(f"Prediction logged for prediction_type: {prediction_type}")
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

    def load_model_from_db(
        self, model_name, prediction_type="intensity", version=None, stage="Production"
    ):
        """
        데이터베이스에서 모델을 로드

        Args:
            model_name (str): 기본 모델명 (예: "XGBoost")
            prediction_type (str): 예측 타입 ('intensity', 'power', 'temperature')
            version (int, optional): 특정 버전, None이면 최신 버전
            stage (str): 모델 스테이지 ("Production", "Staging", "None")

        Returns:
            object: 로드된 모델 객체, 실패 시 None
        """
        try:
            # 1. 정규화된 모델명 생성
            normalized_model_name = self._normalize_model_name(
                model_name, prediction_type
            )

            # 2. 모델 버전 조회
            if version is not None:
                # 특정 버전 조회
                query = """
                    SELECT mv.model_binary, mv.compression_type, mv.checksum
                    FROM ml_model_versions mv
                    JOIN ml_registered_models rm ON mv.model_id = rm.model_id
                    WHERE rm.model_name = ? AND mv.version_number = ? AND mv.prediction_type = ?
                """
                params = (normalized_model_name, version, prediction_type)
            else:
                # 스테이지별 최신 버전 조회
                query = """
                    SELECT TOP 1 mv.model_binary, mv.compression_type, mv.checksum
                    FROM ml_model_versions mv
                    JOIN ml_registered_models rm ON mv.model_id = rm.model_id
                    WHERE rm.model_name = ? AND mv.stage = ? AND mv.prediction_type = ?
                    ORDER BY mv.version_number DESC
                """
                params = (normalized_model_name, stage, prediction_type)

            result = self.db.execute_query(query, params)

            if result.empty:
                self.logger.warning(
                    f"No model found: {normalized_model_name}, prediction_type: {prediction_type}, "
                    f"version: {version}, stage: {stage}"
                )
                return None

            # 3. 모델 바이너리 데이터 추출
            model_data = result.iloc[0]
            binary_data = model_data["model_binary"]
            compression_type = model_data["compression_type"]
            checksum = model_data["checksum"]

            # 4. 체크섬 검증
            if not self._verify_checksum(binary_data, checksum):
                self.logger.error(
                    f"Checksum verification failed for model: {normalized_model_name}"
                )
                return None

            # 5. 모델 객체 복원
            model_object = self._deserialize_model(binary_data, compression_type)

            if model_object is not None:
                self.logger.info(
                    f"Model loaded from database: {normalized_model_name}, "
                    f"prediction_type: {prediction_type}"
                )

            return model_object

        except Exception as e:
            self.logger.error(f"Failed to load model from database: {e}")
            return None

    def load_best_model(self, prediction_type="intensity", stage="Production"):
        """
        예측 타입에 따라 성능이 가장 좋은 모델을 자동으로 로드

        Args:
            prediction_type (str): 예측 타입 ('intensity', 'power', 'temperature')
            stage (str): 모델 스테이지 ("Production", "Staging", "None")

        Returns:
            object: 로드된 최고 성능 모델 객체, 실패 시 None
        """
        try:
            # 1. 해당 예측 타입의 베스트 모델 조회
            query = """
                SELECT TOP 1 
                    rm.model_name,
                    mv.version_number,
                    mv.version_id,
                    mv.model_binary, 
                    mv.compression_type, 
                    mv.checksum,
                    mp.metric_value as test_score
                FROM ml_registered_models rm
                JOIN ml_model_versions mv ON rm.model_id = mv.model_id
                JOIN ml_model_performance mp ON mv.version_id = mp.model_version_id
                WHERE mv.prediction_type = ? 
                    AND mv.stage = ?
                    AND mp.metric_name = 'test_score'
                ORDER BY mp.metric_value DESC
            """

            result = self.db.execute_query(query, (prediction_type, stage))

            if result.empty:
                self.logger.warning(
                    f"No model found for prediction_type: {prediction_type}, stage: {stage}"
                )
                return None

            # 2. 최고 성능 모델 정보 추출
            best_model = result.iloc[0]
            model_name = best_model["model_name"]
            version_number = best_model["version_number"]
            version_id = best_model["version_id"]
            binary_data = best_model["model_binary"]
            compression_type = best_model["compression_type"]
            checksum = best_model["checksum"]
            test_score = best_model["test_score"]

            # 3. 체크섬 검증
            if not self._verify_checksum(binary_data, checksum):
                self.logger.error(
                    f"Checksum verification failed for best model: {model_name} v{version_number}"
                )
                return None

            # 4. 모델 객체 복원
            model_object = self._deserialize_model(binary_data, compression_type)

            if model_object is not None:
                self.logger.info(
                    f"Best model loaded: {model_name} v{version_number}, "
                    f"prediction_type: {prediction_type}, test_score: {test_score:.4f}"
                )

                # 모델 정보와 함께 반환 (튜플 형태)
                return {
                    "model": model_object,
                    "model_name": model_name,
                    "version_number": version_number,
                    "version_id": version_id,
                    "test_score": test_score,
                    "prediction_type": prediction_type,
                }

            return None

        except Exception as e:
            self.logger.error(f"Failed to load best model: {e}")
            return None

    def _verify_checksum(self, binary_data, expected_checksum):
        """
        바이너리 데이터의 체크섬 검증

        Args:
            binary_data (bytes): 바이너리 데이터
            expected_checksum (str): 예상 체크섬

        Returns:
            bool: 검증 성공 여부
        """
        import hashlib

        try:
            actual_checksum = hashlib.md5(binary_data).hexdigest()
            return actual_checksum == expected_checksum
        except Exception as e:
            self.logger.error(f"Checksum verification error: {e}")
            return False

    def list_available_models(self, prediction_type=None):
        """
        사용 가능한 모델 목록 조회

        Args:
            prediction_type (str, optional): 특정 예측 타입으로 필터링

        Returns:
            pandas.DataFrame: 모델 목록 정보
        """
        try:
            if prediction_type:
                query = """
                    SELECT 
                        rm.model_name,
                        mv.version_number,
                        mv.prediction_type,
                        mv.stage,
                        mv.description,
                        mv.creation_time
                    FROM ml_registered_models rm
                    JOIN ml_model_versions mv ON rm.model_id = mv.model_id
                    WHERE mv.prediction_type = ?
                    ORDER BY rm.model_name, mv.version_number DESC
                """
                params = (prediction_type,)
            else:
                query = """
                    SELECT 
                        rm.model_name,
                        mv.version_number,
                        mv.prediction_type,
                        mv.stage,
                        mv.description,
                        mv.creation_time
                    FROM ml_registered_models rm
                    JOIN ml_model_versions mv ON rm.model_id = mv.model_id
                    ORDER BY rm.model_name, mv.prediction_type, mv.version_number DESC
                """
                params = ()

            result = self.db.execute_query(query, params)
            return result

        except Exception as e:
            self.logger.error(f"Failed to list available models: {e}")
            return None
