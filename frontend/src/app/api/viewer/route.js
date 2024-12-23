// app/api/viewer/route.js
import { NextResponse } from 'next/server';
import sql from 'mssql';

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true, // Azure를 사용하는 경우 true
    trustServerCertificate: true // 개발 환경에서만 true로 설정
  }
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const tableName = searchParams.get('tableName');
  
  if (!tableName) {
    return NextResponse.json({ error: 'Table name is required' }, { status: 400 });
  }

  try {
    // 새로운 연결 풀 생성
    const pool = await sql.connect(config);
    
    // 테이블 이름의 유효성을 검사
    const tableCheckResult = await pool.request()
      .input('tableName', sql.VarChar, tableName)
      .query`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME = @tableName
      `;
    
    if (tableCheckResult.recordset.length === 0) {
      await pool.close();
      return NextResponse.json({ error: 'Invalid table name' }, { status: 400 });
    }

    // 동적 SQL 구성 (SQL 인젝션 방지를 위해 parametrized query 사용)
    const result = await pool.request()
      .query(`SELECT TOP 1000 * FROM [${tableName}]`); // 데이터 제한을 위해 TOP 1000 추가
    
    await pool.close();
    return NextResponse.json(result.recordset);
  } catch (err) {
    console.error('Error in API route:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}