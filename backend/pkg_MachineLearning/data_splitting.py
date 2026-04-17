from sklearn.model_selection import train_test_split


def dataSplit(data, target, test_size=0.2, random_state=42):
    """데이터를 학습/테스트 세트로 분할합니다.

    Args:
        data: 입력 특성
        target: 타겟 값
        test_size: 테스트 세트 비율
        random_state: 재현성을 위한 랜덤 시드
    """
    train_input, test_input, train_target, test_target = train_test_split(
        data, target, test_size=test_size, random_state=random_state
    )
    return train_input, test_input, train_target, test_target
