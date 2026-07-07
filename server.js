import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const dataDir = join(root, "data");
const newsFile = join(dataDir, "news.json");
const adminsFile = join(dataDir, "admins.json");
const port = Number(process.env.PORT || 10000);
const maxBodySize = 8 * 1024 * 1024;
const envAdminUser = String(process.env.ADMIN_USERNAME || "").trim();
const envAdminPassword = String(process.env.ADMIN_PASSWORD || "");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function hashPassword(password) {
  return createHash("sha256").update(password).digest("hex");
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    await mkdir(dataDir, { recursive: true });
    await writeJson(file, fallback);
    return fallback;
  }
}

async function writeJson(file, data) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > maxBodySize) {
      throw Object.assign(new Error("Payload too large"), { status: 413 });
    }
  }
  return body ? JSON.parse(body) : {};
}

function sendJson(response, status, data) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function sendError(response, error) {
  sendJson(response, error.status || 500, { error: error.message || "Server error" });
}

async function requireAdmin(request) {
  const username = request.headers["x-admin-user"] || "";
  const password = request.headers["x-admin-pass"] || "";
  const admins = await getAdmins();
  const found = admins.find((admin) => admin.username === username && admin.passwordHash === hashPassword(password));
  if (!found) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  return found;
}

async function getAdmins() {
  const storedAdmins = await readJson(adminsFile, []);
  const envAdmin = envAdminUser && envAdminPassword
    ? [{ username: envAdminUser, passwordHash: hashPassword(envAdminPassword), source: "env" }]
    : [];
  return [...envAdmin, ...storedAdmins];
}

function normalizeItem(item) {
  return {
    id: item.id || randomUUID(),
    title: String(item.title || "").trim(),
    category: item.category || "palestine",
    placement: item.placement || "normal",
    image: item.image || "",
    authorName: String(item.authorName || "").trim(),
    authorImage: item.authorImage || "",
    summary: String(item.summary || "").trim(),
    body: String(item.body || "").trim(),
    createdAt: item.createdAt || Date.now()
  };
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/news" && request.method === "GET") {
    return sendJson(response, 200, await readJson(newsFile, []));
  }

  if (url.pathname === "/api/admins/login" && request.method === "POST") {
    const body = await readBody(request);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const admins = await getAdmins();
    const found = admins.find((admin) => admin.username === username && admin.passwordHash === hashPassword(password));
    return found ? sendJson(response, 200, { username }) : sendJson(response, 401, { error: "Invalid login" });
  }

  if (url.pathname === "/api/news" && request.method === "POST") {
    await requireAdmin(request);
    const body = await readBody(request);
    const item = normalizeItem(body);
    if (!item.title || !item.summary) {
      return sendJson(response, 400, { error: "Missing title or summary" });
    }

    const news = await readJson(newsFile, []);
    const existing = news.find((entry) => entry.id === item.id);
    const next = existing ? news.map((entry) => entry.id === item.id ? { ...entry, ...item, createdAt: entry.createdAt } : entry) : [item, ...news];
    await writeJson(newsFile, next);
    return sendJson(response, 200, item);
  }

  if (url.pathname.startsWith("/api/news/") && request.method === "DELETE") {
    await requireAdmin(request);
    const id = decodeURIComponent(url.pathname.replace("/api/news/", ""));
    const news = await readJson(newsFile, []);
    await writeJson(newsFile, news.filter((item) => item.id !== id));
    return sendJson(response, 200, { ok: true });
  }

  return sendJson(response, 404, { error: "Not found" });
}

function serveStatic(request, response, url) {
  const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const filePath = normalize(join(root, relativePath));

  if (!filePath.startsWith(normalize(root))) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const stream = createReadStream(filePath);
  stream.on("error", () => {
    createReadStream(join(root, "index.html")).pipe(response);
  });
  response.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
  stream.pipe(response);
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    serveStatic(request, response, url);
  } catch (error) {
    sendError(response, error);
  }
}).listen(port, () => {
  console.log(`Mizan site listening on ${port}`);
});
