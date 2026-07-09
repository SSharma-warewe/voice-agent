import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import httpProxy from "http-proxy";
import handler from "serve-handler";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const apiTarget = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:6080";
const port = Number(process.env.PORT ?? 4173);
const PROXY_RETRIES = Number(process.env.API_PROXY_RETRIES ?? 8);
const PROXY_RETRY_MS = Number(process.env.API_PROXY_RETRY_MS ?? 250);

const proxy = httpProxy.createProxyServer({});

function isRetryableProxyError(error) {
  const code = error?.code;
  return (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EPIPE" ||
    code === "ENOTFOUND"
  );
}

function sendBadGateway(res, message) {
  if (res && !res.headersSent && typeof res.writeHead === "function") {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        errorMessage: message || "API temporarily unavailable",
      }),
    );
  }
}

/**
 * Proxy to the Express API with short retries so brief boot/restart windows
 * do not surface as hard 502s to the browser.
 */
function proxyToApi(req, res, attempt = 1) {
  proxy.web(req, res, { target: apiTarget }, (error) => {
    if (!error) return;

    if (isRetryableProxyError(error) && attempt < PROXY_RETRIES) {
      const delay = PROXY_RETRY_MS * attempt;
      console.warn(
        `API proxy retry ${attempt}/${PROXY_RETRIES} after ${error.code} (wait ${delay}ms)`,
      );
      setTimeout(() => proxyToApi(req, res, attempt + 1), delay);
      return;
    }

    console.error("API proxy error:", error.message || error);
    sendBadGateway(
      res,
      `API unreachable at ${apiTarget} (${error.code || "error"})`,
    );
  });
}

createServer((req, res) => {
  const url = req.url ?? "/";

  // Public health + API are proxied to the Express API in the same container.
  if (url === "/health" || url.startsWith("/api")) {
    if (url.startsWith("/api")) {
      req.url = url.replace(/^\/api/, "") || "/";
    }
    proxyToApi(req, res);
    return;
  }

  return handler(req, res, {
    public: distDir,
    rewrites: [{ source: "**", destination: "/index.html" }],
  });
}).listen(port, "0.0.0.0", () => {
  console.log(
    `Web server listening on http://0.0.0.0:${port} (API proxy → ${apiTarget})`,
  );
});
