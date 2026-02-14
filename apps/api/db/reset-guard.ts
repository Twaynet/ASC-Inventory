/**
 * Reset Guard — Deadman's Switch for Destructive Seed Operations
 *
 * Prevents accidental TRUNCATE / reset against non-local databases.
 * Extracted as a standalone module for testability.
 */

export interface DbConfig {
  host: string;
  dbName: string;
  user: string;
  ssl: boolean;
}

export interface ResetEnv {
  /** Set to "YES" to confirm reset on non-local DBs */
  CONFIRM_DB_RESET?: string;
  /** Set to "YES_I_UNDERSTAND" to confirm reset when facility count tripwire fires */
  CONFIRM_DB_RESET_FORCE?: string;
  NODE_ENV?: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '']);

/**
 * Returns true if the DB host looks like a local development database.
 */
export function isLocalDb(config: DbConfig): boolean {
  return LOCAL_HOSTS.has(config.host) && !config.ssl;
}

/**
 * Asserts that a destructive --reset is allowed given the current environment.
 * Throws a descriptive error if reset is blocked.
 *
 * Rules:
 * 1. Local DB (localhost, no SSL) → always allowed.
 * 2. Non-local DB → requires CONFIRM_DB_RESET="YES".
 * 3. NODE_ENV="production" → always blocked (even with confirmation).
 */
export function assertResetAllowed(env: ResetEnv, config: DbConfig): void {
  // Hard block: never allow reset in production
  if (env.NODE_ENV === 'production') {
    throw new ResetBlockedError(
      'RESET BLOCKED: NODE_ENV is "production". Destructive reset is never allowed in production.',
      config,
    );
  }

  // Local dev DB → safe, allow without confirmation
  if (isLocalDb(config)) {
    return;
  }

  // Non-local DB → require explicit confirmation
  if (env.CONFIRM_DB_RESET !== 'YES') {
    throw new ResetBlockedError(
      [
        'RESET BLOCKED: Target database is not localhost.',
        `  Host:     ${config.host}`,
        `  Database: ${config.dbName}`,
        `  User:     ${config.user}`,
        `  SSL:      ${config.ssl}`,
        '',
        'To proceed, set: CONFIRM_DB_RESET=YES',
        'Example:  CONFIRM_DB_RESET=YES npm run db:seed -- --reset',
      ].join('\n'),
      config,
    );
  }
}

/**
 * Secondary tripwire: checks facility count before truncation.
 * If the database has more than `threshold` facilities, requires
 * CONFIRM_DB_RESET_FORCE="YES_I_UNDERSTAND" to proceed.
 *
 * This catches the case where someone runs --reset against a populated
 * demo or staging database that has real-looking data.
 *
 * @param facilityCount - number of facilities currently in the DB
 * @param env - environment variables
 * @param config - DB connection config (for error messaging)
 * @param threshold - facility count above which the tripwire fires (default: 1)
 */
export function assertFacilityCountSafe(
  facilityCount: number,
  env: ResetEnv,
  config: DbConfig,
  threshold = 1,
): void {
  if (facilityCount <= threshold) return;

  if (env.CONFIRM_DB_RESET_FORCE !== 'YES_I_UNDERSTAND') {
    throw new ResetBlockedError(
      [
        `RESET BLOCKED: Database has ${facilityCount} facilities (threshold: ${threshold}).`,
        'This looks like a populated environment. Truncation would destroy all tenant data.',
        `  Host:     ${config.host}`,
        `  Database: ${config.dbName}`,
        '',
        'To proceed, set: CONFIRM_DB_RESET_FORCE=YES_I_UNDERSTAND',
        'Example:  CONFIRM_DB_RESET=YES CONFIRM_DB_RESET_FORCE=YES_I_UNDERSTAND npm run db:seed -- --reset',
      ].join('\n'),
      config,
    );
  }
}

export class ResetBlockedError extends Error {
  public readonly dbConfig: DbConfig;

  constructor(message: string, config: DbConfig) {
    super(message);
    this.name = 'ResetBlockedError';
    this.dbConfig = config;
  }
}
