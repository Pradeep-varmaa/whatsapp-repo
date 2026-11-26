import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { getDbPool } from "../src/server/database/connection";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function runMigrations() {
  console.log("==========================================");
  console.log("⚡ WHATSAPP COMMUNICATION ENGINE - MIGRATIONS");
  console.log("==========================================");

  const pool = await getDbPool();
  if (!pool) {
    console.warn("⚠️ MSSQL Server is currently unreachable. Make sure MSSQL is running or use mock mode.");
    process.exit(1);
  }

  const migrationsDir = path.join(__dirname, "../src/server/database/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migration file(s) in ${migrationsDir}:`);

  for (const file of files) {
    console.log(`\n▶️ Executing: ${file}...`);
    const filePath = path.join(migrationsDir, file);
    const sqlContent = fs.readFileSync(filePath, "utf8");

    try {
      // Split on standard GO batches if present or run directly
      const batches = sqlContent
        .split(/^\s*GO\s*$/gim)
        .map((b) => b.trim())
        .filter((b) => b.length > 0);

      for (const batch of batches) {
        await pool.request().batch(batch);
      }
      console.log(`✅ Success: ${file}`);
    } catch (err: any) {
      console.error(`❌ Error in ${file}:`, err.message);
      process.exit(1);
    }
  }

  console.log("\n🎉 All database migrations applied successfully!");
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
