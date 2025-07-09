import os
import configparser


class MachineLearning:
    def __init__(self, config_path=None):
        if config_path is None:
            config_path = os.path.join(
                os.path.dirname(__file__), "..", "AOP_config.cfg"
            )
        self.config_path = os.path.abspath(config_path)
        self.config = configparser.ConfigParser()
        self.config.read(self.config_path, encoding="utf-8")

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
