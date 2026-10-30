import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import {
  endSession,
  login,
  MODULE_KEYS,
  requirePermission,
  startSession,
  userFromRequest,
} from "./auth.js";
import masters from "./masters.js";
import sales from "./sales.js";
import estimates from "./estimates.js";
import books from "./books.js";
import users from "./users.js";
import dashboard from "./dashboard.js";

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());
app.use((_, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.get("/health", (_, res) => res.json({ ok: true }));
app.get("/auth/session", async (req, res) =>
  res.json({ user: await userFromRequest(req), moduleKeys: MODULE_KEYS }),
);
app.post("/auth/login", async (req, res) => {
  try {
    const user = await login(
      String(req.body?.username || ""),
      String(req.body?.password || ""),
    );
    if (!user)
      return res
        .status(401)
        .json({ error: "Username or password is not correct." });
    startSession(res, user);
    return res.json({ user });
  } catch (error: any) {
    return res.status(503).json({ error: error.message || "Login is unavailable." });
  }
});
app.post("/auth/logout", (_, res) => {
  endSession(res);
  res.json({ ok: true });
});
app.get("/foundation/check", requirePermission("dashboard"), (_, res) =>
  res.json({ ok: true }),
);
app.use("/", masters);
app.use("/", sales);
app.use("/", estimates);
app.use("/", books);
app.use("/", users);
app.use("/", dashboard);
app.use((_req, res) => res.status(404).json({ error: "Not found." }));
// Last-resort handler so unexpected errors return JSON instead of Express's HTML page.
app.use((error: any, _req: any, res: any, _next: any) => {
  console.error(error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

export default app;
