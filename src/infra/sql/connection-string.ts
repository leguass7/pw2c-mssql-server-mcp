import { ValidationError } from '../../shared/errors/AppError.js';

const toBooleanLiteral = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return 'true';
  }
  if (normalized === 'false' || normalized === '0') {
    return 'false';
  }
  return undefined;
};

const parseSqlServerStyleUrl = (input: string): string | null => {
  if (!input.startsWith('sqlserver://')) {
    return null;
  }

  const withoutPrefix = input.slice('sqlserver://'.length);
  const [hostPortPart, ...segments] = withoutPrefix.split(';');
  const [serverRaw, portRaw] = hostPortPart.split(':');

  if (!serverRaw) {
    throw new ValidationError('DATABASE_URL sqlserver:// format is invalid: missing host.');
  }

  const kv = new Map<string, string>();
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim().toLowerCase();
    const value = trimmed.slice(separatorIndex + 1).trim();
    kv.set(key, value);
  }

  const server = portRaw ? `${serverRaw},${portRaw}` : serverRaw;
  const database = kv.get('database');
  const user = kv.get('user') ?? kv.get('uid') ?? kv.get('user id');
  const password = kv.get('password') ?? kv.get('pwd');
  const encrypt = toBooleanLiteral(kv.get('encrypt')) ?? 'true';
  const trustServerCertificate = toBooleanLiteral(kv.get('trustservercertificate')) ?? 'true';

  const connectionParts = [`Server=${server}`];
  if (database) {
    connectionParts.push(`Database=${database}`);
  }
  if (user) {
    connectionParts.push(`User Id=${user}`);
  }
  if (password) {
    connectionParts.push(`Password=${password}`);
  }
  connectionParts.push(`Encrypt=${encrypt}`);
  connectionParts.push(`TrustServerCertificate=${trustServerCertificate}`);

  return `${connectionParts.join(';')};`;
};

export const normalizeConnectionString = (databaseUrl: string): string => {
  const trimmed = databaseUrl.trim().replace(/^"|"$/g, '');
  const fromSqlServerStyle = parseSqlServerStyleUrl(trimmed);
  if (fromSqlServerStyle) {
    return fromSqlServerStyle;
  }

  return trimmed;
};
