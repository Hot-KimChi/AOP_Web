from sklearn.preprocessing import StandardScaler, PolynomialFeatures


def get_preprocessing_steps(model_type: str):
    """모델 종류에 맞는 sklearn 전처리 단계를 반환한다.

    전처리를 학습 시점에만 적용하고 모델과 분리해 저장하면 추론 시 동일한 변환이
    적용되지 않아 예측이 어긋난다. 따라서 전처리는 Pipeline 으로 모델과 함께
    저장되도록 단계 목록 형태로 제공한다.
    """
    name = (model_type or "").lower()
    if "polynomialfeatures" in name or "ridge" in name:
        return [
            ("poly", PolynomialFeatures(degree=2, include_bias=False)),
            ("scaler", StandardScaler()),
        ]
    return []


class DataPreprocess:
    """
    Data pre-processing: train_input and test_input
    """

    def __init__(self, train_input, test_input):
        self.train_input = train_input
        self.test_input = test_input

    def preprocess(self, model_type="other", scaler=None):
        """입력 데이터를 그대로 반환한다.

        과거에는 이 메서드가 다항 확장·스케일링을 직접 수행했으나, 변환기가 모델과
        함께 저장되지 않아 추론 경로에서 동일한 변환이 재현되지 않았다. 이제 변환은
        `get_preprocessing_steps()` 가 만든 Pipeline 단계로 모델에 포함된다.
        """
        return self.train_input, self.test_input
