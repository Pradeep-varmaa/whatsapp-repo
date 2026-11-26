import { z } from "zod";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  // Microsoft SQL Server Connection
  MSSQL_HOST: z.string().min(1, "MSSQL_HOST is required"),
  MSSQL_PORT: z.coerce.number().default(1433),
  MSSQL_DATABASE: z.string().min(1, "MSSQL_DATABASE is required"),
  MSSQL_USER: z.string().min(1, "MSSQL_USER is required"),
  MSSQL_PASSWORD: z.string().min(1, "MSSQL_PASSWORD is required"),
  MSSQL_ENCRYPT: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(false),
  MSSQL_TRUST_SERVER_CERTIFICATE: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(true),

  // Redis & BullMQ
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(""),

  // Meta WhatsApp Cloud API Configuration
  META_GRAPH_API_VERSION: z.string().default("v25.0"),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1, "WHATSAPP_ACCESS_TOKEN (or ACCESS_TOKEN) is required"),
  WHATSAPP_WABA_ID: z.string().min(1, "WHATSAPP_WABA_ID (or ACCOUNT_ID) is required"),
  APP_SECRET: z.string().min(1, "APP_SECRET is required for Meta webhook HMAC and appsecret_proof verification"),
  WEBHOOK_VERIFY_TOKEN: z.string().default("wac_meta_webhook_verify_token_2026"),

  // Phone Number and Test Recipient
  PHONE_NUMBER_ID: z.string().optional().default(""),
  MOBILE_NUMBER: z.string().optional().default(""), // Used ONLY by explicit test-send endpoint

  // Backwards compatibility convenience properties
  APP_MODE: z.enum(["development", "production", "test", "live"]).default("live"),
  ACCESS_TOKEN: z.string().optional().default(""),
  ACCOUNT_ID: z.string().optional().default(""),
  META_BUSINESS_PORTFOLIO_ID: z.string().optional().default(""),

  // Cryptography & Internal Security Keys
  ENCRYPTION_MASTER_KEY: z.string().length(64, "ENCRYPTION_MASTER_KEY must be a 64-char hex string (32 bytes)"),
  API_KEY_HASH_SECRET: z.string().min(16, "API_KEY_HASH_SECRET must be at least 16 characters"),
  API_KEY_PEPPER: z.string().min(16).default("wae_server_pepper_secure_salt_2026"),
  WEBHOOK_SIGNING_SECRET: z.string().min(16, "WEBHOOK_SIGNING_SECRET must be at least 16 characters"),
  JWT_SECRET: z.string().min(16).default("wac_engine_jwt_signing_secret_super_long_32chars"),
  CRON_SECRET: z.string().min(8).default("engine_cron_secret_tick_2026"),

  // Groq Workflow Generation
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  GROQ_BASE_URL: z.string().default("https://api.groq.com/openai/v1"),
});

export type ServerConfig = z.infer<typeof envSchema>;

let cachedConfig: ServerConfig | null = null;
let lastEnvFileMtime = 0;

export function getServerConfig(forceReload = false): ServerConfig {
  let fileEnv: Record<string, string> = {};

  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const stats = fs.statSync(envPath);
      if (forceReload || stats.mtimeMs !== lastEnvFileMtime || !cachedConfig) {
        lastEnvFileMtime = stats.mtimeMs;
        fileEnv = dotenv.parse(fs.readFileSync(envPath));
        for (const [k, v] of Object.entries(fileEnv)) {
          process.env[k] = v;
        }
        cachedConfig = null;
      }
    }
  } catch {
    // Edge runtime or file permission fallback
  }

  if (cachedConfig && !forceReload && process.env.NODE_ENV === "production") {
    return cachedConfig;
  }

  // If user pasted a new token into either ACCESS_TOKEN or WHATSAPP_ACCESS_TOKEN, pick the latest one
  const token = (
    fileEnv.WHATSAPP_ACCESS_TOKEN ||
    fileEnv.ACCESS_TOKEN ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.ACCESS_TOKEN ||
    ""
  ).trim();

  const wabaId = (
    fileEnv.WHATSAPP_WABA_ID ||
    fileEnv.ACCOUNT_ID ||
    process.env.WHATSAPP_WABA_ID ||
    process.env.ACCOUNT_ID ||
    ""
  ).trim();

  const isProd = process.env.NODE_ENV === "production";
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  const strictSecrets = process.env.STRICT_SECRETS === "true";

  const resolveSecret = (name: string, val: string | undefined, devFallback: string): string => {
    const trimmed = (val || "").trim();
    if (trimmed) return trimmed;
    if (isProd && !isBuildPhase) {
      if (strictSecrets) return "";
      console.warn(`⚠️ [SECURITY] ${name} is not set in production; using fallback. Set ${name} in environment.`);
    }
    return devFallback;
  };

  const rawEnv = {
    ...process.env,
    META_GRAPH_API_VERSION:
      fileEnv.META_GRAPH_API_VERSION || process.env.META_GRAPH_API_VERSION || process.env.GRAPH_API_VERSION || "v25.0",
    WHATSAPP_ACCESS_TOKEN: token,
    ACCESS_TOKEN: token,
    WHATSAPP_WABA_ID: wabaId,
    ACCOUNT_ID: wabaId,
    PHONE_NUMBER_ID:
      fileEnv.PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID || "",
    APP_SECRET:
      fileEnv.APP_SECRET || process.env.APP_SECRET || "",
    WEBHOOK_VERIFY_TOKEN: resolveSecret(
      "WEBHOOK_VERIFY_TOKEN",
      fileEnv.WEBHOOK_VERIFY_TOKEN || process.env.WEBHOOK_VERIFY_TOKEN,
      "wac_meta_webhook_verify_token_2026"
    ),
    ENCRYPTION_MASTER_KEY: resolveSecret(
      "ENCRYPTION_MASTER_KEY",
      process.env.ENCRYPTION_MASTER_KEY,
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    ),
    API_KEY_HASH_SECRET: resolveSecret(
      "API_KEY_HASH_SECRET",
      process.env.API_KEY_HASH_SECRET,
      "wac_engine_hash_salt_secret_12345"
    ),
    API_KEY_PEPPER: resolveSecret(
      "API_KEY_PEPPER",
      fileEnv.API_KEY_PEPPER || process.env.API_KEY_PEPPER,
      "wae_server_pepper_secure_salt_2026"
    ),
    WEBHOOK_SIGNING_SECRET: resolveSecret(
      "WEBHOOK_SIGNING_SECRET",
      process.env.WEBHOOK_SIGNING_SECRET,
      "wac_webhook_signing_secret_98765"
    ),
    JWT_SECRET: resolveSecret(
      "JWT_SECRET",
      fileEnv.JWT_SECRET || process.env.JWT_SECRET,
      "wac_engine_jwt_signing_secret_super_long_32chars"
    ),
    CRON_SECRET: resolveSecret(
      "CRON_SECRET",
      fileEnv.CRON_SECRET || process.env.CRON_SECRET,
      "engine_cron_secret_tick_2026"
    ),
    META_BUSINESS_PORTFOLIO_ID:
      fileEnv.META_BUSINESS_PORTFOLIO_ID || process.env.META_BUSINESS_PORTFOLIO_ID || "",
    APP_MODE: (fileEnv.APP_MODE || process.env.APP_MODE || "live") as "development" | "production" | "test" | "live",
  };

  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    console.error(`❌ FATAL: Environment validation failed: ${errorDetails}`);
    throw new Error(`Environment validation failed at boot: ${errorDetails}`);
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}
