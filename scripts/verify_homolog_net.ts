import mssql from 'mssql';

const connStrHomolog = 'Server=10.1.11.57,1433;Database=db_art_management;User Id=pedro.s4s.ext;Password=Mutua@2025;Encrypt=true;TrustServerCertificate=true;';

async function main() {
  const pool = await mssql.connect(connStrHomolog);
  console.log("Connected to Homologation successfully!");

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
  console.log("HOMOLOGATION DB EXPERIMENTAL ANALYSIS FOR GLÁUCIA'S GAPS");
  console.log("=================================================================");

  for (const day of Object.keys(targetGaps)) {
    const dayData = statsByDay[day] || { tres_partes_gross: 0,...statsByDay[day] };
    const gap = targetGaps[day];

    const gp20OfTres = (dayData.tres_partes_gross || 0) * 0.20;
    const gp20OfQuatro = (dayData.quatro_partes_gross || 0) * 0.20;
    const gp6OfQuatro = (dayData.quatro_partes_gross || 0) * 0.06;
    const gp14OfQuatro = (dayData.quatro_partes_gross || 0) * 0.14;

    console.log(`\nDate: ${day}`);
    console.log(`  - 20% of Tres-Partes:   ${gp20OfTres.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    console.log(`  - 20% of Quatro-Partes: ${gp20OfQuatro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    console.log(`  - 6% of Quatro-Partes:  ${gp6OfQuatro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    console.log(`  - 14% of Quatro-Partes: ${gp14OfQuatro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    console.log(`  - Gláucia's Gap:        ${gap.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);

    // Let's check matches on parts or total!
    const closenessOfgp20OfTres = Math.abs(gp20OfTres - gap);
    const closenessOfgp20OfQuatro = Math.abs(gp20OfQuatro - gap);
    const closenessOfgp6OfQuatro = Math.abs(gp6OfQuatro - gap);
    const closenessOfgp14OfQuatro = Math.abs(gp14OfQuatro - gap);

    console.log(`  - Is 20% of Tres-Partes the Gap? ` + (closenessOfgp20OfTres < 10.0 ? "✅ YES!" : "❌ NO"));
    console.log(`  - Is 20% of Quatro-Partes the Gap? ` + (closenessOfgp20OfQuatro < 10.0 ? "✅ YES!" : "❌ NO"));
    console.log(`  - Is 6% of Quatro-Partes the Gap? ` + (closenessOfgp6OfQuatro < 10.0 ? "✅ YES!" : "❌ NO"));
    console.log(`  - Is 14% of Quatro-Partes the Gap? ` + (closenessOfgp14OfQuatro < 10.0 ? "✅ YES!" : "❌ NO"));
  }

  await pool.close();
}

main().catch(console.error);
