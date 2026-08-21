import express from "express";
import helmet from "helmet";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import productRoutes from "./routes/products.js";
import saleRoutes from "./routes/sales.js";
import settingsRoutes from "./routes/settings.js";
import labelRoutes from "./routes/labels.js";
import printRoutes from "./routes/print.js";
import reportRoutes from "./routes/reports.js";
import categoryRoutes from "./routes/categories.js";
import { backupInfo } from "./backup.js";
import { requireAuth } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "img-src": ["'self'", "data:", "blob:"],
        "connect-src": ["'self'"],
        "upgrade-insecure-requests": null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

function originCheck(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(400).json({ error: "Invalid Origin header" });
  }
  if (originHost !== req.headers.host) {
    return res.status(403).json({ error: "Cross-origin requests are not allowed" });
  }
  next();
}

function httpsRedirect(req, res, next) {
  if (req.headers["x-forwarded-proto"] === "http" && (req.method === "GET" || req.method === "HEAD")) {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }
  next();
}

app.use(originCheck);
app.use(httpsRedirect);
app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/labels", labelRoutes);
app.use("/api/print", printRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/categories", categoryRoutes);

app.get("/api/backup/info", requireAuth, (req, res) => {
  res.json(backupInfo());
});

const distDir = path.join(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`99tk POS server listening on http://0.0.0.0:${PORT}`);
});