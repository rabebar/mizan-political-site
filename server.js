import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const superAdminUser = String(process.env.SUPER_ADMIN_USERNAME || envAdminUser || "").trim();

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absoluteUrl(request, pathOrUrl) {
  if (!pathOrUrl) {
    return "";
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const protocol = request.headers["x-forwarded-proto"] || "https";
  return `${protocol}://${request.headers.host}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function metaTagsForPost(request, item, url) {
  const siteTitle = "مؤسسة الميزان السياسي للأبحاث والترجمة الإعلامية";
  const title = item?.title || siteTitle;
  const description = item?.summary || "ترجمات دقيقة وتحليل سياسي علمي بعيدًا عن الضجيج.";
  const image = item?.image && !String(item.image).startsWith("data:") ? absoluteUrl(request, item.image) : "";
  const canonicalUrl = absoluteUrl(request, url.pathname);

  return `
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${escapeHtml(siteTitle)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ""}
  <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  ${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ""}`;
}

async function sendIndex(response, request, url) {
  let html = await readFile(join(root, "index.html"), "utf8");

  if (url.pathname.startsWith("/post/")) {
    const id = decodeURIComponent(url.pathname.replace("/post/", ""));
    const news = await readJson(newsFile, []);
    const item = news.find((entry) => entry.id === id);
    const title = escapeHtml(item?.title ? `${item.title} | مؤسسة الميزان السياسي` : "مؤسسة الميزان السياسي للأبحاث والترجمة الإعلامية");
    html = html
      .replace(/<title>.*?<\/title>/s, `<title>${title}</title>`)
      .replace("</head>", `${metaTagsForPost(request, item, url)}\n</head>`);
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
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

async function requireSuperAdmin(request) {
  const admin = await requireAdmin(request);
  if (admin.role !== "super_admin") {
    throw Object.assign(new Error("Super admin required"), { status: 403 });
  }
  return admin;
}

async function getAdmins() {
  const storedAdmins = await readJson(adminsFile, []);
  const envAdmin = envAdminUser && envAdminPassword
    ? [{ username: envAdminUser, passwordHash: hashPassword(envAdminPassword), role: "super_admin", source: "env" }]
    : [];
  return [
    ...envAdmin,
    ...storedAdmins.map((admin) => ({
      ...admin,
      role: admin.role === "super_admin" || admin.username === superAdminUser ? "super_admin" : "admin",
      source: admin.source || "stored"
    }))
  ];
}

function publicAdmin(admin) {
  return {
    username: admin.username,
    role: admin.role === "super_admin" ? "super_admin" : "admin",
    source: admin.source || "stored",
    createdAt: admin.createdAt || null
  };
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
    return found ? sendJson(response, 200, publicAdmin(found)) : sendJson(response, 401, { error: "Invalid login" });
  }

  if (url.pathname === "/api/admins" && request.method === "GET") {
    await requireSuperAdmin(request);
    const admins = await getAdmins();
    return sendJson(response, 200, admins.map(publicAdmin));
  }

  if (url.pathname === "/api/admins" && request.method === "POST") {
    await requireSuperAdmin(request);
    const body = await readBody(request);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const role = body.role === "super_admin" ? "super_admin" : "admin";

    if (username.length < 3 || password.length < 8) {
      return sendJson(response, 400, { error: "Invalid username or password" });
    }

    const admins = await getAdmins();
    if (admins.some((admin) => admin.username.toLowerCase() === username.toLowerCase())) {
      return sendJson(response, 409, { error: "Admin already exists" });
    }

    const storedAdmins = await readJson(adminsFile, []);
    storedAdmins.push({ username, passwordHash: hashPassword(password), role, createdAt: Date.now() });
    await writeJson(adminsFile, storedAdmins);
    return sendJson(response, 201, { username, role, source: "stored", createdAt: Date.now() });
  }

  if (url.pathname.startsWith("/api/admins/") && request.method === "DELETE") {
    const requester = await requireSuperAdmin(request);
    const username = decodeURIComponent(url.pathname.replace("/api/admins/", ""));

    if (username === envAdminUser) {
      return sendJson(response, 400, { error: "Cannot delete environment super admin" });
    }

    if (username === requester.username) {
      return sendJson(response, 400, { error: "Cannot delete current admin" });
    }

    const storedAdmins = await readJson(adminsFile, []);
    await writeJson(adminsFile, storedAdmins.filter((admin) => admin.username !== username));
    return sendJson(response, 200, { ok: true });
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

async function serveStatic(request, response, url) {
  if (url.pathname === "/" || url.pathname.startsWith("/post/")) {
    await sendIndex(response, request, url);
    return;
  }

  const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const filePath = normalize(join(root, relativePath));

  if (!filePath.startsWith(normalize(root))) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    response.end(content);
  } catch {
    await sendIndex(response, request, url);
  }
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    await serveStatic(request, response, url);
  } catch (error) {
    sendError(response, error);
  }
}).listen(port, () => {
  console.log(`Mizan site listening on ${port}`);
});
