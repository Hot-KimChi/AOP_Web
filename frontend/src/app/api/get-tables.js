import sql from 'mssql/msnodesqlv8';

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  driver: 'msnodesqlv8',
  options: {
    trustedConnection: true
  },
};

export default async function handler(req, res) {
  try {
    await sql.connect(config);
    const result = await sql.query`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
    `;
    res.status(200).json(result.recordset.map(record => record.TABLE_NAME));
  } catch (err) {
    console.error('Error in API route:', err);
    res.status(500).json({ error: err.message });
  } finally {
    await sql.close();
  }
}