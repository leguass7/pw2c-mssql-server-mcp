import mssql from 'mssql';

const connStrProd = 'Server=10.1.11.58,1433;Database=db_art_management;User Id=app.art;Password=7e2$0lzHTu*4q+r\\@|UX1>UY2;Encrypt=true;TrustServerCertificate=true;';

async function main() {
  const pool = await mssql.connect(connStrProd);
  console.log("Connected successfully!");

  const result = await pool.request().query(`
    SELECT TOP 5 * FROM ret_file_configs;
  `);

  console.log("\n--- ret_file_configs row schema ---");
  console.log(result.recordset);

  const result2 = await pool.request().query(`
    SELECT TOP 5 * FROM transaction_codes;
  `);

  console.log("\n--- transaction_codes row schema ---");
  console.log(result2.recordset);

  await pool.close();
}

main().catch(console.error);
