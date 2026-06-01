import mssql from 'mssql';

const connStrProd = 'Server=10.1.11.58,1433;Database=db_art_management;User Id=app.art;Password=7e2$0lzHTu*4q+r\\@|UX1>UY2;Encrypt=true;TrustServerCertificate=true;';

async function main() {
  const pool = await mssql.connect(connStrProd);
  console.log("Connected to Production successfully!");

  const result = await pool.request().query(`
    SELECT file_name, expected_record_count, duplicate_ignored_count, skipped_record_count, inactive_agreement_count, error_record_count, created_at 
    FROM ret_files 
    WHERE file_name IN (
      'CBR64358441205202615904.ret',
      'CBR64358471305202615903.ret',
      'CBR6435835705202615941.ret',
      'CBR6435832605202615800.ret'
    )
    ORDER BY created_at DESC;
  `);

  console.log("\n--- File ignored/skipped stats in Prod ---");
  for (const row of result.recordset) {
    console.log(`File: ${row.file_name}`);
    console.log(`  Expected Count:           ${row.expected_record_count}`);
    console.log(`  Duplicate Ignored Count:  ${row.duplicate_ignored_count}`);
    console.log(`  Skipped Record Count:     ${row.skipped_record_count}`);
    console.log(`  Inactive Agreement Count: ${row.inactive_agreement_count}`);
    console.log(`  Error Record Count:       ${row.error_record_count}`);
    console.log(`  Created At:               ${row.created_at}`);
  }

  await pool.close();
}

main().catch(console.error);
