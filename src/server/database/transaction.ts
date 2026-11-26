import sql from "mssql";
import { getDbPool } from "./connection";

export async function withTransaction<T>(
  callback: (transaction: sql.Transaction) => Promise<T>
): Promise<T> {
  const pool = await getDbPool();
  if (!pool) {
    throw new Error("DATABASE_UNAVAILABLE");
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
