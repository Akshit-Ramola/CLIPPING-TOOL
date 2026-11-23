import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { STORAGE_DIR } from "./config/paths.js";
import apiRoutes from "./routes/index.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: env.clientOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev", { skip: (req) => req.method === "GET" && /^\/api\/(jobs|renders)\/[a-f0-9]{24}$/.test(req.path) }));

  // Rendered clips and renders (supports HTTP range requests for the video player).
  // Work files and raw uploads are never exposed.
  app.use("/media/output", express.static(path.join(STORAGE_DIR, "output"), { index: false }));
  app.use("/media/test_out", express.static(path.join(STORAGE_DIR, "test_out"), { index: false }));
  app.use("/media/renders", express.static(path.join(STORAGE_DIR, "renders"), { index: false }));

  app.use("/api", apiRoutes);

  // In production, serve the built React app from client/dist.
  const clientDist = path.resolve(STORAGE_DIR, "..", "..", "client", "dist");
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api|\/media).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
