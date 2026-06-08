import type { Request } from "express";

/**
 * クライアントIPを取り出す。プロキシ越しでも動くように x-forwarded-for を優先。
 */
export function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  return req.ip ?? "";
}

/**
 * IPが研究室のものか判定。
 * LAB_ALLOWED_IPS をカンマ区切りで .env に書く。
 * 担当: バックエンド係 + Day1で IP 実測 → 反映
 */
export function isLabIp(ip: string): boolean {
  const allowed = (process.env.LAB_ALLOWED_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(ip);
}
