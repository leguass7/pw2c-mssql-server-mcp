import mssql from 'mssql';

const connStrProd = 'Server=10.1.11.58,1433;Database=db_art_management;User Id=app.art;Password=7e2$0lzHTu*4q+r\\@|UX1>UY2;Encrypt=true;TrustServerCertificate=true;';

async function main() {
  const pool = await mssql.connect(connStrProd);
  console.log("Connected successfully!");

  const files = [
    'CBR64358441205202615904.ret',
    'CBR64358471305202615903.ret',
    'CBR6435835705202615941.ret',
    'CBR6435832605202615800.ret'
  ];

  for (const f of files) {
    const result = await pool.request().query(`
      SELECT COUNT(*) as cnt, SUM(total_value) as sum_val
      FROM extractions 
      WHERE file_name = '${f}';
    `);

    const result2 = await pool.request().query(`
      SELECT expected_record_count, file_status, skipped_record_count, duplicate_ignored_count 
      FROM ret_files WHERE file_name = '${f}';
    `);

    console.log(`\nFile: ${f}`);
    console.log(`  Prod Extractions Count:  ${result.recordset[0].cnt} | Sum Value: ${(Number(result.recordset[0].sum_val)/100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    if (result2.recordset.length > 0) {
      const rf = result2.recordset[0];
      console.log(`  ret_files expected:      ${rf.expected_record_count} | status: ${rf.file_status} | skipped: ${rf.skipped_record_count} | dup_ignored: ${rf.duplicate_ignored_count}`);
    } else {
      console.log(`  ret_files record NOT found in Prod!`);
    }
  }

  await pool.close();
}

main().catch(console.error);
