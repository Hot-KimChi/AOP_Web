from pkg_MeasSetGen.data_inout import loadfile
from pkg_MeasSetGen.remove_duplicate import RemoveDuplicate
from pkg_MeasSetGen.param_gen import ParamGen
from pkg_MeasSetGen.predictML import PredictML
from pkg_MeasSetGen.create_groupidx import GroupIdx
from pkg_MeasSetGen.data_inout import DataOut
import pandas as pd
import logging


class MeasSetGen:
    """
    MeasSetGeneration 버튼이 눌렸을 경우, 해당 클래스가 실행.
    1) select & Load 버튼: _get_sequence 함수 실행
    2) To MS-SQL / To Excel / protocol check
    """

    def __init__(self, database, probeId, probeName, file_path):
        self.database = database
        self.probeId = probeId
        self.probeName = probeName
        self.file_path = file_path

        # self.sql = SQL(username, password, self.database)

    def generate(self):
        try:
            # Step 1: 파일 로드
            raw_data = loadfile(self.file_path)
            if raw_data.empty:
                raise ValueError(
                    "Loaded file contains no data or is not properly formatted."
                )
            logging.info("Raw data successfully loaded.")

            # Step 2: 중복 데이터 제거 및 인덱스 생성
            remove_duplicate = RemoveDuplicate(raw_data)
            df_total = remove_duplicate.remove_duplicate()

            group_idx = GroupIdx(probeId=self.probeId, database=self.database)
            df_total = group_idx.createGroupIdx(df_total)
            selected_df = group_idx.updateDuplicate(df_total)

            logging.info("Duplicate data processing completed.")

            # Step 3: Parameter 생성
            param_gen = ParamGen(
                data=selected_df, probeid=self.probeId, probename=self.probeName
            )
            gen_df = param_gen.gen_sequence()
            logging.info("Parameter generation completed.")

            # Step 4: 머신러닝 예측
            predictionML = PredictML(
                df=gen_df,
                probeId=self.probeId,
                probeName=self.probeName,
                database=self.database,
            )
            gen_df_inten = predictionML.intensity_zt_est()
            gen_df_power = predictionML.power_PRF_est()
            gen_df_temp = predictionML.temperature_PRF_est()

            df_total = pd.concat(
                [gen_df_inten, gen_df_power, gen_df_temp], axis=0, ignore_index=True
            )
            df_total = df_total.fillna(-1)
            logging.info("Machine learning predictions completed.")

            # Step 5: 데이터 저장
            dataout = DataOut(
                case=0,
                database=self.database,
                probename=self.probeName,
                df1=df_total,
            )
            dataout.make_dir()
            csv_data = dataout.save_excel()
            logging.info(f"Generated file saved as CSV_file.")

            return csv_data

        except Exception as e:
            logging.error(f"Error during MeasSetGen.generate: {str(e)}", exc_info=True)
            raise RuntimeError(f"Failed to generate MeasSet: {str(e)}")
