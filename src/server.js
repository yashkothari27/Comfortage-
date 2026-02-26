const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const logger = require("./logger");
const { authenticateToken } = require("./middleware/auth");
const hashRoutes = require("./routes/hashRoutes");
const blockchainService = require("./services/blockchainService");
const swaggerSpec = require("./swagger");

const app = express();

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

// ── Security ──
app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: "1mb" }));

// ── Rate Limiting ──
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// ── Swagger Documentation (no auth) ──
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    swaggerOptions: {
      persistAuthorization: true,
      displayOperationId: true,
    },
    customCss: ".swagger-ui .topbar { display: none }",
  })
);

// Swagger JSON endpoint
app.get("/openapi.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
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
  const health = await blockchainService.getHealth();
  const statusCode = health.status === "healthy" ? 200 : 503;
  res.status(statusCode).json(health);
});

// ── API Routes (auth required) ──
app.use("/api/v1/hash", authenticateToken, hashRoutes);

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
// Kick off blockchain init at module load; errors are logged but do not crash the process.
blockchainService.initialize()
  .then(() => logger.info("Blockchain service initialized successfully"))
  .catch((error) => {
    logger.error("Blockchain initialization failed:", error.message);
    if (error.stack) logger.error("Stack trace:", error.stack);
  });

// ── Local dev: start HTTP server only when run directly ──
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

// ── Vercel serverless export ──
module.exports = app;
