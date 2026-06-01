import mssql from 'mssql';

const connStrProd = 'Server=10.1.11.58,1433;Database=db_art_management;User Id=app.art;Password=7e2$0lzHTu*4q+r\\@|UX1>UY2;Encrypt=true;TrustServerCertificate=true;';

async function main() {
  const pool = await mssql.connect(connStrProd);
  console.log("Connected to Production successfully!");

  const result = await pool.request().query(`
    SELECT TOP 1 * FROM ret_files;
  `);

  console.log("\n--- ret_files row schema ---");
  console.log(Object.keys(result.recordset[0]));

  const failedResult = await pool.request().query(`
    SELECT file_name, file_status, expected_record_count, created_at 
    FROM ret_files 
    WHERE file_status = 'ERROR' OR file_status = 'FAILED'
    ORDER BY created_at DESC;
  `);

  console.log("\n--- Files with errors/failures in Prod ---");
  for (const row of failedResult.recordset) {
    console.log(`File: ${row.file_name} | Status: ${row.file_status} | Expected: ${row.expected_record_count} | Created: ${row.created_at}`);
  }

  await pool.close();
}

main().catch(console.error);
