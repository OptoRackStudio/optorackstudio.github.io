const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const ROOT = process.cwd();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
};

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, headers);
  res.end(body);
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const requestedPath = urlPath === "/" ? "/index.html" : urlPath;
  const absolutePath = path.resolve(ROOT, `.${requestedPath}`);

  if (!absolutePath.startsWith(ROOT)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(absolutePath, (err, file) => {
    if (err) {
      send(res, 404, "Not Found");
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    send(res, 200, file, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
  });
});

server.listen(PORT, () => {
  console.log(`OptoRack running at http://localhost:${PORT}`);
});
