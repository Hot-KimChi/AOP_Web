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
    artifact_uri NVARCHAR(500),
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

-- 6. ml_model_versions 테이블 (run_id -> run_uuid로 일관성 개선)
CREATE TABLE ml_model_versions (
    version_id INT IDENTITY(1,1) PRIMARY KEY,
    model_id INT NOT NULL,
    version_number INT NOT NULL,
    creation_time DATETIME2 DEFAULT GETDATE(),
    last_updated_time DATETIME2 DEFAULT GETDATE(),
    description NVARCHAR(MAX),
    user_id NVARCHAR(100),
    stage NVARCHAR(50) DEFAULT 'None',
    source NVARCHAR(500),
    run_uuid NVARCHAR(32),  -- run_id에서 run_uuid로 변경 (일관성)
    file_path NVARCHAR(500),
    FOREIGN KEY (model_id) REFERENCES ml_registered_models(model_id),
    FOREIGN KEY (run_uuid) REFERENCES ml_runs(run_uuid),  -- 외래키 관계 추가
    UNIQUE(model_id, version_number)
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

-- 기본 실험 데이터 삽입
INSERT INTO ml_experiments (experiment_name, artifact_location, lifecycle_stage) 
VALUES ('AOP_Model_Training', '/models/artifacts', 'active');

-- Step 3 준비용 기본 모델 등록
INSERT INTO ml_registered_models (model_name, model_type, description) VALUES
('XGBoost_AOP', 'XGBRegressor', 'XGBoost model for AOP intensity prediction'),
('RandomForest_AOP', 'RandomForestRegressor', 'Random Forest model for AOP intensity prediction'),
('LinearRegression_AOP', 'LinearRegression', 'Linear Regression model for AOP intensity prediction'),
('Ridge_AOP', 'Ridge', 'Ridge Regression model for AOP intensity prediction');

-- 인덱스 생성 (성능 최적화)
CREATE INDEX IX_ml_runs_experiment_id ON ml_runs(experiment_id);
CREATE INDEX IX_ml_runs_start_time ON ml_runs(start_time);
CREATE INDEX IX_ml_params_run_uuid ON ml_params(run_uuid);
CREATE INDEX IX_ml_metrics_run_uuid ON ml_metrics(run_uuid);
CREATE INDEX IX_ml_metrics_key_value ON ml_metrics(metric_key, value);
CREATE INDEX IX_ml_model_versions_model_id ON ml_model_versions(model_id);
CREATE INDEX IX_ml_model_performance_version_id ON ml_model_performance(model_version_id);

-- Step 3용 추가 인덱스
CREATE INDEX IX_ml_model_versions_stage ON ml_model_versions(stage);
CREATE INDEX IX_ml_model_versions_run_uuid ON ml_model_versions(run_uuid);
CREATE INDEX IX_aop_prediction_logs_time ON aop_prediction_logs(prediction_time);
CREATE INDEX IX_aop_prediction_logs_user ON aop_prediction_logs(user_id);
CREATE INDEX IX_aop_prediction_logs_type ON aop_prediction_logs(prediction_type);

-- 상태 제약조건 추가 (데이터 무결성)
ALTER TABLE ml_runs ADD CONSTRAINT CK_ml_runs_status 
    CHECK (status IN ('RUNNING', 'FINISHED', 'FAILED', 'KILLED'));

ALTER TABLE ml_model_versions ADD CONSTRAINT CK_ml_model_versions_stage 
    CHECK (stage IN ('None', 'Staging', 'Production', 'Archived'));

ALTER TABLE aop_prediction_logs ADD CONSTRAINT CK_aop_prediction_logs_type 
    CHECK (prediction_type IN ('intensity', 'power', 'temperature'));

PRINT 'Database: AOP_MLflow_Tracking이 성공적으로 생성되었습니다.';
PRINT '총 8개 테이블이 생성되었습니다.';
PRINT 'Step 3를 위한 기본 모델 데이터가 삽입되었습니다.';
PRINT 'Performance indexes가 생성되었습니다.';

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
PRINT 'Step 3 준비 완료: 모델 등록 및 예측 로깅 기능을 구현할 수 있습니다.';
