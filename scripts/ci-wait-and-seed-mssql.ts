import mssql from 'mssql';

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const buildConfig = (database: string): mssql.config => {
  const password = process.env.CI_MSSQL_SA_PASSWORD;
  if (!password) {
    throw new Error('CI_MSSQL_SA_PASSWORD is required for MSSQL setup.');
  }

  return {
    user: 'sa',
    password,
    server: '127.0.0.1',
    port: 1433,
    database,
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
    pool: {
      min: 0,
      max: 2,
    },
  };
};

const waitForMssql = async (): Promise<void> => {
  let attempt = 0;
  const maxAttempts = 30;

  while (attempt < maxAttempts) {
    attempt += 1;
    let pool: mssql.ConnectionPool | undefined;
    try {
      pool = await mssql.connect(buildConfig('master'));
      await pool.request().query('SELECT 1 AS ok');
      await pool.close();
      return;
    } catch (error) {
      if (pool) {
        await pool.close();
      }
      if (attempt === maxAttempts) {
        throw new Error(`MSSQL did not become ready after ${maxAttempts} attempts: ${error instanceof Error ? error.message : String(error)}`);
      }
      await sleep(3000);
    }
  }
};

const seedDatabase = async (): Promise<void> => {
  const masterPool = await mssql.connect(buildConfig('master'));
  try {
    await masterPool.request().query("IF DB_ID('mcp_ci') IS NULL CREATE DATABASE mcp_ci;");
  } finally {
    await masterPool.close();
  }

  const appPool = await mssql.connect(buildConfig('mcp_ci'));
  try {
    await appPool.request().batch(`
      IF OBJECT_ID('dbo.departments', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.departments (
          department_id INT NOT NULL PRIMARY KEY,
          department_name NVARCHAR(100) NOT NULL
        );
      END;

      IF OBJECT_ID('dbo.employees', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.employees (
          employee_id INT NOT NULL PRIMARY KEY,
          employee_name NVARCHAR(120) NOT NULL,
          department_id INT NOT NULL,
          CONSTRAINT FK_employees_departments FOREIGN KEY (department_id)
            REFERENCES dbo.departments(department_id)
        );
      END;

      IF NOT EXISTS (SELECT 1 FROM dbo.departments WHERE department_id = 1)
      BEGIN
        INSERT INTO dbo.departments (department_id, department_name)
        VALUES (1, 'Engineering');
      END;

      IF NOT EXISTS (SELECT 1 FROM dbo.employees WHERE employee_id = 1)
      BEGIN
        INSERT INTO dbo.employees (employee_id, employee_name, department_id)
        VALUES (1, 'CI User', 1);
      END;
    `);
  } finally {
    await appPool.close();
  }
};

const main = async (): Promise<void> => {
  await waitForMssql();
  await seedDatabase();
  console.error('[ci-wait-and-seed-mssql] MSSQL is ready and seeded.');
};

main().catch((error) => {
  console.error('[ci-wait-and-seed-mssql] Failed:', error);
  process.exit(1);
});
