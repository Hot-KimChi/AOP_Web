# import tkinter as tk
# from tkinter import ttk

# from pkg_MeasSetGen.data_inout import loadfile
# from pkg_MeasSetGen.data_inout import DataOut
# from pkg_MeasSetGen.param_update import ParamUpdate
# from pkg_MeasSetGen.param_gen import ParamGen
# from pkg_MeasSetGen.predictML import PredictML


class MeasSetGen:
    """
    MeasSetGeneration 버튼이 눌렸을 경우, 해당 클래스가 실행.
    1) select & Load 버튼: _get_sequence 함수 실행
    2) To MS-SQL / To Excel / protocol check
    """

    def __init__(self, database, list_probe):

        self.database = database
        self.list_probe = list_probe

        self.window = tk.Toplevel()
        self.window.title(f"{self.database}" + " / MeasSet_generation")
        self.window.geometry("570x200")
        self.window.resizable(False, False)

        # 고정 폭 글꼴 설정
        self.window.option_add("*Font", "Consolas 10")

        frame = tk.Frame(self.window, relief="solid", bd=2)
        frame.pack(side="top", fill="both", expand=True)

        label_probename = tk.Label(frame, text="Probe Name")
        label_probename.place(x=5, y=5)
        self.combo_probe = ttk.Combobox(
            frame, value=self.list_probe, height=0, state="readonly", width=25
        )
        self.combo_probe.place(x=5, y=25)

        btn_load = tk.Button(
            frame, width=15, height=2, text="Select & Load", command=self._get_sequence
        )
        btn_load.place(x=260, y=5)

        btn_insert = tk.Button(
            frame, width=15, height=2, text="To MS-SQL", command=loadfile
        )
        btn_insert.place(x=410, y=5)

    def _get_sequence(self):

        ## probename / probeid 로 구분
        probe = self.combo_probe.get().replace(" ", "")
        idx = probe.find("|")
        if idx >= 0:
            probename = probe[:idx]
            probeid = probe[idx + 1 :]

        ## 파일 선택할 수 있는 algorithm / 중복 데이터 삭제 및 group_index
        raw_data = loadfile()
        param_update = ParamUpdate(raw_data)  ## 클래스 인스턴스 생성
        df_total = param_update.remove_duplicate()  ## [B / M] [C / D] 중복 데이터 삭제
        df_total = param_update.createGroupIdx(df_total)
        self.selected_df = param_update.updateDuplicate(df_total)
        self.selected_df.fillna("NULL")

        ## 선택한 데이터를 기반으로 parameter 생성.
        param_gen = ParamGen(
            data=self.selected_df, probeid=probeid, probename=probename
        )
        self.gen_df = param_gen.gen_sequence()
        self.gen_df.to_csv("measSetGen_df.csv")

        ## predictML for intensity case
        predictionML = PredictML(self.gen_df, probeid)
        self.gen_df = predictionML.intensity_zt_est()

        ## 클래스 인스턴스를 데이터프레임으로 변환 / DataOut 클래스 이용하여 csv 파일로 추출.
        dataout = DataOut(
            case=0,
            database=self.database,
            probename=probename,
            df1=self.gen_df,
        )
        dataout.make_dir()
        dataout.save_excel()


if __name__ == "__main__":
    gen_window = tk.Tk()
    app_gen = MeasSetGen(gen_window)

    gen_window.mainloop()
