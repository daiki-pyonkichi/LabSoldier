import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const PASSWORD_PREFIX = "scrypt";

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  const key = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${PASSWORD_PREFIX}:${salt}:${key}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [prefix, salt, key] = storedHash.split(":");
  if (prefix !== PASSWORD_PREFIX || !salt || !key) return false;

  const expected = Buffer.from(key, "hex");
  const actual = scryptSync(password, salt, expected.length);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
