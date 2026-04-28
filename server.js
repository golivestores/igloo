const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = 8899;
const ORIGIN = "https://www.igloo.inc";
const ORIGIN_HOST = "www.igloo.inc";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ktx2": "image/ktx2",
  ".ogg": "audio/ogg",
  ".drc": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".wasm": "application/wasm",
};

function serveLocal(res, filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function proxyToOrigin(req, res) {
  const parsedUrl = url.parse(req.url);
  const options = {
    hostname: ORIGIN_HOST,
    port: 443,
    path: parsedUrl.path,
    method: req.method,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Referer: ORIGIN + "/",
      Host: ORIGIN_HOST,
      Accept: req.headers["accept"] || "*/*",
      "Accept-Encoding": "identity",
      Origin: ORIGIN,
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    // Remove headers that would block local usage
    delete headers["content-security-policy"];
    delete headers["strict-transport-security"];
    delete headers["x-frame-options"];
    headers["access-control-allow-origin"] = "*";

    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message, req.url);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end("Proxy error: " + err.message);
    }
  });

  req.pipe(proxyReq, { end: true });
}

const server = http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });
    return res.end();
  }

  const reqPath = url.parse(req.url).pathname;

  // Serve index.html for root
  if (reqPath === "/" || reqPath === "/index.html") {
    const served = serveLocal(res, path.join(__dirname, "index.html"));
    if (!served) {
      res.writeHead(404);
      res.end("index.html not found");
    }
    console.log("→ LOCAL index.html");
    return;
  }

  // Try local file first (assets/ directory)
  const localPath = path.join(__dirname, reqPath);
  if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    console.log("→ LOCAL", reqPath);
    serveLocal(res, localPath);
    return;
  }

  // Proxy everything else to origin
  console.log("→ PROXY", reqPath);
  proxyToOrigin(req, res);
});

server.listen(PORT, () => {
  console.log(`\nIgloo mirror server running at http://localhost:${PORT}/`);
  console.log("Local JS files served locally, all other assets proxied to CDN\n");
});

server.on("error", (err) => {
  console.error("Server error:", err.message);
});
