import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { normalizeConnectionString } from '../infra/sql/connection-string.js';
import { SqlClient } from '../infra/sql/SqlClient.js';
import { ValidationError } from '../shared/errors/AppError.js';
import type { ConnectionEntry, ConnectionSummary } from '../shared/types/sql.types.js';

interface ConnectionServiceConfig {
  filePath: string;
  defaultDatabaseUrl?: string;
  connectTimeoutMs: number;
}

const DEFAULT_CONNECTION_NAME = 'default';

export class ConnectionService {
  private readonly filePath: string;
  private readonly connectTimeoutMs: number;
  private readonly entries = new Map<string, ConnectionEntry>();

  constructor(config: ConnectionServiceConfig) {
    this.filePath = resolve(config.filePath);
    this.connectTimeoutMs = config.connectTimeoutMs;
    this.loadFromDisk();

    if (config.defaultDatabaseUrl && !this.entries.has(DEFAULT_CONNECTION_NAME)) {
      this.entries.set(DEFAULT_CONNECTION_NAME, {
        name: DEFAULT_CONNECTION_NAME,
        connectionString: normalizeConnectionString(config.defaultDatabaseUrl),
        description: 'Default connection loaded from DATABASE_URL',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      this.persist();
    }
  }

  private loadFromDisk(): void {
    const folderPath = dirname(this.filePath);
    if (!existsSync(folderPath)) {
      mkdirSync(folderPath, { recursive: true });
    }

    if (!existsSync(this.filePath)) {
      writeFileSync(this.filePath, '[]', 'utf-8');
      return;
    }

    const rawText = readFileSync(this.filePath, 'utf-8');
    if (!rawText.trim()) {
      return;
    }

    const parsed = JSON.parse(rawText) as ConnectionEntry[];
    for (const entry of parsed) {
      this.entries.set(entry.name, entry);
    }
  }

  private persist(): void {
    const allEntries = Array.from(this.entries.values()).sort((a, b) => a.name.localeCompare(b.name));
    writeFileSync(this.filePath, JSON.stringify(allEntries, null, 2), 'utf-8');
  }

  public listConnections(): ConnectionSummary[] {
    return Array.from(this.entries.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => ({
        name: entry.name,
        description: entry.description,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      }));
  }

  public hasConnection(name: string): boolean {
    return this.entries.has(name);
  }

  public ensureConnection(name: string, connectionString: string, description?: string): ConnectionSummary {
    const existing = this.entries.get(name);
    if (!existing) {
      return this.addConnection(name, connectionString, description);
    }

    const normalizedConnectionString = normalizeConnectionString(connectionString);
    if (existing.connectionString !== normalizedConnectionString || existing.description !== description) {
      return this.updateConnection(name, normalizedConnectionString, description);
    }

    return {
      name: existing.name,
      description: existing.description,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };
  }

  public getConnectionString(name?: string): string {
    const resolvedName = name ?? DEFAULT_CONNECTION_NAME;
    const entry = this.entries.get(resolvedName);
    if (!entry) {
      throw new ValidationError(`Connection '${resolvedName}' not found. Use mssql_list_connections to inspect available names.`);
    }
    return entry.connectionString;
  }

  public addConnection(name: string, connectionString: string, description?: string): ConnectionSummary {
    if (this.entries.has(name)) {
      throw new ValidationError(`Connection '${name}' already exists.`);
    }

    const nowIso = new Date().toISOString();
    const normalizedConnectionString = normalizeConnectionString(connectionString);
    const entry: ConnectionEntry = {
      name,
      connectionString: normalizedConnectionString,
      description,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.entries.set(name, entry);
    this.persist();

    return {
      name: entry.name,
      description: entry.description,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  public updateConnection(name: string, connectionString: string, description?: string): ConnectionSummary {
    const existing = this.entries.get(name);
    if (!existing) {
      throw new ValidationError(`Connection '${name}' not found.`);
    }

    const updated: ConnectionEntry = {
      ...existing,
      connectionString: normalizeConnectionString(connectionString),
      description,
      updatedAt: new Date().toISOString(),
    };

    this.entries.set(name, updated);
    this.persist();

    return {
      name: updated.name,
      description: updated.description,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  public removeConnection(name: string): { removed: boolean; name: string } {
    const removed = this.entries.delete(name);
    if (removed) {
      this.persist();
    }
    return { removed, name };
  }

  public async testConnection(connectionString: string): Promise<{ ok: boolean; message: string }> {
    const sqlClient = new SqlClient({
      databaseUrl: normalizeConnectionString(connectionString),
      connectTimeoutMs: this.connectTimeoutMs,
    });

    try {
      await sqlClient.testConnection();
      return { ok: true, message: 'Connection test succeeded.' };
    } finally {
      await sqlClient.close();
    }
  }
}

export const DEFAULT_MSSQL_CONNECTION_NAME = DEFAULT_CONNECTION_NAME;
