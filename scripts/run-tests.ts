import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const testsDir = path.join(process.cwd(), "tests");
const files = fs
  .readdirSync(testsDir)
  .filter((f) => f.endsWith(".test.ts"))
  .sort();

console.log(`Running ${files.length} test suite(s)...\n`);

let passed = 0;
let failed = 0;

for (const file of files) {
  const fullPath = path.join(testsDir, file);
  console.log(`=== ${file} ===`);
  const res = spawnSync(process.execPath, ["--import", "tsx", fullPath], {
    stdio: "inherit",
    env: process.env,
  });
  if (res.status === 0) {
    passed++;
  } else {
    failed++;
    console.error(`FAILED: ${file} (exit code ${res.status})\n`);
  }
}

console.log(`\nSummary: ${passed} passed, ${failed} failed out of ${files.length} suites.`);
process.exit(failed > 0 ? 1 : 0);
