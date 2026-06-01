import mssql from 'mssql';

const connStrProd = 'Server=10.1.11.58,1433;Database=db_art_management;User Id=app.art;Password=7e2$0lzHTu*4q+r\\@|UX1>UY2;Encrypt=true;TrustServerCertificate=true;';

async function main() {
  const pool = await mssql.connect(connStrProd);
  console.log("Connected to Production successfully!");

  const query = `
    SELECT 
      CAST(e.credit_date AS DATE) as credit_day,
      at.slug as agreement_slug,
      COUNT(*) as count,
      SUM(e.total_value) as sum_val
    FROM extractions e
    INNER JOIN agreements a ON e.agreement_id = a.id
    INNER JOIN agreement_types at ON a.agreement_type_id = at.id
    INNER JOIN banks b ON a.bank_id = b.id
    WHERE b.slug = 'bb'
      AND CAST(e.credit_date AS DATE) IN ('2026-05-08', '2026-05-11', '2026-05-12', '2026-05-13')
    GROUP BY CAST(e.credit_date AS DATE), at.slug
    ORDER BY credit_day ASC, agreement_slug ASC;
  `;

  const result = await pool.request().query(query);

  const statsByDay: Record<string, any> = {};

  for (const row of result.recordset) {
    const day = row.credit_day.toISOString().split('T')[0];
    if (!statsByDay[day]) {
      statsByDay[day] = { tres_partes_gross: 0, quatro_partes_gross: 0 };
    }
    const valReais = Number(row.sum_val) / 100;
    if (row.agreement_slug === 'tres-partes') {
      statsByDay[day].tres_partes_gross += valReais;
    } else if (row.agreement_slug === 'quatro-partes') {
      statsByDay[day].quatro_partes_gross += valReais;
    }
  }

  const targetGaps: Record<string, number> = {
    '2026-05-08': 37470.93,
    '2026-05-11': 182075.57,
    '2026-05-12': 182386.90,
    '2026-05-13': 230200.98
  };

  console.log("\n=================================================================");
  console.log("MATHEMATICAL PROOF OF GLÁUCIA'S RECONCILIATION GAP (PROD)");
  console.log("=================================================================");

  for (const day of Object.keys(targetGaps)) {
    const dayData = statsByDay[day] || { tres_partes_gross: 0, quatro_partes_gross: 0 };
    const gap = targetGaps[day];

    // Let's see:
    // If tres-partes gets 20% (0.2)
    // If quatro-partes gets 6% (0.06), but should represent 20% in total?
    // Let's compute: 14% of quatro-partes gross
    const fourteenPercentOfQuatroPartes = dayData.quatro_partes_gross * 0.14;
    const sixPercentOfQuatroPartes = dayData.quatro_partes_gross * 0.06;
    const twentyPercentOfQuatroPartes = dayData.quatro_partes_gross * 0.20;
    const twentyPercentOfTresPartes = dayData.tres_partes_gross * 0.20;

    console.log(`\nDate: ${day}`);
    console.log(`  - Tres-Partes Gross:   ${dayData.tres_partes_gross.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    console.log(`  - Quatro-Partes Gross: ${dayData.quatro_partes_gross.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    console.log(`  - 14% of Quatro-Partes: ${fourteenPercentOfQuatroPartes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    console.log(`  - 6% of Quatro-Partes:  ${sixPercentOfQuatroPartes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    console.log(`  - 20% of Quatro-Partes: ${twentyPercentOfQuatroPartes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    console.log(`  - Gláucia's Gap:        ${gap.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);

    // Let's check other formulas!
    // What if Gláucia was expecting the full 20% of Quatro-Partes (which is 6% + 14%):
    // Or what if Gláucia was expecting R$ XX and the system was only showing R$ YY?
    // Let's print out what the system shows (net) vs what she was expecting!
    const systemNet = twentyPercentOfTresPartes + sixPercentOfQuatroPartes;
    const correctNet = twentyPercentOfTresPartes + twentyPercentOfQuatroPartes;
    const diffNet = correctNet - systemNet; // which is exactly 14% of quatro-partes gross!
    
    console.log(`  - System Net (20% Tres + 6% Quatro):  ${systemNet.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    console.log(`  - Correct Net (20% Tres + 20% Quatro): ${correctNet.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    console.log(`  - Net Difference (the 14% Regional Split): ${diffNet.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    
    // Check match!
    const closenessOf14Percent = Math.abs(fourteenPercentOfQuatroPartes - gap);
    const closenessOf6Percent = Math.abs(sixPercentOfQuatroPartes - gap);
    const closenessOf20Percent = Math.abs(twentyPercentOfQuatroPartes - gap);
    const closenessOfDiff = Math.abs(diffNet - gap);

    console.log(`  - Is 14% of Quatro-Partes the Gap? ` + (closenessOf14Percent < 1.0 ? "✅ YES!" : "❌ NO"));
    console.log(`  - Is 6% of Quatro-Partes the Gap? ` + (closenessOf6Percent < 1.0 ? "✅ YES!" : "❌ NO"));
    console.log(`  - Is 20% of Quatro-Partes the Gap? ` + (closenessOf20Percent < 1.0 ? "✅ YES!" : "❌ NO"));
    console.log(`  - Is the Net Difference the Gap? ` + (closenessOfDiff < 1.0 ? "✅ YES!" : "❌ NO"));
  }

  await pool.close();
}

main().catch(console.error);
