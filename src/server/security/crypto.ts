import crypto from "crypto";
import { getServerConfig } from "../config";

/**
 * Encrypt sensitive text (e.g. System User tokens) at rest using AES-256-GCM
 */
export function encryptText(plaintext: string): string {
  const config = getServerConfig();
  const masterKey = Buffer.from(config.ENCRYPTION_MASTER_KEY, "hex");
  if (masterKey.length !== 32) {
    throw new Error("ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes).");
  }

  const iv = crypto.randomBytes(12); // 96-bit IV standard for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Return base64 payload: iv:authTag:ciphertext
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypt AES-256-GCM ciphertext
 */
export function decryptText(encryptedPayload: string): string {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format (expected iv:authTag:ciphertext).");
  }

  const [ivB64, authTagB64, cipherB64] = parts;
  const config = getServerConfig();
  const masterKey = Buffer.from(config.ENCRYPTION_MASTER_KEY, "hex");

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Compute Meta appsecret_proof = HMAC-SHA256(access_token, app_secret)
 */
export function generateAppSecretProof(accessToken: string, appSecret: string): string {
  return crypto.createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

/**
 * Timing-safe Meta Webhook verification (X-Hub-Signature-256)
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) return false;

  const expectedPrefix = "sha256=";
  if (!signatureHeader.startsWith(expectedPrefix)) return false;

  const receivedHex = signatureHeader.slice(expectedPrefix.length).trim();
  const hmac = crypto.createHmac("sha256", appSecret);
  hmac.update(rawBody);
  const calculatedHex = hmac.digest("hex");

  try {
    const a = Buffer.from(receivedHex, "hex");
    const b = Buffer.from(calculatedHex, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Timing-safe string comparison for verify tokens and secret keys
 */
export function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Hash password with salt using PBKDF2 (native crypto, 100,000 iterations SHA-512)
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.pbkdf2(password, salt, 100000, 64, "sha512", (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

/**
 * Verify password against salt:hash
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parts = storedHash.split(":");
    if (parts.length !== 2) return resolve(false);
    const [salt, keyHex] = parts;
    crypto.pbkdf2(password, salt, 100000, 64, "sha512", (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        const a = Buffer.from(keyHex, "hex");
        const b = derivedKey;
        if (a.length !== b.length) return resolve(false);
        resolve(crypto.timingSafeEqual(a, b));
      } catch {
        resolve(false);
      }
    });
  });
}

/**
 * Secure lightweight HMAC-SHA256 JWT implementation using native Node crypto
 */
export interface JwtPayload {
  userId: string;
  email: string;
  role: "superadmin" | "admin" | "subadmin" | "user";
  projectIds?: string[];
  activeWabaId?: string;
  activeProjectId?: string;
  exp: number;
  iat: number;
}

export function signJwt(payload: Omit<JwtPayload, "iat" | "exp">, expiresInSeconds = 3600 * 8): string {
  const config = getServerConfig();
  const secret = config.JWT_SECRET || config.API_KEY_HASH_SECRET;

  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const b64Payload = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const dataToSign = `${b64Header}.${b64Payload}`;

  const signature = crypto.createHmac("sha256", secret).update(dataToSign).digest("base64url");
  return `${dataToSign}.${signature}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [b64Header, b64Payload, signature] = parts;
    const config = getServerConfig();
    const secret = config.JWT_SECRET || config.API_KEY_HASH_SECRET;

    const dataToSign = `${b64Header}.${b64Payload}`;
    const expectedSig = crypto.createHmac("sha256", secret).update(dataToSign).digest("base64url");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const payload: JwtPayload = JSON.parse(Buffer.from(b64Payload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Hash an API key using SHA-256 and server-side pepper from API_KEY_PEPPER
 */
export function hashApiKey(rawKey: string, pepper?: string): string {
  const p = pepper || getServerConfig().API_KEY_PEPPER || process.env.API_KEY_PEPPER || "wae_server_pepper_secure_salt_2026";
  return crypto.createHmac("sha256", p).update(rawKey).digest("hex");
}

/**
 * Verify API key against stored hash in constant time
 */
export function verifyApiKeyHash(rawKey: string, storedHash: string, pepper?: string): boolean {
  try {
    const computedHash = hashApiKey(rawKey, pepper);
    const bufA = Buffer.from(computedHash, "hex");
    const bufB = Buffer.from(storedHash, "hex");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Generate a new API key formatted like "wae_live_" + base64url
 * key_prefix: first chars for lookup and display
 */
export function generateWaeApiKey(): { rawKey: string; keyPrefix: string; keyHash: string } {
  const base64url = crypto.randomBytes(32).toString("base64url");
  const rawKey = `wae_live_${base64url}`;
  const keyPrefix = rawKey.slice(0, 16);
  const keyHash = hashApiKey(rawKey);
  return { rawKey, keyPrefix, keyHash };
}

export { normalizePhoneE164, isValidE164 } from "@/shared/utils/phone";

/**
 * Mask recipient phone number (e.g. +91••••••3210)
 */
export function maskRecipientPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.trim();
  const digits = cleaned.replace(/[^\d+]/g, "");
  if (digits.length <= 6) return digits;

  const hasPlus = digits.startsWith("+");
  const raw = hasPlus ? digits.slice(1) : digits;
  if (raw.length <= 5) return digits;

  const ccLen = raw.length > 10 ? raw.length - 10 : (raw.length > 8 ? 2 : 1);
  const prefix = (hasPlus ? "+" : "") + raw.slice(0, ccLen);
  const suffix = raw.slice(-4);
  return `${prefix}••••••${suffix}`;
}

/**
 * Generate a new API key with a prefix and hash
 */
export function generateApiKey(_projectId?: string): { key: string; rawKey: string; keyPrefix: string; keyHash: string } {
  const { rawKey, keyPrefix, keyHash } = generateWaeApiKey();
  return { key: rawKey, rawKey, keyPrefix, keyHash };
}

