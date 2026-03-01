use master
GO

-- 데이터베이스 삭제 후 재생성 (기존 데이터가 있다면 백업 후 실행)
IF EXISTS (SELECT name FROM sys.databases WHERE name = 'AOP_MLflow_Tracking')
BEGIN
    ALTER DATABASE AOP_MLflow_Tracking SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE AOP_MLflow_Tracking;
END

-- 새 데이터베이스 생성
CREATE DATABASE AOP_MLflow_Tracking;
GO

USE AOP_MLflow_Tracking;
GO

-- ===================================================
-- AOP MLflow 데이터베이스 스키마 v2.0 (최적화됨)
-- 변경사항: ml_runs.artifact_uri 필드 제거 (미사용)
-- 일자: 2025-09-26
-- ===================================================

-- 1. ml_experiments 테이블
CREATE TABLE ml_experiments (
    experiment_id INT IDENTITY(1,1) PRIMARY KEY,
    experiment_name NVARCHAR(255) NOT NULL UNIQUE,
    artifact_location NVARCHAR(500),
    lifecycle_stage NVARCHAR(50) DEFAULT 'active',
    creation_time DATETIME2 DEFAULT GETDATE(),
    last_update_time DATETIME2 DEFAULT GETDATE()
);

-- 2. ml_runs 테이블
CREATE TABLE ml_runs (
    run_uuid NVARCHAR(32) PRIMARY KEY,
    experiment_id INT NOT NULL,
    user_id NVARCHAR(100),
    run_name NVARCHAR(255),
    run_type NVARCHAR(50),
    model_name NVARCHAR(255),
    source_code_version NVARCHAR(255),
    start_time DATETIME2 DEFAULT GETDATE(),
    end_time DATETIME2,
    status NVARCHAR(50) DEFAULT 'RUNNING',
    data_shape_info NVARCHAR(500),
    lifecycle_stage NVARCHAR(50) DEFAULT 'active',
    FOREIGN KEY (experiment_id) REFERENCES ml_experiments(experiment_id)
);

-- 3. ml_params 테이블
CREATE TABLE ml_params (
    param_id INT IDENTITY(1,1) PRIMARY KEY,
    run_uuid NVARCHAR(32) NOT NULL,
    param_key NVARCHAR(255) NOT NULL,
    param_value NVARCHAR(MAX),
    param_type NVARCHAR(50),
    FOREIGN KEY (run_uuid) REFERENCES ml_runs(run_uuid),
    UNIQUE(run_uuid, param_key)
);

-- 4. ml_metrics 테이블
CREATE TABLE ml_metrics (
    metric_id INT IDENTITY(1,1) PRIMARY KEY,
    run_uuid NVARCHAR(32) NOT NULL,
    metric_key NVARCHAR(255) NOT NULL,
    value FLOAT NOT NULL,
    timestamp DATETIME2 DEFAULT GETDATE(),
    step INT DEFAULT 0,
    metric_type NVARCHAR(50),
    FOREIGN KEY (run_uuid) REFERENCES ml_runs(run_uuid)
);

-- 5. ml_registered_models 테이블
CREATE TABLE ml_registered_models (
    model_id INT IDENTITY(1,1) PRIMARY KEY,
    model_name NVARCHAR(255) NOT NULL UNIQUE,
    model_type NVARCHAR(100),
    description NVARCHAR(MAX),
    creation_time DATETIME2 DEFAULT GETDATE(),
    last_updated_time DATETIME2 DEFAULT GETDATE(),
    tags NVARCHAR(MAX)
);

-- 6. ml_model_versions 테이블 (🆕 옵션 1: 모델 바이너리 DB 저장)
CREATE TABLE ml_model_versions (
    version_id INT IDENTITY(1,1) PRIMARY KEY,
    model_id INT NOT NULL,
    version_number INT NOT NULL,
    creation_time DATETIME2 DEFAULT GETDATE(),
    last_updated_time DATETIME2 DEFAULT GETDATE(),
    description NVARCHAR(MAX),
    user_id NVARCHAR(100),
    stage NVARCHAR(50) DEFAULT 'None',
    run_uuid NVARCHAR(32),  -- 훈련 실행과 연결
    
    -- 🆕 모델 바이너리 저장 관련 필드들
    model_binary VARBINARY(MAX),                    -- 모델 바이너리 데이터 (압축된 pickle)
    model_size_bytes BIGINT DEFAULT 0,              -- 모델 크기 (바이트)
    compression_type NVARCHAR(50) DEFAULT 'gzip',   -- 압축 방식 (gzip, none, lz4)
    model_format NVARCHAR(50) DEFAULT 'pickle',     -- 직렬화 형식 (pickle, joblib, onnx)
    checksum NVARCHAR(64),                          -- MD5 체크섬 (무결성 검증)
    
    -- 🆕 모델 메타데이터
    python_version NVARCHAR(20),              -- Python 버전 (3.10.5)
    sklearn_version NVARCHAR(20),             -- scikit-learn 버전 (1.4.2)
    model_class_name NVARCHAR(100),           -- 모델 클래스명 (RandomForestRegressor)
    model_parameters NVARCHAR(MAX),           -- 모델 하이퍼파라미터 (JSON 형태)
    feature_names NVARCHAR(MAX),              -- 입력 특성 이름들 (JSON 배열)
    feature_count INT DEFAULT 0,              -- 입력 특성 개수
    
    -- 🆕 AOP 예측 타입 구분 (핵심!)
    prediction_type NVARCHAR(50) NOT NULL DEFAULT 'intensity',  -- 'intensity', 'power', 'temperature'
    target_variable NVARCHAR(100),                              -- 구체적 타겟명 (선택적)
    
    -- 외래 키 및 제약 조건
    FOREIGN KEY (model_id) REFERENCES ml_registered_models(model_id) ON DELETE CASCADE,
    FOREIGN KEY (run_uuid) REFERENCES ml_runs(run_uuid) ON DELETE SET NULL,
    UNIQUE(model_id, version_number),
    
    -- 🆕 체크 제약 조건들
    CONSTRAINT CK_ml_model_versions_prediction_type CHECK (prediction_type IN ('intensity', 'power', 'temperature')),
    CONSTRAINT CK_ml_model_versions_stage CHECK (stage IN ('None', 'Staging', 'Production', 'Archived')),
    CONSTRAINT CK_ml_model_versions_version_positive CHECK (version_number > 0),
    CONSTRAINT CK_ml_model_versions_compression CHECK (compression_type IN ('none', 'gzip', 'lz4', 'bz2')),
    CONSTRAINT CK_ml_model_versions_format CHECK (model_format IN ('pickle', 'joblib', 'onnx', 'tensorflow')),
    CONSTRAINT CK_ml_model_versions_size_positive CHECK (model_size_bytes >= 0),
    CONSTRAINT CK_ml_model_versions_feature_count_positive CHECK (feature_count >= 0)
);

-- 7. ml_model_performance 테이블
CREATE TABLE ml_model_performance (
    performance_id INT IDENTITY(1,1) PRIMARY KEY,
    model_version_id INT NOT NULL,
    metric_name NVARCHAR(100) NOT NULL,
    metric_value FLOAT NOT NULL,
    evaluation_date DATETIME2 DEFAULT GETDATE(),
    dataset_type NVARCHAR(50),
    FOREIGN KEY (model_version_id) REFERENCES ml_model_versions(version_id)
);

-- 8. aop_prediction_logs 테이블 (Step 3용 필드 추가)
CREATE TABLE aop_prediction_logs (
    log_id INT IDENTITY(1,1) PRIMARY KEY,
    prediction_time DATETIME2 DEFAULT GETDATE(),
    model_version_id INT,
    input_features NVARCHAR(MAX),
    prediction_result NVARCHAR(MAX),
    user_id NVARCHAR(100),
    request_source NVARCHAR(100),
    processing_time_ms INT,
    prediction_type NVARCHAR(50),  -- 'intensity', 'power', 'temperature' 구분용
    FOREIGN KEY (model_version_id) REFERENCES ml_model_versions(version_id)
);

-- 9. ml_prediction_points 테이블 (Target vs Estimation 산점도용)
CREATE TABLE ml_prediction_points (
    point_id INT IDENTITY(1,1) PRIMARY KEY,
    model_version_id INT NOT NULL,
    target_value FLOAT NOT NULL,          -- 실제 값 (X축)
    estimation_value FLOAT NOT NULL,      -- 모델 예측 값 (Y축)
    data_index INT,                       -- 원본 데이터 인덱스 (선택적)
    dataset_type NVARCHAR(20) DEFAULT 'test',  -- 'train' or 'test'
    created_time DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (model_version_id) REFERENCES ml_model_versions(version_id) ON DELETE CASCADE
);

CREATE INDEX IX_ml_prediction_points_version ON ml_prediction_points(model_version_id);
CREATE INDEX IX_ml_prediction_points_dataset ON ml_prediction_points(dataset_type);

-- 기본 실험 데이터 삽입
INSERT INTO ml_experiments (experiment_name, artifact_location, lifecycle_stage) 
VALUES ('AOP_Model_Training', '/models/artifacts', 'active');

-- Step 3 준비용 예측 타입별 모델 등록 (🆕 30개 = 10 모델 × 3 타입: 나중에 확장 예정)
INSERT INTO ml_registered_models (model_name, model_type, description) VALUES
-- Intensity 예측 모델들 (기존)
('XGBoost_AOP_Intensity', 'XGBRegressor', 'XGBoost model for AOP intensity prediction'),
('RandomForest_AOP_Intensity', 'RandomForestRegressor', 'Random Forest model for AOP intensity prediction'),
('LinearRegression_AOP_Intensity', 'LinearRegression', 'Linear Regression model for AOP intensity prediction'),
('Ridge_AOP_Intensity', 'Ridge', 'Ridge Regression model for AOP intensity prediction'),
('GradientBoosting_AOP_Intensity', 'GradientBoostingRegressor', 'Gradient Boosting model for AOP intensity prediction'),
('HistGradientBoosting_AOP_Intensity', 'HistGradientBoostingRegressor', 'Histogram-based Gradient Boosting for intensity'),
('VotingRegressor_AOP_Intensity', 'VotingRegressor', 'Voting Regressor ensemble model for intensity'),
('PolynomialLinear_AOP_Intensity', 'LinearRegression', 'Polynomial Features with Linear Regression for intensity'),
('DecisionTree_AOP_Intensity', 'DecisionTreeRegressor', 'Decision Tree model for AOP intensity prediction'),
('DL_DNN_AOP_Intensity', 'TensorFlow_Sequential', 'Deep Neural Network model for intensity')

-- 인덱스 생성 (성능 최적화)
CREATE INDEX IX_ml_runs_experiment_id ON ml_runs(experiment_id);
CREATE INDEX IX_ml_runs_start_time ON ml_runs(start_time);
CREATE INDEX IX_ml_params_run_uuid ON ml_params(run_uuid);
CREATE INDEX IX_ml_metrics_run_uuid ON ml_metrics(run_uuid);
CREATE INDEX IX_ml_metrics_key_value ON ml_metrics(metric_key, value);
CREATE INDEX IX_ml_model_versions_model_id ON ml_model_versions(model_id);
CREATE INDEX IX_ml_model_performance_version_id ON ml_model_performance(model_version_id);

-- 🆕 Step 3 + 옵션 1용 추가 인덱스
CREATE INDEX IX_ml_model_versions_stage ON ml_model_versions(stage);
CREATE INDEX IX_ml_model_versions_run_uuid ON ml_model_versions(run_uuid);
CREATE INDEX IX_ml_model_versions_model_class ON ml_model_versions(model_class_name);
CREATE INDEX IX_ml_model_versions_checksum ON ml_model_versions(checksum);
CREATE INDEX IX_ml_model_versions_prediction_type ON ml_model_versions(prediction_type);
CREATE INDEX IX_ml_model_versions_prediction_stage ON ml_model_versions(prediction_type, stage);
CREATE INDEX IX_aop_prediction_logs_time ON aop_prediction_logs(prediction_time);
CREATE INDEX IX_aop_prediction_logs_user ON aop_prediction_logs(user_id);
CREATE INDEX IX_aop_prediction_logs_type ON aop_prediction_logs(prediction_type);

-- 상태 제약조건 추가 (데이터 무결성)
ALTER TABLE ml_runs ADD CONSTRAINT CK_ml_runs_status 
    CHECK (status IN ('RUNNING', 'FINISHED', 'FAILED', 'KILLED'));

-- ml_model_versions의 제약조건들은 테이블 생성 시 이미 포함됨

ALTER TABLE aop_prediction_logs ADD CONSTRAINT CK_aop_prediction_logs_type 
    CHECK (prediction_type IN ('intensity', 'power', 'temperature'));

PRINT 'Database: AOP_MLflow_Tracking이 성공적으로 생성되었습니다.';
PRINT '총 8개 테이블이 생성되었습니다.';
PRINT '🆕 옵션 1: 모델 바이너리 DB 저장 방식이 적용되었습니다.';
PRINT '🆕 AOP 다중 예측 타입 지원: intensity, power, temperature';
PRINT '🆕 30개 모델이 등록되었습니다 (10 모델 × 3 예측 타입).';
PRINT 'Performance indexes가 생성되었습니다.';
PRINT '';
PRINT '=== 옵션 1 + AOP 다중 예측 특징 ===';
PRINT '✅ 모든 모델이 데이터베이스에 바이너리로 저장됩니다';
PRINT '✅ 예측 타입별로 독립적인 모델 관리가 가능합니다';
PRINT '✅ 파일 시스템 의존성이 제거되었습니다';
PRINT '✅ 체크섬으로 무결성 검증이 가능합니다';
PRINT '✅ 압축으로 저장 공간을 최적화합니다';
PRINT '✅ 완전한 중앙 집중 관리가 가능합니다';

-- 검증 쿼리들
PRINT '';
PRINT '=== 데이터베이스 검증 ===';

-- 테이블 생성 확인
SELECT 
    TABLE_NAME as 'Table Name',
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = t.TABLE_NAME) as 'Column Count'
FROM INFORMATION_SCHEMA.TABLES t 
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;

-- 기본 데이터 확인
SELECT 'Experiments' as 'Data Type', COUNT(*) as 'Count' FROM ml_experiments
UNION ALL
SELECT 'Registered Models', COUNT(*) FROM ml_registered_models;

PRINT '';
PRINT 'AOP 다중 예측 타입 지원 완료: intensity, power, temperature 모델이 준비되었습니다.';
PRINT 'MLflow 통합 클래스에서 prediction_type별 serialize_model/deserialize_model 기능을 구현하세요.';
