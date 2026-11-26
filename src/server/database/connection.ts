import sql from "mssql";
import { getServerConfig } from "../config";

const RETRY_COOLDOWN_MS = 30_000;

type DbState = {
  pool: sql.ConnectionPool | null;
  connecting: Promise<sql.ConnectionPool> | null;
  lastFailureTime: number;
};

// Survive hot reloads in Next.js dev
const g = globalThis as unknown as { __dbState?: DbState };
const state: DbState = (g.__dbState ??= {
  pool: null,
  connecting: null,
  lastFailureTime: 0,
});

async function createPool(): Promise<sql.ConnectionPool> {
  const config = getServerConfig();

  const newPool = new sql.ConnectionPool({
    user: config.MSSQL_USER,
    password: config.MSSQL_PASSWORD,
    server: config.MSSQL_HOST,
    port: Number(config.MSSQL_PORT),
    database: config.MSSQL_DATABASE,
    requestTimeout: 15_000,
    options: {
      encrypt: config.MSSQL_ENCRYPT,
      trustServerCertificate: config.MSSQL_TRUST_SERVER_CERTIFICATE,
      enableArithAbort: true,
      connectTimeout: 5_000,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
  });

  // If the connection drops later, drop the pool so the next call reconnects
  newPool.on("error", (err) => {
    console.error("[Database] Pool error:", err.message);
    if (state.pool === newPool) state.pool = null;
    newPool.close().catch(() => {});
  });

  try {
    await newPool.connect();
    console.log(
      `[Database] Connected to MSSQL at ${config.MSSQL_HOST}:${config.MSSQL_PORT}/${config.MSSQL_DATABASE}`
    );
    return newPool;
  } catch (err) {
    await newPool.close().catch(() => {});
    throw err;
  }
}

export async function getDbPool(): Promise<sql.ConnectionPool | null> {
  if (state.pool?.connected) return state.pool;

  // Share one in-flight connection attempt between concurrent requests
  if (state.connecting) return state.connecting.catch(() => null);

  // Don't hammer the database right after a failure
  if (Date.now() - state.lastFailureTime < RETRY_COOLDOWN_MS) return null;

  state.connecting = createPool()
    .then((p) => {
      state.pool = p;
      return p;
    })
    .catch((err: Error) => {
      state.lastFailureTime = Date.now();
      console.error(`[Database] Connection failed: ${err.message}`);
      throw err;
    })
    .finally(() => {
      state.connecting = null;
    });

  try {
    return await state.connecting;
  } catch {
    return null;
  }
}

/** Execute a parameterized query. Never build the query string from user input. */
export async function executeQuery<T = any>(
  query: string,
  params: Record<string, { type: any; value: any }> = {}
): Promise<T[]> {
  const activePool = await getDbPool();
  if (!activePool) throw new Error("DATABASE_UNAVAILABLE");

  const request = activePool.request();
  for (const [key, { type, value }] of Object.entries(params)) {
    request.input(key, type, value);
  }

  const result = await request.query(query);
  return result.recordset as T[];
}

export { sql };