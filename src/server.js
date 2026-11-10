const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const logger = require("./logger");
const { authenticateToken } = require("./middleware/auth");
const hashRoutes     = require("./routes/hashRoutes");
const authRoutes     = require("./routes/authRoutes");
const adminRoutes    = require("./routes/adminRoutes");
const norionRoutes   = require("./routes/norionRoutes");
const newsroomRoutes = require("./routes/newsroomRoutes");
const evidenceRoutes = require("./routes/evidenceRoutes");
const blockchainService = require("./services/blockchainService");
const swaggerSpec = require("./swagger");

const app = express();

// Gate all requests until DB init + blockchain init finish.
// Without this a Vercel cold-start request can arrive before async init
// completes, returning "DB not initialized" or stale blockchain state.
let appReady;
app.use((req, res, next) => {
  appReady.then(() => next()).catch((err) => {
    res.status(503).json({ error: "Service initializing, please retry shortly.", detail: err.message });
  });
});

// Load Postman collection once at startup (for Vercel serverless compatibility)
let postmanCollectionBuffer = null;
try {
  const collectionPath = path.join(__dirname, "../postman_collection.json");
  if (fs.existsSync(collectionPath)) {
    postmanCollectionBuffer = fs.readFileSync(collectionPath);
  }
} catch (err) {
  logger.warn("Could not load Postman collection file at startup", err.message);
}

// Trust reverse-proxy headers (Vercel, nginx) so rate limiter reads real client IP
app.set("trust proxy", 1);

// ── Security ──
// Apply helmet globally but disable CSP — we set it manually per-route below
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: "1mb" }));

// ── Static Files ──
// Serve logo and other static assets from public directory
app.use(express.static(path.join(__dirname, "../public")));

// Strict CSP for all API routes
app.use("/api/", (_req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  next();
});

// ── Rate Limiting ──
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// ── Swagger Documentation (no auth) ──
// Serve Swagger UI via CDN to avoid Vercel static asset routing issues
app.get("/docs", (_req, res) => {
  const specUrl = "/openapi.json";
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DataIntegrity API — Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    .swagger-ui .topbar {
      display: none;
    }
    .swagger-ui-wrap {
      padding-top: 0;
    }
    .api-header {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%);
      border-bottom: 2px solid #e94e1b;
      min-height: 80px;
    }
    .api-header img {
      height: 60px;
      width: auto;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
    }
  </style>
</head>
<body>
<div class="swagger-ui-wrap">
  <div class="api-header">
    <img src="/comfortage-positivo-color.svg" alt="COMFORTage Logo">
    <a href="/cli-guide" style="position:absolute;right:170px;background:#2563eb;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">💻 CLI Guide</a>
    <a href="/guide" style="position:absolute;right:24px;background:#e94e1b;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">📖 Testing Guide</a>
  </div>
  <div id="swagger-ui"></div>
</div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
<script>
  SwaggerUIBundle({
    url: "${specUrl}",
    dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: "StandaloneLayout",
    persistAuthorization: true,
    displayOperationId: true,
  });
</script>
</body>
</html>`);
});

function renderMarkdownPage(title, mdPath, res) {
  const md = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf8") : "Guide not found.";
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${title} — COMFORTage</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown-light.min.css">
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>body{background:#f6f8fa;padding:32px} .markdown-body{max-width:960px;margin:0 auto;background:#fff;padding:40px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.1)}</style>
</head><body><article class="markdown-body" id="content"></article>
<script>document.getElementById("content").innerHTML=marked.parse(${JSON.stringify(md)});</script>
</body></html>`);
}

// Web UI
app.get("/", (_req, res) => {
  res.redirect(302, "/app");
});

app.get("/app", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/app.html"));
});

app.get("/favicon.ico", (_req, res) => {
  res.redirect(302, "/comfortage-positivo-color.svg");
});

// Role-based access guide
app.get("/guide", (_req, res) => {
  renderMarkdownPage("Testing Guide", path.join(__dirname, "../public/SWAGGER_GUIDE.md"), res);
});

// CLI / command-line usage guide
app.get("/cli-guide", (_req, res) => {
  renderMarkdownPage("CLI Guide", path.join(__dirname, "../public/CLI_GUIDE.md"), res);
});

// Swagger JSON endpoint — inject current host so Swagger UI calls the right server
app.get("/openapi.json", (req, res) => {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host  = req.headers["x-forwarded-host"]  || req.get("host");
  const currentUrl = `${proto}://${host}`;
  const spec = {
    ...swaggerSpec,
    servers: [
      { url: currentUrl, description: "Current server" },
      ...swaggerSpec.servers.filter(s => s.url !== currentUrl),
    ],
  };
  res.setHeader("Content-Type", "application/json");
  res.json(spec);
});

// ── Postman Collection download (no auth) ──
app.get("/postman-collection.json", (req, res) => {
  if (!postmanCollectionBuffer) {
    return res.status(404).json({ error: "Postman collection not found" });
  }
  
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", "attachment; filename=DataIntegrity-API.postman_collection.json");
  res.send(postmanCollectionBuffer);
});

// ── Health endpoint (no auth) ──
app.get("/health", async (req, res) => {
  const dbModule = require("./db/database");
  const dbRecords = dbModule.prepare("SELECT COUNT(*) as count FROM datasets").get()?.count || 0;
  const health = await blockchainService.getHealth();
  const statusCode = health.status === "healthy" ? 200 : 503;
  res.status(statusCode).json({ ...health, dbRecords });
});

// ── Diagnostic endpoint (no auth) - for debugging initialization ──
app.get("/health/debug", (req, res) => {
  const db = require("./db/database");
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
  const roles = db.prepare("SELECT role, COUNT(*) as n FROM users GROUP BY role").all();
  res.json({
    isConnected: blockchainService.isConnected,
    initError: blockchainService.initError,
    initLog: blockchainService.initLog,
    userCount,
    roles,
    env: {
      WALLET_ENCRYPTION_KEY: !!process.env.WALLET_ENCRYPTION_KEY,
      JWT_SECRET:            !!process.env.JWT_SECRET,
      CONTRACT_ADDRESS:      !!process.env.CONTRACT_ADDRESS,
      RELTIME_RPC_URL:       !!process.env.RELTIME_RPC_URL,
    },
    timestamp: new Date().toISOString(),
  });
});

// ── Auth routes (register + login = public; /me = protected inline) ──
app.use("/api/v1/auth", authRoutes);

// ── Protected routes ──
app.use("/api/v1/hash",     authenticateToken, hashRoutes);
app.use("/api/v1/admin",    authenticateToken, adminRoutes);
app.use("/api/v1/norion",   authenticateToken, norionRoutes);
app.use("/api/v1/newsroom", authenticateToken, newsroomRoutes);
app.use("/api/v1/evidence", authenticateToken, evidenceRoutes);

// ── 404 ──
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// ── Error handler ──
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Initialization ──
const db = require("./db/database");
const { seedUsers } = require("../scripts/seed-users");
const { seedDemoDatasets } = require("../scripts/seed-demo-datasets");

async function startServer() {
  await db.init();
  logger.info("Database initialized");

  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get()?.count || 0;
  if (userCount === 0) {
    try {
      await seedUsers(true);
      logger.info("Test users auto-seeded");
    } catch (err) {
      logger.error("Auto-seed (users) failed:", err.message);
    }
  }

  const datasetCount = db.prepare("SELECT COUNT(*) as count FROM datasets").get()?.count || 0;
  if (datasetCount === 0) {
    try {
      await seedDemoDatasets(true);
      logger.info("Demo datasets auto-seeded");
    } catch (err) {
      logger.error("Auto-seed (datasets) failed:", err.message);
    }
  }

  // Blockchain init is best-effort — dashboard falls back to dbRecords if RPC is down
  try {
    await blockchainService.initialize();
    logger.info("Blockchain service initialized");
  } catch (error) {
    logger.warn("Blockchain init failed (stats will use local DB count):", error.message);
  }

  if (require.main === module) {
    console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║   COMFORTage T3.3 — Blockchain Data Integrity Service    ║
  ║   Network: Reltime Mainnet (Chain ID: 32323)              ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
    app.listen(config.port, () => {
      logger.info(`API server running on port ${config.port}`);
      logger.info(`Health check: http://localhost:${config.port}/health`);
      logger.info(`API docs:     http://localhost:${config.port}/docs`);
      logger.info(`API base:     http://localhost:${config.port}/api/v1/hash`);
    });
  }
}

appReady = startServer();

appReady.catch(err => {
  logger.error("Failed to start server:", err.message);
});

// ── Vercel serverless export ──
module.exports = app;
