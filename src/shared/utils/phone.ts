/**
 * Phone number normalization and E.164 validation utilities
 * Safe for both client and server runtimes (zero node dependencies).
 */

/**
 * Normalize phone number to standard E.164 format:
 * - Strip spaces, dashes, brackets, parentheses, and dots
 * - Preserve or prepend the leading '+'
 * - Handles "+91 90146 83627", "919014683627", and "+919014683627" -> "+919014683627"
 */
export function normalizePhoneE164(phone: string): string {
  if (!phone) return "";
  const cleaned = phone.trim().replace(/[\s\-\(\)\[\]\.]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) {
    return "+" + cleaned.slice(1).replace(/\D/g, "");
  }
  return "+" + cleaned.replace(/\D/g, "");
}

/**
 * Validate standard E.164 format (+ followed by 7 to 15 digits)
 */
export function isValidE164(phone: string): boolean {
  if (!phone) return false;
  return /^\+[1-9]\d{6,14}$/.test(phone);
}
