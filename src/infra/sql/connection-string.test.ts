import { describe, expect, it } from 'vitest';
import { normalizeConnectionString } from './connection-string.js';

describe('normalizeConnectionString', () => {
  it('keeps plain SQL Server connection strings unchanged', () => {
    const input = 'Server=localhost,1433;Database=master;User Id=sa;Password=secret;Encrypt=true;';
    expect(normalizeConnectionString(input)).toBe(input);
  });

  it('converts sqlserver:// style format to SQL Server connection string', () => {
    const input =
      'sqlserver://10.1.1.10:1433;database=mydb;user=my_user;password=my_pass;encrypt=true;TrustServerCertificate=true';

    const output = normalizeConnectionString(input);

    expect(output).toContain('Server=10.1.1.10,1433');
    expect(output).toContain('Database=mydb');
    expect(output).toContain('User Id=my_user');
    expect(output).toContain('Password=my_pass');
    expect(output).toContain('Encrypt=true');
    expect(output).toContain('TrustServerCertificate=true');
  });
});
