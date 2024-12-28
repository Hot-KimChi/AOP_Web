// src/app/api/viewer/route.js
import { NextResponse } from 'next/server';
import sql from 'mssql';

const dbConfig = {
  user: 'sel02776',
  password: '1qaz!QAZ',
  server: 'kr001s1804srv',
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const databaseName = searchParams.get('databaseName');
  const tableName = searchParams.get('tableName');

  console.log('Request params:', { databaseName, tableName }); // 디버깅용

  if (!databaseName || !tableName) {
    return NextResponse.json(
      { error: 'Database name and table name are required' },
      { status: 400 }
    );
  }

  let pool;
  try {
    // 데이터베이스 연결 설정
    pool = await sql.connect({
      ...dbConfig,
      database: databaseName,
    });

    // 쿼리 실행
    const result = await pool.request().query(`
      SELECT TOP 1000 *
      FROM ${tableName}
    `);

    return NextResponse.json({ 
      data: result.recordset,
      success: true 
    });

  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ 
      error: 'Database query failed', 
      details: error.message 
    }, { 
      status: 500 
    });

  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (err) {
        console.error('Error closing pool:', err);
      }
    }
  }
}