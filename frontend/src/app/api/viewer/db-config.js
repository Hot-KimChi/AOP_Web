// src/app/api/viewer/db-config.js
import sql from 'mssql';

export const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  // Windows 인증 대신 SQL 인증 사용
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true, // Azure를 사용하는 경우 true로 설정
    trustServerCertificate: true, // 개발 환경에서만 true로 설정
    enableArithAbort: true
  }
};

// 공통으로 사용할 DB 연결 함수
export async function getConnection() {
  try {
    const pool = await sql.connect(config);
    return pool;
  } catch (error) {
    console.error('DB 연결 실패:', error);
    throw new Error('데이터베이스 연결에 실패했습니다.');
  }
}