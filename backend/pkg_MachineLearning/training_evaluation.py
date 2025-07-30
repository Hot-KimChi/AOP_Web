from sklearn.model_selection import cross_validate
import numpy as np
import os, sys
import joblib
import sklearn


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
        # Cross validation 수행
        scores = cross_validate(
            self.model,
            self.train_input,
            self.train_target,
            return_train_score=True,
            n_jobs=-1,
            cv=5,  # 명시적으로 fold 수 지정
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
        print(f"\n{self.model.__class__.__name__} - Train R^2:", train_score_mean)
        print(f"{self.model.__class__.__name__} - Validation R^2:", test_score_mean)
        return train_score_mean, test_score_mean

    @staticmethod
    def calculate_mean_score(scores):
        return np.round_(np.mean(scores), 3)

    def evaluate_test_set(self):
        # 모델이 cross_validate에서 이미 훈련되었지만, 최종 모델을 위해 전체 훈련 데이터로 재훈련
        self.model.fit(self.train_input, self.train_target)

        # 테스트 세트 예측 및 점수 계산
        test_predictions = self.model.predict(self.test_input)
        test_score = self.model.score(self.test_input, self.test_target)
        test_score_rounded = np.round_(test_score, 3)

        print(f"{self.model.__class__.__name__} - Test R^2:", test_score_rounded)

        # 예측값 저장 (반올림)
        self.prediction = np.round_(test_predictions, 2)

        return test_score_rounded, test_predictions

    def modelSave(self):
        # 상대 경로 대신 절대 경로 사용
        current_dir = os.path.dirname(os.path.abspath(__file__))
        model_dir = os.path.join(current_dir, "..", "ML_Models")

        if not os.path.exists(model_dir):
            os.makedirs(model_dir, exist_ok=True)

        python_version = f"{sys.version_info.major}{sys.version_info.minor}"
        sklearn_version = sklearn.__version__
        model_name = self.model.__class__.__name__

        # 파일명 생성
        filename = (
            f"{model_name}_v1_python{python_version}_sklearn{sklearn_version}.pkl"
        )
        filepath = os.path.join(model_dir, filename)

        # 모델 저장
        print(
            f"Saving model: {model_name} with Python {python_version} and scikit-learn {sklearn_version}"
        )
        print(f"Model save path: {filepath}")

        try:
            joblib.dump(self.model, filepath)
            print(f"Model saved successfully: {filename}")
        except Exception as e:
            print(f"Error saving model: {str(e)}")
            raise

    # def train_dnn_model(self):
    #     from tensorflow import keras

    #     early_stop = keras.callbacks.EarlyStopping(monitor="val_loss", patience=10)
    #     history = self.model.fit(
    #         self.train_input,
    #         self.train_target,
    #         epochs=1000,
    #         batch_size=3,
    #         validation_split=0.2,
    #         verbose=0,
    #         callbacks=[early_stop],
    #     )
    #     prediction = self.model.predict(self.test_input).flatten()
    #     return history, prediction
