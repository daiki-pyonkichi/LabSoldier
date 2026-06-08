import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import {
  authRouter,
  meHandler,
  updateMeHandler,
  deleteMeHandler,
  verifyMyPasswordHandler,
  changeMyPasswordHandler,
} from "./routes/auth.js";
import { presenceRouter } from "./routes/presence.js";
import { statsRouter } from "./routes/stats.js";
import { logsRouter } from "./routes/logs.js";
import { adminRouter } from "./routes/admin.js";
import { todosRouter } from "./routes/todos.js";
import { startTimeoutSweep } from "./lib/timeout.js";

const isProd = process.env.NODE_ENV === "production";

// 本番で JWT_SECRET が未設定だと token を偽造され放題なので起動を止める
if (isProd && !process.env.JWT_SECRET) {
  console.error("[backend] FATAL: JWT_SECRET must be set in production");
  process.exit(1);
}

const app = express();
app.set("trust proxy", true);
// FRONTEND_ORIGIN を指定すればそのオリジンに限定（同一オリジン配信なら未指定でOK）
app.use(cors(process.env.FRONTEND_ORIGIN ? { origin: process.env.FRONTEND_ORIGIN } : undefined));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.get("/api/me", meHandler);
app.patch("/api/me", updateMeHandler);
app.post("/api/me/verify-password", verifyMyPasswordHandler);
app.patch("/api/me/password", changeMyPasswordHandler);
app.delete("/api/me", deleteMeHandler);
app.use("/api/presence", presenceRouter);
app.use("/api/stats", statsRouter);
app.use("/api/logs", logsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/todos", todosRouter);

// フロントのビルド成果物を同一オリジンで配信（存在する場合のみ＝本番）
const frontendDist =
  process.env.FRONTEND_DIST ?? path.resolve(process.cwd(), "../frontend/dist");
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA フォールバック（/api 以外は index.html を返す）
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "not found" });
    }
    return res.sendFile(path.join(frontendDist, "index.html"));
  });
  console.log(`[backend] serving frontend from ${frontendDist}`);
}

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`[backend] listening on http://localhost:${port}`);
  console.log(`[backend] LAB_ALLOWED_IPS=${process.env.LAB_ALLOWED_IPS ?? "(unset)"}`);
  startTimeoutSweep();
});
