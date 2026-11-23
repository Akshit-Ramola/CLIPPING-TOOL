import { env } from "./config/env.js";
import { clearStaleWorkDirs, ensureStorageDirs } from "./config/paths.js";
import { connectDatabase, disconnectDatabase } from "./config/db.js";
import { createApp } from "./app.js";
import { logger } from "./utils/logger.js";
import { markInterruptedJobs, stopAllCaptureJobs } from "./services/capture/jobManager.js";

async function main() {
  ensureStorageDirs();
  clearStaleWorkDirs();
  await connectDatabase();
  await markInterruptedJobs();

  const app = createApp();
  const server = app.listen(env.port, env.host, () => {
    logger.info(`API listening on http://${env.host}:${env.port}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received; stopping captures and closing ...`);
    server.close();
    await stopAllCaptureJobs();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.error("Failed to start server:", error.message);
  process.exit(1);
});
