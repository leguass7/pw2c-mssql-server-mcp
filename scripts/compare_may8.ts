import mssql from 'mssql';

const connStrProd = 'Server=10.1.11.58,1433;Database=db_art_management;User Id=app.art;Password=7e2$0lzHTu*4q+r\\@|UX1>UY2;Encrypt=true;TrustServerCertificate=true;';
const connStrHomolog = 'Server=10.1.11.57,1433;Database=db_art_management;User Id=pedro.s4s.ext;Password=Mutua@2025;Encrypt=true;TrustServerCertificate=true;';

async function main() {
  console.log("Starting May 8 Comparison...");

  // 1. Query Homologation
  const poolHomolog = await mssql.connect(connStrHomolog);
  const homologResult = await poolHomolog.request().query(`
    SELECT 
      at.slug as agreement_slug,
      COUNT(*) as count,
      SUM(e.total_value) as sum_val
    FROM extractions e
    INNER JOIN agreements a ON e.agreement_id = a.id
    INNER JOIN agreement_types at ON a.agreement_type_id = at.id
    INNER JOIN banks b ON a.bank_id = b.id
    WHERE b.slug = 'bb'
      AND CAST(e.credit_date AS DATE) = '2026-05-08'
    GROUP BY at.slug;
  `);
  await poolHomolog.close();

  // 2. Query Production
  const poolProd = await mssql.connect(connStrProd);
  const prodResult = await poolProd.request().query(`
    SELECT 
      at.slug as agreement_slug,
      COUNT(*) as count,
      SUM(e.total_value) as sum_val
    FROM extractions e
    INNER JOIN agreements a ON e.agreement_id = a.id
    INNER JOIN agreement_types at ON a.agreement_type_id = at.id
    INNER JOIN banks b ON a.bank_id = b.id
    WHERE b.slug = 'bb'
      AND CAST(e.credit_date AS DATE) = '2026-05-08'
    GROUP BY at.slug;
  `);
  await poolProd.close();

  console.log("\n=================================================================");
  console.log("MAY 8 RECONCILIATION DATA (LIVE DATABASE QUERIES)");
  console.log("=================================================================");

  console.log("\n[HOMOLOGATION (10.1.11.57)]:");
  let homologTotalCount = 0;
  let homologTotalGross = 0;
  let homologNetAfterSplitSystem = 0;
  let homologNetAfterSplitCorrect = 0;

  for (const row of homologResult.recordset) {
    const gross = Number(row.sum_val) / 100;
    homologTotalCount += row.count;
    homologTotalGross += gross;

    let systemNet = 0;
    let correctNet = 0;

    if (row.agreement_slug === 'tres-partes') {
      systemNet = gross * 0.20;
      correctNet = gross * 0.20;
    } else if (row.agreement_slug === 'quatro-partes') {
      systemNet = gross * 0.06;
      correctNet = gross * 0.20;
    }

    homologNetAfterSplitSystem += systemNet;
    homologNetAfterSplitCorrect += correctNet;

    console.log(`  Convention: ${row.agreement_slug.padEnd(15)} | Count: ${String(row.count).padEnd(6)} | Gross: ${gross.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  }

  console.log(`  -------------------------------------------------------------`);
  console.log(`  Total Extractions:       ${homologTotalCount}`);
  console.log(`  Total Gross Revenue:     ${homologTotalGross.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  console.log(`  System Net (6% Quatro):  ${homologNetAfterSplitSystem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  console.log(`  Correct Net (20% Quatro): ${homologNetAfterSplitCorrect.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  console.log(`  Divergence (14% missing): ${(homologNetAfterSplitCorrect - homologNetAfterSplitSystem).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);

  console.log("\n[PRODUCTION (10.1.11.58)]:");
  let prodTotalCount = 0;
  let prodTotalGross = 0;
  let prodNetAfterSplitSystem = 0;
  let prodNetAfterSplitCorrect = 0;

  for (const row of prodResult.recordset) {
    const gross = Number(row.sum_val) / 100;
    prodTotalCount += row.count;
    prodTotalGross += gross;

    let systemNet = 0;
    let correctNet = 0;

    if (row.agreement_slug === 'tres-partes') {
      systemNet = gross * 0.20;
      correctNet = gross * 0.20;
    } else if (row.agreement_slug === 'quatro-partes') {
      systemNet = gross * 0.06;
      correctNet = gross * 0.20;
    }

    prodNetAfterSplitSystem += systemNet;
    prodNetAfterSplitCorrect += correctNet;

    console.log(`  Convention: ${row.agreement_slug.padEnd(15)} | Count: ${String(row.count).padEnd(6)} | Gross: ${gross.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  }

  console.log(`  -------------------------------------------------------------`);
  console.log(`  Total Extractions:       ${prodTotalCount}`);
  console.log(`  Total Gross Revenue:     ${prodTotalGross.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  console.log(`  System Net (6% Quatro):  ${prodNetAfterSplitSystem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  console.log(`  Correct Net (20% Quatro): ${prodNetAfterSplitCorrect.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  console.log(`  Divergence (14% missing): ${(prodNetAfterSplitCorrect - prodNetAfterSplitSystem).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
}

main().catch(console.error);
