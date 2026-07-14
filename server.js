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
const maxBodySize = Number(process.env.MAX_BODY_SIZE || 25 * 1024 * 1024);
const envAdminUser = String(process.env.ADMIN_USERNAME || "").trim();
const envAdminPassword = String(process.env.ADMIN_PASSWORD || "");
const superAdminUser = String(process.env.SUPER_ADMIN_USERNAME || envAdminUser || "").trim();
const databaseUrl = process.env.DATABASE_URL || "";
let poolPromise = null;
let dbReadyPromise = null;

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

async function getPool() {
  if (!databaseUrl) {
    return null;
  }

  if (!poolPromise) {
    poolPromise = import("pg").then(({ Pool }) => new Pool({ connectionString: databaseUrl }));
  }

  const pool = await poolPromise;
  if (!dbReadyPromise) {
    dbReadyPromise = initializeDatabase(pool);
  }
  await dbReadyPromise;
  return pool;
}

async function initializeDatabase(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS news_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      placement TEXT NOT NULL,
      image TEXT,
      author_name TEXT,
      author_image TEXT,
      summary TEXT NOT NULL,
      body TEXT,
      created_at BIGINT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at BIGINT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS visit_events (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      post_id TEXT,
      category TEXT,
      visitor_hash TEXT NOT NULL,
      user_agent_hash TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )
  `);

  await pool.query("CREATE INDEX IF NOT EXISTS visit_events_created_at_idx ON visit_events(created_at)");
  await pool.query("CREATE INDEX IF NOT EXISTS visit_events_post_id_idx ON visit_events(post_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS visit_events_recent_idx ON visit_events(visitor_hash, user_agent_hash, path, created_at)");

  await migrateJsonDataToDatabase(pool);
}

async function migrateJsonDataToDatabase(pool) {
  const { rows: newsCountRows } = await pool.query("SELECT COUNT(*)::int AS count FROM news_items");
  if (newsCountRows[0]?.count === 0) {
    const fileNews = await readJson(newsFile, []);
    for (const item of fileNews) {
      await saveNewsItemToDatabase(pool, normalizeItem(item));
    }
  }

  const { rows: adminCountRows } = await pool.query("SELECT COUNT(*)::int AS count FROM admin_users");
  if (adminCountRows[0]?.count === 0) {
    const fileAdmins = await readJson(adminsFile, []);
    for (const admin of fileAdmins) {
      if (admin.username && admin.passwordHash) {
        await pool.query(
          `INSERT INTO admin_users (username, password_hash, role, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (username) DO NOTHING`,
          [admin.username, admin.passwordHash, admin.role === "super_admin" ? "super_admin" : "admin", admin.createdAt || Date.now()]
        );
      }
    }
  }
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

function jsonForHtml(data) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
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
  let item = null;
  let initialNews = [];

  try {
    initialNews = await getNewsItems();
  } catch (error) {
    console.error("Initial news load failed:", error.message);
  }

  if (url.pathname.startsWith("/post/")) {
    const id = decodeURIComponent(url.pathname.replace("/post/", ""));
    item = initialNews.find((newsItem) => newsItem.id === id) || null;
    if (!item) {
      try {
        item = await getNewsItem(id);
      } catch (error) {
        console.error("Post lookup failed:", error.message);
      }
    }
    const title = escapeHtml(item?.title ? `${item.title} | مؤسسة الميزان السياسي` : "مؤسسة الميزان السياسي للأبحاث والترجمة الإعلامية");
    html = html
      .replace(/<title>.*?<\/title>/s, `<title>${title}</title>`)
      .replace("</head>", `${metaTagsForPost(request, item, url)}\n</head>`);
  }

  html = html.replace(
    '<script src="/app.js"></script>',
    `<script id="initialNewsData" type="application/json">${jsonForHtml(initialNews)}</script>\n  <script src="/app.js"></script>`
  );

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
  recordVisit(request, url, item).catch((error) => {
    console.error("Visit tracking failed:", error.message);
  });
}

function isLikelyBot(request) {
  const userAgent = String(request.headers["user-agent"] || "");
  return /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|googlebot|bingbot|duckduckbot/i.test(userAgent);
}

function hashVisitValue(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function clientIp(request) {
  const forwardedFor = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwardedFor || request.socket.remoteAddress || "unknown";
}

async function recordVisit(request, url, item = null) {
  if (request.method !== "GET" || isLikelyBot(request)) {
    return;
  }

  const isPostPath = url.pathname.startsWith("/post/");
  if (isPostPath && !item) {
    return;
  }

  const pool = await getPool();
  if (!pool) {
    return;
  }

  const path = isPostPath ? url.pathname : "/";
  const salt = process.env.VISIT_HASH_SALT || envAdminPassword || "mizan-political";
  const visitorHash = hashVisitValue(`${salt}:${clientIp(request)}`);
  const userAgentHash = hashVisitValue(request.headers["user-agent"] || "");
  const recentWindow = Date.now() - 30 * 60 * 1000;
  const { rows } = await pool.query(
    `SELECT id FROM visit_events
     WHERE visitor_hash = $1 AND user_agent_hash = $2 AND path = $3 AND created_at >= $4
     LIMIT 1`,
    [visitorHash, userAgentHash, path, recentWindow]
  );

  if (rows.length) {
    return;
  }

  await pool.query(
    `INSERT INTO visit_events (id, path, post_id, category, visitor_hash, user_agent_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), path, item?.id || null, item?.category || (path === "/" ? "home" : null), visitorHash, userAgentHash, Date.now()]
  );
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
  const storedAdmins = await getStoredAdmins();
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

function dbNewsRowToItem(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    placement: row.placement,
    image: row.image || "",
    authorName: row.author_name || "",
    authorImage: row.author_image || "",
    summary: row.summary,
    body: row.body || "",
    createdAt: Number(row.created_at)
  };
}

async function getNewsItems() {
  const pool = await getPool();
  if (!pool) {
    return readJson(newsFile, []);
  }

  const { rows } = await pool.query("SELECT * FROM news_items ORDER BY created_at DESC");
  return rows.map(dbNewsRowToItem);
}

async function getNewsItem(id) {
  const pool = await getPool();
  if (!pool) {
    const news = await readJson(newsFile, []);
    return news.find((item) => item.id === id) || null;
  }

  const { rows } = await pool.query("SELECT * FROM news_items WHERE id = $1", [id]);
  return rows[0] ? dbNewsRowToItem(rows[0]) : null;
}

async function saveNewsItemToDatabase(pool, item) {
  await pool.query(
    `INSERT INTO news_items (
      id, title, category, placement, image, author_name, author_image, summary, body, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      category = EXCLUDED.category,
      placement = EXCLUDED.placement,
      image = EXCLUDED.image,
      author_name = EXCLUDED.author_name,
      author_image = EXCLUDED.author_image,
      summary = EXCLUDED.summary,
      body = EXCLUDED.body`,
    [
      item.id,
      item.title,
      item.category,
      item.placement,
      item.image,
      item.authorName,
      item.authorImage,
      item.summary,
      item.body,
      item.createdAt
    ]
  );
}

async function saveNewsItem(item) {
  const pool = await getPool();
  if (!pool) {
    const news = await readJson(newsFile, []);
    const existing = news.find((entry) => entry.id === item.id);
    const next = existing ? news.map((entry) => entry.id === item.id ? { ...entry, ...item, createdAt: entry.createdAt } : entry) : [item, ...news];
    await writeJson(newsFile, next);
    return;
  }

  const existing = await getNewsItem(item.id);
  await saveNewsItemToDatabase(pool, { ...item, createdAt: existing?.createdAt || item.createdAt });
}

async function deleteNewsItem(id) {
  const pool = await getPool();
  if (!pool) {
    const news = await readJson(newsFile, []);
    await writeJson(newsFile, news.filter((item) => item.id !== id));
    return;
  }

  await pool.query("DELETE FROM news_items WHERE id = $1", [id]);
}

async function getStoredAdmins() {
  const pool = await getPool();
  if (!pool) {
    return readJson(adminsFile, []);
  }

  const { rows } = await pool.query("SELECT username, password_hash, role, created_at FROM admin_users ORDER BY created_at DESC");
  return rows.map((row) => ({
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: Number(row.created_at),
    source: "stored"
  }));
}

async function addStoredAdmin(admin) {
  const pool = await getPool();
  if (!pool) {
    const storedAdmins = await readJson(adminsFile, []);
    storedAdmins.push(admin);
    await writeJson(adminsFile, storedAdmins);
    return;
  }

  await pool.query(
    `INSERT INTO admin_users (username, password_hash, role, created_at)
     VALUES ($1, $2, $3, $4)`,
    [admin.username, admin.passwordHash, admin.role, admin.createdAt]
  );
}

async function deleteStoredAdmin(username) {
  const pool = await getPool();
  if (!pool) {
    const storedAdmins = await readJson(adminsFile, []);
    await writeJson(adminsFile, storedAdmins.filter((admin) => admin.username !== username));
    return;
  }

  await pool.query("DELETE FROM admin_users WHERE username = $1", [username]);
}

function emptyAnalytics() {
  return {
    totals: { total: 0, last24h: 0, last7d: 0, last30d: 0 },
    topPosts: [],
    categories: []
  };
}

async function getAnalyticsSummary() {
  const pool = await getPool();
  if (!pool) {
    return emptyAnalytics();
  }

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const { rows: totalRows } = await pool.query(
    `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_at >= $1)::int AS last24h,
      COUNT(*) FILTER (WHERE created_at >= $2)::int AS last7d,
      COUNT(*) FILTER (WHERE created_at >= $3)::int AS last30d
     FROM visit_events`,
    [now - day, now - 7 * day, now - 30 * day]
  );

  const { rows: topPosts } = await pool.query(
    `SELECT
      v.post_id AS id,
      COALESCE(n.title, v.post_id) AS title,
      COALESCE(n.category, v.category) AS category,
      COUNT(*)::int AS visits
     FROM visit_events v
     LEFT JOIN news_items n ON n.id = v.post_id
     WHERE v.post_id IS NOT NULL
     GROUP BY v.post_id, n.title, n.category, v.category
     ORDER BY visits DESC
     LIMIT 8`
  );

  const { rows: categories } = await pool.query(
    `SELECT
      COALESCE(n.category, v.category, 'home') AS category,
      COUNT(*)::int AS visits
     FROM visit_events v
     LEFT JOIN news_items n ON n.id = v.post_id
     GROUP BY COALESCE(n.category, v.category, 'home')
     ORDER BY visits DESC`
  );

  const totals = totalRows[0] || emptyAnalytics().totals;
  return { totals, topPosts, categories };
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/news" && request.method === "GET") {
    return sendJson(response, 200, await getNewsItems());
  }

  if (url.pathname === "/api/analytics" && request.method === "GET") {
    await requireSuperAdmin(request);
    return sendJson(response, 200, await getAnalyticsSummary());
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

    const createdAt = Date.now();
    await addStoredAdmin({ username, passwordHash: hashPassword(password), role, createdAt });
    return sendJson(response, 201, { username, role, source: "stored", createdAt });
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

    await deleteStoredAdmin(username);
    return sendJson(response, 200, { ok: true });
  }

  if (url.pathname === "/api/news" && request.method === "POST") {
    await requireAdmin(request);
    const body = await readBody(request);
    const item = normalizeItem(body);
    if (!item.title || !item.summary) {
      return sendJson(response, 400, { error: "Missing title or summary" });
    }

    await saveNewsItem(item);
    return sendJson(response, 200, item);
  }

  if (url.pathname.startsWith("/api/news/") && request.method === "DELETE") {
    await requireAdmin(request);
    const id = decodeURIComponent(url.pathname.replace("/api/news/", ""));
    await deleteNewsItem(id);
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
