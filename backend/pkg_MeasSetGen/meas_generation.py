from pkg_MeasSetGen.data_inout import loadfile
from pkg_MeasSetGen.param_update import ParamUpdate
from pkg_MeasSetGen.param_gen import ParamGen
from pkg_MeasSetGen.predictML import PredictML
from pkg_MeasSetGen.data_inout import DataOut
from pkg_SQL.database import SQL
import pandas as pd


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
        self.sql = SQL(database=self.database, windows_auth=True)

    def generate(self):
        ## 파일 선택할 수 있는 algorithm / 중복 데이터 삭제 및 group_index
        raw_data = loadfile(self.file_path)

        ## 클래스 인스턴스 생성
        param_update = ParamUpdate(raw_data)

        ## [B / M] [C / D] 중복 데이터 삭제
        df_total = param_update.remove_duplicate()
        df_total = param_update.createGroupIdx(df_total)
        selected_df = param_update.updateDuplicate(df_total)

        ## 선택한 데이터를 기반으로 parameter 생성.
        param_gen = ParamGen(
            data=selected_df, probeid=self.probeId, probename=self.probeName
        )
        gen_df = param_gen.gen_sequence()

        ## predictML for intensity case
        predictionML = PredictML(self.database, gen_df, self.probeId)
        gen_df_inten = predictionML.intensity_zt_est()

        ## predictML for tempeature case
        gen_df_temp = predictionML.temperature_PRF_est()

        ## predictML for power case
        gen_df_power = predictionML.power_PRF_est()

        df_total = pd.concat(
            [gen_df_inten, gen_df_temp, gen_df_power], axis=0, ignore_index=True
        )

        df_total.to_csv("meassetgen_df_predict.csv")

        ## 클래스 인스턴스를 데이터프레임으로 변환 / DataOut 클래스 이용하여 csv 파일로 추출.
        dataout = DataOut(
            case=0,
            database=self.database,
            probename=self.probeName,
            df1=gen_df,
        )
        dataout.make_dir()
        file_path = dataout.save_excel()

        ## 만들어진 데이터, insert data to MS-SQL
        df = pd.read_csv(file_path)
        df.fillna("NULL")
        self.sql.insert_data(table_name="meas_setting", data=df)
