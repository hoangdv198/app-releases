const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3303;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".apk": "application/vnd.android.package-archive"
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Upload-Url");
}

const server = http.createServer((req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  // Health check
  if (pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "app-releases-uploader", port: PORT }));
    return;
  }

  // Upload proxy endpoint: pipes upload stream directly to uploads.github.com
  if (pathname === "/api/proxy-upload" && req.method === "POST") {
    const targetUploadUrl = req.headers["x-upload-url"] || parsedUrl.searchParams.get("url");

    if (!targetUploadUrl) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing X-Upload-Url header or url query param" }));
      return;
    }

    try {
      const parsedTarget = new URL(targetUploadUrl);
      const authHeader = req.headers["authorization"] || "";
      const contentType = req.headers["content-type"] || "application/vnd.android.package-archive";
      const contentLength = req.headers["content-length"];

      console.log(`[Proxy Upload] Forwarding upload to: ${parsedTarget.origin}${parsedTarget.pathname}?${parsedTarget.search}`);
      console.log(`[Proxy Upload] Content-Length: ${contentLength} bytes (~${(contentLength / (1024 * 1024)).toFixed(1)} MB)`);

      const options = {
        hostname: parsedTarget.hostname,
        port: parsedTarget.port || 443,
        path: parsedTarget.pathname + parsedTarget.search,
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": contentType,
          "User-Agent": "AppReleases-LocalServer"
        }
      };

      if (contentLength) {
        options.headers["Content-Length"] = contentLength;
      }

      const ghReq = https.request(options, (ghRes) => {
        console.log(`[Proxy Upload] GitHub responded with status: ${ghRes.statusCode}`);
        setCorsHeaders(res);
        res.writeHead(ghRes.statusCode, {
          "Content-Type": ghRes.headers["content-type"] || "application/json"
        });
        ghRes.pipe(res);
      });

      ghReq.on("error", (err) => {
        console.error("[Proxy Upload Error]", err);
        setCorsHeaders(res);
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to forward request to GitHub: " + err.message }));
      });

      req.pipe(ghReq);
    } catch (err) {
      console.error("[Proxy URL Error]", err);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid target URL: " + err.message }));
    }
    return;
  }

  // Static file serving
  let filePath = path.join(ROOT_DIR, pathname);

  if (pathname === "/admin" || pathname === "/admin/") {
    filePath = path.join(ROOT_DIR, "admin", "index.html");
  } else if (pathname === "/mydts" || pathname === "/mydts/") {
    filePath = path.join(ROOT_DIR, "mydts", "index.html");
  } else if (pathname === "/vnsmartcall" || pathname === "/vnsmartcall/") {
    filePath = path.join(ROOT_DIR, "vnsmartcall", "index.html");
  } else if (pathname === "/" || pathname === "") {
    filePath = path.join(ROOT_DIR, "index.html");
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 App Releases Server running at: http://localhost:${PORT}`);
  console.log(`👉 Trang Admin Upload:         http://localhost:${PORT}/admin`);
  console.log(`👉 API Proxy Upload:           http://localhost:${PORT}/api/proxy-upload`);
  console.log(`======================================================\n`);
});
