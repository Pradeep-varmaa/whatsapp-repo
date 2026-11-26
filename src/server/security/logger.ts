/**
 * Log Redactor and Masking Utility
 * Ensures secrets, tokens, authorization headers, and raw phone numbers are never logged in plain text.
 */

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /authorization/i,
  /api[_-]?key/i,
  /credential/i,
  /private[_-]?key/i,
];

/**
 * Mask access tokens and long secrets
 */
export function maskSecret(secret?: string | null): string {
  if (!secret) return "";
  const str = String(secret).trim();
  if (str.length <= 8) return "[REDACTED]";
  return `${str.slice(0, 4)}...${str.slice(-4)}`;
}

/**
 * Mask phone numbers to preserve only last 4 digits for debugging
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `+${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

/**
 * Deep redaction for structured objects (payloads, headers, query params)
 */
export function redactObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    // Check if looks like a Bearer token
    if (obj.toLowerCase().startsWith("bearer ")) {
      return `Bearer ${maskSecret(obj.slice(7))}` as unknown as T;
    }
    return obj;
  }
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item)) as unknown as T;
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pat) => pat.test(key));
    if (isSensitiveKey) {
      if (typeof value === "string") {
        result[key] = maskSecret(value);
      } else {
        result[key] = "[REDACTED]";
      }
    } else if (key.toLowerCase().includes("phone") && typeof value === "string") {
      result[key] = maskPhone(value);
    } else {
      result[key] = redactObject(value);
    }
  }

  return result as T;
}

export const logger = {
  info: (message: string, context?: any) => {
    if (context !== undefined) {
      console.log(`[INFO] ${message}`, redactObject(context));
    } else {
      console.log(`[INFO] ${message}`);
    }
  },
  warn: (message: string, context?: any) => {
    if (context !== undefined) {
      console.warn(`[WARN] ${message}`, redactObject(context));
    } else {
      console.warn(`[WARN] ${message}`);
    }
  },
  error: (message: string, error?: any) => {
    const errPayload =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error;
    console.error(`[ERROR] ${message}`, redactObject(errPayload));
  },
};
