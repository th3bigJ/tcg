import http from "node:http";
import { initScheduler } from "./scheduler";

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  // Simple health check endpoint for Coolify
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "tcg-scraper" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found\n");
});

server.listen(PORT, () => {
  console.log(`[server] HTTP Server running on port ${PORT}`);
  console.log(`[server] Initializing scheduler...`);
  initScheduler();
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("[server] SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("[server] HTTP server closed");
    process.exit(0);
  });
});
