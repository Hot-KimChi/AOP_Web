'use client'

import { useEffect, useState } from "react";

const CSVViewer = () => {
  const [tableData, setTableData] = useState([]);

  useEffect(() => {
    let data = localStorage.getItem("csvData");

    if (data) {
      try {
        data = JSON.parse(data);

        // 문자열이면 CSV 파싱
        if (typeof data === "string") {
          const rows = data.split("\n").map(row => row.split(","));
          setTableData(rows);
        } 
        // 객체 형태라면 내부의 `data` 키 확인
        else if (typeof data === "object" && data.data) {
          const rows = data.data.split("\n").map(row => row.split(","));
          setTableData(rows);
        }
        // 배열이면 그대로 저장
        else if (Array.isArray(data)) {
          setTableData(data);
        } else {
          console.error("Invalid CSV data format:", data);
        }
      } catch (error) {
        console.error("Error parsing CSV data:", error);
      }
    }
  }, []);

  return (
    <div>
      <h2>CSV Data</h2>
      <table border="1">
        <tbody>
          {tableData.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CSVViewer;