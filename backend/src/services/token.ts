import { createHmac, timingSafeEqual } from "node:crypto";
import type { User } from "../types.js";

const TOKEN_TTL_SEC = 60 * 60 * 24 * 7;

interface AuthTokenPayload {
  sub: string;
  name: string;
  iat: number;
  exp: number;
}

function getSecret(): string {
  return process.env.JWT_SECRET ?? "labsoldier-dev-secret-change-me";
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(input: string): string {
  return createHmac("sha256", getSecret()).update(input).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signAuthToken(user: User): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    sub: user.id,
    name: user.name,
    iat: now,
    exp: now + TOKEN_TTL_SEC,
  } satisfies AuthTokenPayload);
  const input = `${header}.${payload}`;
  return `${input}.${sign(input)}`;
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;

  const input = `${header}.${payload}`;
  if (!safeEqual(sign(input), signature)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!parsed.sub || !parsed.exp || parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}
