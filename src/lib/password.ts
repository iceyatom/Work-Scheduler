// Pure password/username helpers — no Next.js or DB imports, so this is safe to
// use from scripts (seed/backfill) as well as the app.

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_KEYLEN = 64;

/** Hash a password with scrypt + random salt. Stored as "saltHex:hashHex". */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Constant-time verification of a password against a stored "saltHex:hashHex". */
export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), SCRYPT_KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Username rules: 3–30 chars, letters/digits/._- , must start alphanumeric. */
export function validateUsername(username: string): string[] {
  const errors: string[] = [];
  const u = username.trim();
  if (u.length < 3 || u.length > 30) errors.push("Username must be 3–30 characters.");
  if (!/^[a-zA-Z0-9]/.test(u)) errors.push("Username must start with a letter or number.");
  if (!/^[a-zA-Z0-9._-]+$/.test(u)) errors.push("Username may only contain letters, numbers, and . _ -");
  return errors;
}

/** Password policy (common convention): 8+ chars with upper, lower, digit, and
 *  a special character. */
export function validatePassword(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 8) errors.push("Password must be at least 8 characters.");
  if (password.length > 100) errors.push("Password must be at most 100 characters.");
  if (!/[a-z]/.test(password)) errors.push("Password must include a lowercase letter.");
  if (!/[A-Z]/.test(password)) errors.push("Password must include an uppercase letter.");
  if (!/[0-9]/.test(password)) errors.push("Password must include a number.");
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push("Password must include a special character.");
  return errors;
}

/** The list shown in the UI so users know the rules up front. */
export const PASSWORD_RULES = [
  "At least 8 characters",
  "An uppercase and a lowercase letter",
  "A number",
  "A special character",
];
