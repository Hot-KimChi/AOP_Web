// src/app/api/viewer/route.js
import sql from 'mssql';
import { NextResponse } from 'next/server';
import { getConnection } from './db-config';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const tableName = searchParams.get('tableName');
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '100');

  if (!tableName) {
    try {
      const tables = await getTables();
      return NextResponse.json({ tables });
    } catch (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
  }

  let pool;
  try {
    pool = await getConnection();

    // SQL Injection 방지를 위한 매개변수화된 쿼리 사용
    const tableCheckResult = await pool.request()
      .input('tableName', sql.NVarChar, tableName)
      .query(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE' 
        AND TABLE_NAME = @tableName
      `);

    if (tableCheckResult.recordset.length === 0) {
      return NextResponse.json(
        { error: '유효하지 않은 테이블 이름입니다.' },
        { status: 400 }
      );
    }

    const offset = (page - 1) * pageSize;
    
    // 동적 테이블 이름을 안전하게 처리
    const query = `
      SELECT *
      FROM ${tableName}
      ORDER BY (SELECT NULL)
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY;

      SELECT COUNT(*) as total
      FROM ${tableName};
    `;

    const result = await pool.request()
      .input('pageSize', sql.Int, pageSize)
      .input('offset', sql.Int, offset)
      .query(query);

    return NextResponse.json({
      data: result.recordsets[0],
      total: result.recordsets[1][0].total,
      page,
      pageSize,
      totalPages: Math.ceil(result.recordsets[1][0].total / pageSize)
    });
  } catch (error) {
    console.error('데이터베이스 오류:', error);
    return NextResponse.json(
      { error: '데이터베이스 작업 실패', details: error.message },
      { status: 500 }
    );
  } finally {
    if (pool) await pool.close();
  }
}