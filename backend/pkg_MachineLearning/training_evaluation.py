from sklearn.model_selection import cross_validate
import numpy as np
import os, re, sys
import joblib
import sklearn
import logging
from datetime import datetime

logger = logging.getLogger("ModelEvaluator")


class ModelEvaluator:
    """
    1) 모델을 cross_validate algorithm
    2) train / train_validation score 출력하는 algorithm
    """

    def __init__(self, model, train_input, train_target, test_input, test_target):
        self.model = model
        self.train_input = train_input
        self.train_target = train_target
        self.test_input = test_input
        self.test_target = test_target
        self.prediction = None

    def evaluate_model(self):
        # 표본 수가 fold 수보다 적으면 cross_validate 가 런타임 실패한다.
        n_samples = len(self.train_target)
        if n_samples < 2:
            raise ValueError(
                f"학습 표본이 부족합니다(train={n_samples}). 최소 2개 이상 필요합니다."
            )
        n_splits = max(2, min(5, n_samples))

        # Cross validation 수행
        scores = cross_validate(
            self.model,
            self.train_input,
            self.train_target,
            return_train_score=True,
            n_jobs=-1,
            cv=n_splits,
        )

        # CV 결과 출력
        train_cv_score, val_cv_score = self.print_scores(scores)

        # 최종 테스트 세트 평가
        test_score, test_predictions = self.evaluate_test_set()

        # 결과 반환
        return {
            "train_cv_score": float(train_cv_score),
            "validation_cv_score": float(val_cv_score),
            "test_score": float(test_score),
            "model_name": self.model.__class__.__name__,
            "cv_folds": len(scores["train_score"]),
        }

    def print_scores(self, scores):
        train_score_mean = self.calculate_mean_score(scores["train_score"])
        test_score_mean = self.calculate_mean_score(scores["test_score"])
        return train_score_mean, test_score_mean

    @staticmethod
    def calculate_mean_score(scores):
        return np.round(np.mean(scores), 3)

    def evaluate_test_set(self):
        # 모델이 cross_validate에서 이미 훈련되었지만, 최종 모델을 위해 전체 훈련 데이터로 재훈련
        self.model.fit(self.train_input, self.train_target)

        # 테스트 세트 예측 및 점수 계산
        test_predictions = self.model.predict(self.test_input)
        test_score = self.model.score(self.test_input, self.test_target)
        test_score_rounded = np.round(test_score, 3)

        # 예측값 저장 (반올림)
        self.prediction = np.round(test_predictions, 2)

        return test_score_rounded, test_predictions

    def modelSave(self, logical_name: str = None):
        """학습된 모델을 ML_Models 디렉터리에 저장한다.

        Args:
            logical_name: 설정상의 논리 모델명(예: PolynomialFeatures_with_linear_regression).
                생략하면 클래스명을 사용한다. 클래스명만 쓰면 서로 다른 논리 모델이
                같은 파일명을 공유해 이전 아티팩트를 덮어쓴다.
        """
        # 상대 경로 대신 절대 경로 사용
        current_dir = os.path.dirname(os.path.abspath(__file__))
        model_dir = os.path.join(current_dir, "..", "ML_Models")

        if not os.path.exists(model_dir):
            os.makedirs(model_dir, exist_ok=True)

        python_version = f"{sys.version_info.major}{sys.version_info.minor}"
        sklearn_version = sklearn.__version__
        base_name = logical_name or self.model.__class__.__name__
        safe_name = re.sub(r"[^0-9A-Za-z._-]+", "_", base_name).strip("_")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # 파일명 생성 (논리 모델명 + 타임스탬프로 덮어쓰기 방지)
        filename = (
            f"{safe_name}_{timestamp}_python{python_version}_sklearn{sklearn_version}.pkl"
        )
        filepath = os.path.join(model_dir, filename)

        # 모델 저장
        try:
            joblib.dump(self.model, filepath)
            logger.info(f"Model saved: {filepath}")
        except Exception as e:
            logger.error(f"Model save failed: {e}")
            raise
