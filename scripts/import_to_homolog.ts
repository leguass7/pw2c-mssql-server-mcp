import mssql from 'mssql';
import { execSync } from 'child_process';
import fs from 'fs';
import readline from 'readline';
import path from 'path';

const connStrHomolog = 'Server=10.1.11.57,1433;Database=db_art_management;User Id=pedro.s4s.ext;Password=Mutua@2025;Encrypt=true;TrustServerCertificate=true;';

const filesToProcess = [
  { name: 'CBR64358441205202615904.ret', path: '/mnt/RetornoParticao/MAIO/18- Dia 18.05.26/CBR64358441205202615904.ret' },
  { name: 'CBR64358471305202615903.ret', path: '/mnt/RetornoParticao/MAIO/18- Dia 18.05.26/CBR64358471305202615903.ret' },
  { name: 'IEDCBR5840805202620650.ret', path: '/mnt/RetornoParticao/MAIO/18- Dia 18.05.26/IEDCBR5840805202620650.ret' },
  { name: 'CBR6435832605202615800.ret', path: '/mnt/RetornoParticao/MAIO/4- Dia 07.05.26/CBR6435832605202615800.ret' },
  { name: 'CBR6435835705202615941.ret', path: '/mnt/RetornoParticao/MAIO/5- Dia 08.05.26/CBR6435835705202615941.ret' },
  { name: 'IEDCBR5837705202620902.ret', path: '/mnt/RetornoParticao/MAIO/5- Dia 08.05.26/IEDCBR5837705202620902.ret' },
  { name: 'IEDCBR58431105202621742.ret', path: '/mnt/RetornoParticao/MAIO/7- Dia 12.05.26/IEDCBR58431105202621742.ret' },
  { name: 'IEDCBR58461205202620850.ret', path: '/mnt/RetornoParticao/MAIO/8- Dia 13.05.26/IEDCBR58461205202620850.ret' },
  { name: 'IEDCBR58491305202620736.ret', path: '/mnt/RetornoParticao/MAIO/9- Dia 14.05.26/IEDCBR58491305202620736.ret' }
];

async function main() {
  const pool = await mssql.connect(connStrHomolog);
  console.log("Connected to Homologation SQL Server successfully!");

  // Create temporary local folder to store files
  const localTmpFolder = '/workspace/projects/pw2c-mssql-server-mcp/scripts/tmp_files';
  if (!fs.existsSync(localTmpFolder)) {
    fs.mkdirSync(localTmpFolder, { recursive: true });
  }

  // Fetch pre-existing extractions excluding those from files we are going to process.
  // This avoids cache issues when re-processing.
  console.log("Caching pre-existing extractions in Homologation DB for in-memory duplicate check...");
  const dupCacheSet = new Set<string>();
  const filesToProcessNames = filesToProcess.map(f => f.name);
  const filesToProcessNamesEscaped = filesToProcessNames.map(name => `'${name.replace(/'/g, "''")}'`).join(',');
  
  const preResult = await pool.request().query(`
    SELECT regional_number, agreement_id 
    FROM extractions 
    WHERE file_name NOT IN (${filesToProcessNamesEscaped});
  `);
  
  for (const row of preResult.recordset) {
    if (row.regional_number) {
      dupCacheSet.add(`${row.regional_number.trim()}-${row.agreement_id}`);
    }
  }
  console.log(`Cached ${dupCacheSet.size} pre-existing extractions.`);

  for (const fileInfo of filesToProcess) {
    const localPath = path.join(localTmpFolder, fileInfo.name);
    console.log(`\n==================================================`);
    console.log(`Processing file: ${fileInfo.name}`);
    console.log(`==================================================`);

    // Step 1: Copy file from dckr03 locally if not already cached
    if (!fs.existsSync(localPath)) {
      console.log(`Copying file from dckr03 to ${localPath}...`);
      try {
        execSync(`ssh dckr03 "cat '${fileInfo.path}'" > "${localPath}"`);
      } catch (err) {
        console.error(`Error copying file ${fileInfo.name}:`, err);
        continue;
      }
    } else {
      console.log(`Using cached file: ${localPath}`);
    }

    // Step 2: Clear pre-existing extractions and ret_files record for this file in Homologation
    console.log(`Clearing any pre-existing records for ${fileInfo.name} in Homologation...`);
    await pool.request().query(`
      DELETE FROM extractions WHERE file_name = '${fileInfo.name}';
      DELETE FROM ret_files WHERE file_name = '${fileInfo.name}';
    `);

    // Step 3: Parse file and extract records
    console.log(`Parsing file...`);
    const fileStream = fs.createReadStream(localPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const isCnab400 = fileInfo.name.startsWith('CBR');
    const recordsToInsert: any[] = [];
    let titleData: any = null;
    let lineNumber = 0;

    for await (const line of rl) {
      if (lineNumber === 0) {
        lineNumber++;
        continue; // skip header
      }

      if (line.length < 200) {
        lineNumber++;
        continue;
      }

      if (!isCnab400) {
        // CNAB 240
        const segment = line.substring(13, 14);
        if (segment === 'T') {
          const standardAgreement = line.substring(23, 29).trim();
          const agency = line.substring(17, 22).trim();
          const agencyDigit = line.substring(22, 23).trim();
          const account = line.substring(23, 35).trim();
          const accountDigit = line.substring(35, 36).trim();
          const regionalNumber = line.substring(37, 56).trim();
          const regionalNumberDigit = line.substring(56, 57).trim();
          const movCode = line.substring(15, 17).trim();

          titleData = {
            agreement: standardAgreement,
            agency,
            agencyDigit,
            account,
            accountDigit,
            regionalNumber,
            regionalNumberDigit,
            movCode
          };
        } else if (segment === 'U') {
          const value = line.substring(77, 92).trim();
          const paymentDateRaw = line.substring(137, 145).trim();
          const creditDateRaw = line.substring(145, 153).trim();

          if (titleData) {
            recordsToInsert.push({
              ...titleData,
              totalValue: parseInt(value, 10),
              paymentDate: parseCnab240Date(paymentDateRaw),
              creditDate: parseCnab240Date(creditDateRaw)
            });
            titleData = null;
          }
        }
      } else {
        // CNAB 400
        const transactionType = line.substring(108, 110).trim();
        if ((line.startsWith('1') || line.startsWith('7')) && ['05', '5', '06', '6'].includes(transactionType)) {
          const standardAgreement = line.substring(31, 38).trim();
          const regionalNumber = line.substring(63, 80).trim();
          const regionalNumberDigit = line.substring(80, 81).trim();
          const value = line.substring(253, 266).trim();
          const paymentDateRaw = line.substring(110, 116).trim();
          const creditDateRaw = line.substring(175, 181).trim();
          
          recordsToInsert.push({
            agreement: standardAgreement,
            regionalNumber,
            regionalNumberDigit,
            totalValue: parseInt(value, 10),
            paymentDate: parseCnab400Date(paymentDateRaw),
            creditDate: parseCnab400Date(creditDateRaw),
            movCode: transactionType
          });
        }
      }
      lineNumber++;
    }

    console.log(`Found ${recordsToInsert.length} records to import.`);
    if (recordsToInsert.length === 0) {
      continue;
    }

    // Create ret_files record
    const retFileId = `sim-file-${Date.now()}`;
    const fileType = isCnab400 ? 'CNAB_400' : 'CNAB_240_30';
    await pool.request().query(`
      INSERT INTO ret_files (public_id, file_name, file_hash, file_type, bank, source, expected_record_count, file_status, created_at)
      VALUES ('${retFileId}', '${fileInfo.name}', 'simhash-${fileInfo.name}', '${fileType}', 'bb', 'UPLOAD', ${recordsToInsert.length}, 'PROCESSING', GETDATE());
    `);

    // Resolve the agreements cache
    const agreementsMap: Record<string, number> = {};
    const agreementsListResult = await pool.request().query(`SELECT id, number FROM agreements WHERE bank_id = 1;`);
    for (const ag of agreementsListResult.recordset) {
      agreementsMap[ag.number] = ag.id;
    }

    // Replicate convênio fallback for BB CNAB 240
    const uniqueRecordsToInsert: any[] = [];
    let skippedCount = 0;

    for (const record of recordsToInsert) {
      let resolvedAgreementNumber = record.agreement;
      
      // Replicate convênio fallback if zeroed
      const isAgreementZeroed = !resolvedAgreementNumber || resolvedAgreementNumber === '000000' || resolvedAgreementNumber === '0000000' || /^0+$/.test(resolvedAgreementNumber);
      if (isAgreementZeroed && !isCnab400) {
        resolvedAgreementNumber = record.regionalNumber.substring(0, 7);
      }

      let agreementId = agreementsMap[resolvedAgreementNumber];
      if (!agreementId) {
        try {
          // Auto-create agreement if not found
          const createAgResult = await pool.request().query(`
            INSERT INTO agreements (public_id, number, bank_id, active, created_at)
            OUTPUT inserted.id
            VALUES (NEWID(), '${resolvedAgreementNumber}', 1, 1, GETDATE());
          `);
          agreementId = createAgResult.recordset[0].id;
          agreementsMap[resolvedAgreementNumber] = agreementId;
        } catch (err) {
          console.error(`Error creating agreement ${resolvedAgreementNumber}:`, err);
          continue;
        }
      }

      // Check duplicates in memory cache (super fast!)
      const cacheKey = `${record.regionalNumber.trim()}-${agreementId}`;
      if (dupCacheSet.has(cacheKey)) {
        skippedCount++;
        continue;
      }

      dupCacheSet.add(cacheKey);
      uniqueRecordsToInsert.push({
        ...record,
        agreementId
      });
    }

    console.log(`Inserting ${uniqueRecordsToInsert.length} unique extractions in batches of 1000...`);
    const batchSize = 1000;
    let insertedCount = 0;

    for (let i = 0; i < uniqueRecordsToInsert.length; i += batchSize) {
      const batch = uniqueRecordsToInsert.slice(i, i + batchSize);
      
      const valuesSql = batch.map(record => {
        const pDateStr = record.paymentDate.toISOString();
        const cDateStr = record.creditDate.toISOString();
        const escapedFileName = fileInfo.name.replace(/'/g, "''");
        const escapedRegionalNumber = record.regionalNumber.replace(/'/g, "''");
        const escapedRegionalNumberDigit = record.regionalNumberDigit.replace(/'/g, "''");
        
        return `(NEWID(), '${escapedFileName}', '${retFileId}', ${record.agreementId}, ${record.totalValue}, 0, '${cDateStr}', '${pDateStr}', '${escapedRegionalNumber}', '${escapedRegionalNumberDigit}', 0, 0, 0, 0, 0, 0, GETDATE())`;
      }).join(',\n');

      const querySql = `
        INSERT INTO extractions (
          public_id, file_name, ret_file_id, agreement_id, total_value, total_fare, 
          credit_date, payment_date, regional_number, regional_number_digit, 
          value_twenty_percent, value_thirty_percent, value_seventy_percent, 
          fare_twenty_percent, fare_thirty_percent, fare_seventy_percent, created_at
        )
        VALUES 
        ${valuesSql};
      `;

      try {
        await pool.request().query(querySql);
        insertedCount += batch.length;
      } catch (err) {
        console.error(`Error inserting batch starting at index ${i}:`, err);
        console.log(`Falling back to individual insertions for this batch...`);
        for (const rec of batch) {
          try {
            const pDateStr = rec.paymentDate.toISOString();
            const cDateStr = rec.creditDate.toISOString();
            const escapedFileName = fileInfo.name.replace(/'/g, "''");
            const escapedRegionalNumber = rec.regionalNumber.replace(/'/g, "''");
            const escapedRegionalNumberDigit = rec.regionalNumberDigit.replace(/'/g, "''");

            await pool.request().query(`
              INSERT INTO extractions (public_id, file_name, ret_file_id, agreement_id, total_value, total_fare, credit_date, payment_date, regional_number, regional_number_digit, value_twenty_percent, value_thirty_percent, value_seventy_percent, fare_twenty_percent, fare_thirty_percent, fare_seventy_percent, created_at)
              VALUES (NEWID(), '${escapedFileName}', '${retFileId}', ${rec.agreementId}, ${rec.totalValue}, 0, '${cDateStr}', '${pDateStr}', '${escapedRegionalNumber}', '${escapedRegionalNumberDigit}', 0, 0, 0, 0, 0, 0, GETDATE());
            `);
            insertedCount++;
          } catch (individualErr) {
            console.error(`Error inserting individual row for regional_number ${rec.regionalNumber}:`, individualErr);
          }
        }
      }
    }

    // Update ret_files to COMPLETED
    await pool.request().query(`
      UPDATE ret_files 
      SET file_status = 'COMPLETED', finished_at = GETDATE()
      WHERE public_id = '${retFileId}';
    `);

    console.log(`File ${fileInfo.name} completed: ${insertedCount} inserted, ${skippedCount} skipped as duplicates.`);
  }

  await pool.close();
  console.log("All processes completed successfully!");
}

function parseCnab240Date(dateStr: string): Date {
  const day = parseInt(dateStr.substring(0, 2), 10);
  const month = parseInt(dateStr.substring(2, 4), 10) - 1;
  const year = parseInt(dateStr.substring(4, 8), 10);
  return new Date(year, month, day);
}

function parseCnab400Date(dateStr: string): Date {
  const day = parseInt(dateStr.substring(0, 2), 10);
  const month = parseInt(dateStr.substring(2, 4), 10) - 1;
  // year is YY format
  let year = parseInt(dateStr.substring(4, 6), 10);
  year = year <= 50 ? 2000 + year : 1900 + year;
  return new Date(year, month, day);
}

main().catch(console.error);
