const categories = [
  { id: "home", label: "الرئيسية" },
  { id: "syria", label: "سوريا" },
  { id: "palestine", label: "فلسطين" },
  { id: "articles", label: "مقالات" },
  { id: "hebrew", label: "ترجمات عبرية" },
  { id: "international", label: "ترجمات دولية" },
  { id: "middle-east", label: "الشرق الأوسط" }
];

const categoryNames = Object.fromEntries(categories.map((category) => [category.id, category.label]));
const newsKey = "mizan_news_v3";
const adminsKey = "mizan_admins_v1";
let activeView = "home";
let currentAdmin = localStorage.getItem("mizan_current_admin") || "";
let currentAdminPassword = sessionStorage.getItem("mizan_current_admin_password") || "";
let currentAdminRole = localStorage.getItem("mizan_current_admin_role") || "admin";
let searchTerm = "";
let serverMode = false;
let editingNewsId = "";

function makeId() {
  return crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const fallbackImage = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#f6faf7"/>
      <stop offset=".55" stop-color="#e8f1eb"/>
      <stop offset="1" stop-color="#fff7e2"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#g)"/>
  <rect x="90" y="92" width="1020" height="2" fill="#dfe7e2"/>
  <rect x="90" y="565" width="1020" height="2" fill="#dfe7e2"/>
  <rect x="90" y="125" width="18" height="425" fill="#c92a32"/>
  <rect x="128" y="125" width="18" height="425" fill="#247a4b"/>
  <rect x="166" y="125" width="18" height="425" fill="#d9a22b"/>
  <circle cx="820" cy="330" r="170" fill="#ffffff" opacity=".62"/>
  <path d="M560 290h420v16H560zm0 52h340v16H560zm0 52h260v16H560z" fill="#9aaaa1"/>
  <text x="600" y="206" text-anchor="middle" font-family="Tahoma, Arial" font-size="44" font-weight="700" fill="#18251f">الميزان السياسي</text>
</svg>`);

const fallbackAuthorImage = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
  <rect width="160" height="160" fill="#eef1e9"/>
  <circle cx="80" cy="58" r="30" fill="#23433a"/>
  <path d="M34 140c8-33 28-50 46-50s38 17 46 50" fill="#c9a877"/>
</svg>`);

const seedNews = [
  {
    id: makeId(),
    title: "قراءة في تحولات الخطاب الإسرائيلي تجاه غزة والضفة",
    category: "hebrew",
    placement: "main",
    image: fallbackImage,
    summary: "ترجمة وتحليل لمسارات النقاش في الإعلام العبري حول مستقبل المواجهة والسياسة الداخلية.",
    body: "نموذج خبر تجريبي يمكن تعديله من لوحة الإدارة.",
    createdAt: Date.now() - 1000 * 60 * 12
  },
  {
    id: makeId(),
    title: "سوريا بين ترتيبات الإقليم وحسابات الداخل",
    category: "syria",
    placement: "after-main-1",
    image: fallbackImage,
    summary: "تحليل يستعرض موقع سوريا في التفاعلات الإقليمية بعيدًا عن التبسيط والانفعال.",
    body: "",
    createdAt: Date.now() - 1000 * 60 * 50
  },
  {
    id: makeId(),
    title: "فلسطين في تقارير مراكز الدراسات: بين الأمن والسياسة",
    category: "palestine",
    placement: "after-main-2",
    image: fallbackImage,
    summary: "خلاصة بحثية تضع تقارير مراكز الدراسات في سياقها السياسي والمعرفي.",
    body: "",
    createdAt: Date.now() - 1000 * 60 * 120
  },
  {
    id: makeId(),
    title: "مؤشرات الشرق الأوسط في الإعلام الدولي",
    category: "middle-east",
    placement: "normal",
    image: fallbackImage,
    summary: "رصد لأبرز الاتجاهات في تغطية المنطقة داخل الصحافة العالمية.",
    body: "",
    createdAt: Date.now() - 1000 * 60 * 240
  },
  {
    id: makeId(),
    title: "لماذا نحتاج إلى قراءة سياسية بطيئة في زمن الخبر السريع؟",
    category: "articles",
    placement: "normal",
    image: fallbackImage,
    authorName: "هيئة التحرير",
    authorImage: fallbackAuthorImage,
    summary: "مقال افتتاحي عن ضرورة التمييز بين الخبر والتحليل، وبين المعلومة المؤكدة والانطباع السياسي.",
    body: "",
    createdAt: Date.now() - 1000 * 60 * 300
  }
];

function getNews() {
  const stored = localStorage.getItem(newsKey);
  if (!stored) {
    localStorage.setItem(newsKey, JSON.stringify(seedNews));
    return seedNews;
  }
  return JSON.parse(stored);
}

function setNews(news) {
  try {
    localStorage.setItem(newsKey, JSON.stringify(news));
    return true;
  } catch {
    alert("تعذر حفظ الخبر في المتصفح. جرّب استخدام صورة أصغر أو رابط صورة بدل الرفع.");
    return false;
  }
}

function getAdmins() {
  return JSON.parse(localStorage.getItem(adminsKey) || "[]");
}

function setAdmins(admins) {
  localStorage.setItem(adminsKey, JSON.stringify(admins));
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

async function syncNewsFromServer() {
  if (location.protocol === "file:") {
    return false;
  }

  try {
    const news = await apiRequest("/api/news");
    if (Array.isArray(news)) {
      serverMode = true;
      setNews(news.length ? news : seedNews);
      return true;
    }
  } catch {
    serverMode = false;
  }
  return false;
}

async function saveNewsToServer(item) {
  if (!serverMode) {
    return false;
  }

  await apiRequest("/api/news", {
    method: "POST",
    headers: {
      "x-admin-user": currentAdmin,
      "x-admin-pass": currentAdminPassword
    },
    body: JSON.stringify(item)
  });
  await syncNewsFromServer();
  return true;
}

async function deleteNewsFromServer(id) {
  if (!serverMode) {
    return false;
  }

  await apiRequest(`/api/news/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      "x-admin-user": currentAdmin,
      "x-admin-pass": currentAdminPassword
    }
  });
  await syncNewsFromServer();
  return true;
}

function adminHeaders() {
  return {
    "x-admin-user": currentAdmin,
    "x-admin-pass": currentAdminPassword
  };
}

async function loginViaServer(username, password) {
  if (!serverMode) {
    return false;
  }
  return apiRequest("/api/admins/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

async function fetchAdminsFromServer() {
  if (!serverMode || currentAdminRole !== "super_admin") {
    return [];
  }

  return apiRequest("/api/admins", {
    headers: adminHeaders()
  });
}

async function createAdminOnServer(admin) {
  return apiRequest("/api/admins", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(admin)
  });
}

async function deleteAdminFromServer(username) {
  return apiRequest(`/api/admins/${encodeURIComponent(username)}`, {
    method: "DELETE",
    headers: adminHeaders()
  });
}

function visibleNews() {
  let news = getNews().sort((a, b) => b.createdAt - a.createdAt);
  if (activeView !== "home") {
    news = news.filter((item) => item.category === activeView);
  }
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    news = news.filter((item) => `${item.title} ${item.summary} ${item.body || ""} ${item.authorName || ""}`.toLowerCase().includes(term));
  }
  return news;
}

function renderNav() {
  const nav = document.querySelector("#categoryNav");
  nav.innerHTML = categories.map((category) => `
    <button type="button" class="${activeView === category.id ? "is-active" : ""}" data-view="${category.id}">
      ${category.label}
    </button>
  `).join("");
}

function renderLeads() {
  const leadGrid = document.querySelector("#leadGrid");
  const news = visibleNews();
  const main = news.find((item) => item.placement === "main") || news[0];
  const first = news.find((item) => item.placement === "after-main-1") || news.find((item) => item.id !== main?.id);
  const second = news.find((item) => item.placement === "after-main-2") || news.find((item) => item.id !== main?.id && item.id !== first?.id);

  if (!main) {
    leadGrid.innerHTML = `<article class="main-story empty-story"><div class="story-overlay"><h2>لا توجد أخبار بعد</h2><p>ابدأ بإضافة خبر من لوحة الإدارة.</p></div></article>`;
    return;
  }

  leadGrid.innerHTML = `
    ${mainStory(main)}
    <div class="side-stories">
      ${first ? sideStory(first) : ""}
      ${second ? sideStory(second) : ""}
    </div>
  `;
}

function postHash(id) {
  return `#post/${encodeURIComponent(id)}`;
}

function fullPostUrl(id) {
  const url = new URL(location.href);
  url.hash = postHash(id).slice(1);
  return url.href;
}

function getPostIdFromHash() {
  return location.hash.startsWith("#post/") ? decodeURIComponent(location.hash.replace("#post/", "")) : "";
}

function setHomeVisibility(isHome) {
  document.querySelector(".mission-strip").classList.toggle("hidden", !isHome);
  document.querySelector("#leadGrid").classList.toggle("hidden", !isHome);
  document.querySelector(".latest-section").classList.toggle("hidden", !isHome);
  document.querySelector(".analysis-band").classList.toggle("hidden", !isHome);
  document.querySelector("#postView").classList.toggle("hidden", isHome);
}

function mainStory(item) {
  return `
    <article class="main-story post-link" data-open-post="${item.id}" role="link" tabindex="0">
      <img src="${item.image || fallbackImage}" alt="">
      <div class="story-overlay">
        <span class="story-tag">${categoryNames[item.category] || "خبر"}</span>
        <h2>${item.title}</h2>
        ${authorBlock(item)}
        <p>${item.summary}</p>
      </div>
    </article>
  `;
}

function sideStory(item) {
  return `
    <article class="side-card post-link" data-open-post="${item.id}" role="link" tabindex="0">
      <img src="${item.image || fallbackImage}" alt="">
      <div>
        <span class="story-tag">${categoryNames[item.category] || "خبر"}</span>
        <h3>${item.title}</h3>
        ${authorBlock(item)}
        <div class="meta">${placementName(item.placement)}</div>
      </div>
    </article>
  `;
}

function renderNewsList() {
  const list = document.querySelector("#newsList");
  const sectionHeading = document.querySelector("#sectionHeading");
  const sectionCount = document.querySelector("#sectionCount");
  const news = visibleNews();
  sectionHeading.textContent = searchTerm ? `نتائج البحث عن: ${searchTerm}` : activeView === "home" ? "آخر الأخبار والتحليلات" : categoryNames[activeView];
  sectionCount.textContent = `${news.length} مادة`;

  list.innerHTML = news.map((item) => `
    <article class="news-card post-link" data-open-post="${item.id}" role="link" tabindex="0">
      <img src="${item.image || fallbackImage}" alt="">
      <div class="card-body">
        <span class="story-tag">${categoryNames[item.category] || "خبر"}</span>
        <h3>${item.title}</h3>
        ${authorBlock(item)}
        <p>${item.summary}</p>
        <div class="meta">${placementName(item.placement)}</div>
      </div>
    </article>
  `).join("");
}

function renderPostView(id) {
  const postView = document.querySelector("#postView");
  const item = getNews().find((newsItem) => newsItem.id === id);

  if (!item) {
    setHomeVisibility(false);
    postView.innerHTML = `
      <article class="post-full">
        <button class="ghost" type="button" data-back-home>العودة للرئيسية</button>
        <h1>المادة غير موجودة</h1>
        <p>ربما تم حذف الخبر أو تغيّر الرابط.</p>
      </article>
    `;
    return;
  }

  document.title = `${item.title} | مؤسسة الميزان السياسي`;
  setHomeVisibility(false);
  postView.innerHTML = `
    <article class="post-full">
      <div class="post-actions">
        <button class="ghost" type="button" data-back-home>العودة للرئيسية</button>
        <div>
          <button class="ghost" type="button" data-copy-link="${item.id}">نسخ الرابط</button>
          <button class="primary" type="button" data-print-post>طباعة</button>
        </div>
      </div>
      <span class="story-tag">${categoryNames[item.category] || "خبر"}</span>
      <h1>${item.title}</h1>
      ${authorBlock(item)}
      <p class="post-summary">${item.summary}</p>
      <img class="post-hero" src="${item.image || fallbackImage}" alt="">
      <div class="post-body">${formatPostBody(item.body || item.summary)}</div>
    </article>
  `;
}

function formatPostBody(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function authorBlock(item) {
  if (!item.authorName && item.category !== "articles") {
    return "";
  }

  return `
    <div class="author-mini">
      <img src="${item.authorImage || fallbackAuthorImage}" alt="">
      <span>${item.authorName || "كاتب المقال"}</span>
    </div>
  `;
}

function renderSite() {
  if (getPostIdFromHash()) {
    renderPostView(getPostIdFromHash());
    return;
  }
  document.title = "مؤسسة الميزان السياسي للأبحاث والترجمة الإعلامية";
  setHomeVisibility(true);
  renderNav();
  renderLeads();
  renderNewsList();
}

function openAdmin() {
  document.querySelector("#adminDialog").showModal();
  renderAdminState();
}

function closeAdmin() {
  document.querySelector("#adminDialog").close();
  if (location.hash === "#admin") {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

function renderAdminState() {
  const authView = document.querySelector("#authView");
  const dashboard = document.querySelector("#dashboard");
  const currentAdminEl = document.querySelector("#currentAdmin");
  const superPanel = document.querySelector("#superAdminPanel");
  authView.classList.toggle("hidden", Boolean(currentAdmin));
  dashboard.classList.toggle("hidden", !currentAdmin);
  superPanel.classList.toggle("hidden", currentAdminRole !== "super_admin");
  currentAdminEl.textContent = currentAdmin ? `مرحبًا، ${currentAdmin} · ${roleName(currentAdminRole)}` : "";
  if (currentAdmin) {
    if (!editingNewsId) {
      setEditorMode();
    }
    renderAdminNews();
    renderAdminUsers();
  }
}

function renderAdminNews() {
  const adminList = document.querySelector("#adminNewsList");
  const news = getNews().sort((a, b) => b.createdAt - a.createdAt);
  adminList.innerHTML = news.map((item) => `
    <div class="admin-row">
      <div>
        <strong>${item.title}</strong>
        <p>${categoryNames[item.category]} · ${placementName(item.placement)}</p>
      </div>
      <div class="row-actions">
        <button class="ghost" type="button" data-edit="${item.id}">تعديل</button>
        <button class="danger" type="button" data-delete="${item.id}">حذف</button>
      </div>
    </div>
  `).join("");
}

function setEditorMode(item = null) {
  const state = document.querySelector("#editorState");
  const saveButton = document.querySelector("#saveMaterialButton");
  const form = document.querySelector("#newsForm");

  editingNewsId = item?.id || "";
  form.elements.id.value = editingNewsId;

  if (item) {
    state.innerHTML = `
      <strong>تعديل مادة منشورة</strong>
      <span>أنت تعدّل: ${item.title}. استخدم زر إلغاء التعديل إذا أردت نشر مادة جديدة.</span>
    `;
    saveButton.textContent = "حفظ التعديل";
    state.classList.add("is-editing");
    return;
  }

  state.innerHTML = `
    <strong>إضافة مادة جديدة</strong>
    <span>سيتم نشر مادة جديدة ولن يتم تعديل أي مادة منشورة.</span>
  `;
  saveButton.textContent = "نشر مادة جديدة";
  state.classList.remove("is-editing");
}

async function renderAdminUsers() {
  const list = document.querySelector("#adminUsersList");
  const message = document.querySelector("#adminUserMessage");

  if (currentAdminRole !== "super_admin") {
    list.innerHTML = "";
    return;
  }

  if (!serverMode) {
    list.innerHTML = `<p class="note">إدارة المدراء تعمل على النسخة المنشورة فقط.</p>`;
    return;
  }

  try {
    const admins = await fetchAdminsFromServer();
    list.innerHTML = admins.map((admin) => `
      <div class="admin-row">
        <div>
          <strong>${admin.username}</strong>
          <p>${roleName(admin.role)} · ${admin.source === "env" ? "حساب ثابت من Render" : "حساب مضاف من اللوحة"}</p>
        </div>
        <div class="row-actions">
          ${admin.source === "env" ? "" : `<button class="danger" type="button" data-delete-admin="${admin.username}">حذف الصلاحية</button>`}
        </div>
      </div>
    `).join("");
    message.textContent = "";
  } catch {
    list.innerHTML = "";
    message.textContent = "تعذر تحميل قائمة المدراء.";
  }
}

function roleName(role) {
  return role === "super_admin" ? "سوبر أدمن" : "أدمن تحرير";
}

function placementName(placement) {
  return {
    main: "رئيسي",
    "after-main-1": "أول بعد الرئيسي",
    "after-main-2": "ثاني بعد الرئيسي",
    normal: "خبر عادي"
  }[placement] || "خبر عادي";
}

function fillCategorySelect() {
  const select = document.querySelector('select[name="category"]');
  select.innerHTML = categories
    .filter((category) => category.id !== "home")
    .map((category) => `<option value="${category.id}">${category.label}</option>`)
    .join("");
}

function readImageFromFields(fields, fileFieldName, urlFieldName) {
  const file = fields[fileFieldName].files[0];
  if (!file) {
    return Promise.resolve(fields[urlFieldName].value.trim());
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function readImage(form) {
  return readImageFromFields(form.elements, "imageFile", "imageUrl");
}

document.addEventListener("click", async (event) => {
  const postLink = event.target.closest("[data-open-post]");
  if (postLink) {
    location.hash = postHash(postLink.dataset.openPost);
    return;
  }

  if (event.target.closest("[data-back-home]")) {
    history.pushState(null, "", location.pathname + location.search);
    renderSite();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const copyButton = event.target.closest("[data-copy-link]");
  if (copyButton) {
    const link = fullPostUrl(copyButton.dataset.copyLink);
    try {
      await navigator.clipboard.writeText(link);
      copyButton.textContent = "تم نسخ الرابط";
      setTimeout(() => {
        copyButton.textContent = "نسخ الرابط";
      }, 1400);
    } catch {
      prompt("انسخ الرابط:", link);
    }
    return;
  }

  if (event.target.closest("[data-print-post]")) {
    window.print();
    return;
  }

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    activeView = viewButton.dataset.view;
    searchTerm = "";
    document.querySelector("#searchInput").value = "";
    if (getPostIdFromHash()) {
      history.pushState(null, "", location.pathname + location.search);
    }
    renderSite();
  }

  if (event.target.closest("[data-close-admin]")) {
    closeAdmin();
  }

  if (event.target.closest("[data-logout]")) {
    currentAdmin = "";
    currentAdminPassword = "";
    currentAdminRole = "admin";
    localStorage.removeItem("mizan_current_admin");
    localStorage.removeItem("mizan_current_admin_role");
    sessionStorage.removeItem("mizan_current_admin_password");
    renderAdminState();
  }

  const deleteAdminButton = event.target.closest("[data-delete-admin]");
  if (deleteAdminButton) {
    try {
      await deleteAdminFromServer(deleteAdminButton.dataset.deleteAdmin);
      await renderAdminUsers();
    } catch {
      document.querySelector("#adminUserMessage").textContent = "تعذر حذف صلاحية هذا المدير.";
    }
    return;
  }

  const deleteButton = event.target.closest("[data-delete]");
  if (deleteButton) {
    try {
      if (serverMode) {
        await deleteNewsFromServer(deleteButton.dataset.delete);
      } else {
        setNews(getNews().filter((item) => item.id !== deleteButton.dataset.delete));
      }
    } catch {
      alert("تعذر حذف الخبر. تأكد من تسجيل الدخول للوحة الإدارة.");
    }
    renderSite();
    renderAdminNews();
  }

  const editButton = event.target.closest("[data-edit]");
  if (editButton) {
    const item = getNews().find((newsItem) => newsItem.id === editButton.dataset.edit);
    if (!item) {
      return;
    }
    const form = document.querySelector("#newsForm");
    const fields = form.elements;
    setEditorMode(item);
    fields.title.value = item.title;
    fields.category.value = item.category;
    fields.placement.value = item.placement;
    fields.authorName.value = item.authorName || "";
    fields.authorImageUrl.value = item.authorImage?.startsWith("data:") ? "" : item.authorImage || "";
    fields.imageUrl.value = item.image?.startsWith("data:") ? "" : item.image;
    fields.summary.value = item.summary;
    fields.body.value = item.body || "";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

document.addEventListener("keydown", (event) => {
  const postLink = event.target.closest?.("[data-open-post]");
  if (postLink && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    location.hash = postHash(postLink.dataset.openPost);
  }
});

document.querySelector("#adminDialog").addEventListener("close", () => {
  if (location.hash === "#admin") {
    history.replaceState(null, "", location.pathname + location.search);
  }
});

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = form.elements;
  const admins = getAdmins();
  const username = fields.username.value.trim();
  const password = fields.password.value;
  const admin = admins.find((item) => item.username === username && item.password === password);
  const authMessage = document.querySelector("#authMessage");

  if (serverMode) {
    try {
      const adminData = await loginViaServer(username, password);
      currentAdmin = username;
      currentAdminPassword = password;
      currentAdminRole = adminData.role || "admin";
      localStorage.setItem("mizan_current_admin", currentAdmin);
      localStorage.setItem("mizan_current_admin_role", currentAdminRole);
      sessionStorage.setItem("mizan_current_admin_password", currentAdminPassword);
      form.reset();
      renderAdminState();
      return;
    } catch {
      authMessage.textContent = "بيانات الدخول غير صحيحة.";
      return;
    }
  }

  if (!admins.length) {
    authMessage.textContent = "لا يوجد حساب أدمن محلي. على النسخة المنشورة اضبط ADMIN_USERNAME و ADMIN_PASSWORD من إعدادات Render.";
    return;
  }

  if (!admin) {
    authMessage.textContent = "بيانات الدخول غير صحيحة.";
    return;
  }

  currentAdmin = admin.username;
  currentAdminPassword = password;
  currentAdminRole = admin.role || "admin";
  localStorage.setItem("mizan_current_admin", currentAdmin);
  localStorage.setItem("mizan_current_admin_role", currentAdminRole);
  sessionStorage.setItem("mizan_current_admin_password", currentAdminPassword);
  form.reset();
  renderAdminState();
});

document.querySelector("#adminUserForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = form.elements;
  const message = document.querySelector("#adminUserMessage");

  try {
    await createAdminOnServer({
      username: fields.username.value.trim(),
      password: fields.password.value,
      role: fields.role.value
    });
    form.reset();
    message.textContent = "تم منح الصلاحية بنجاح.";
    await renderAdminUsers();
  } catch (error) {
    message.textContent = error.message === "Admin already exists"
      ? "هذا الحساب يملك صلاحية مسبقًا."
      : "تعذر منح الصلاحية. تأكد من كلمة سر لا تقل عن 8 أحرف.";
  }
});

document.querySelector("#newsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = form.elements;
  const news = getNews();
  const isEditing = Boolean(editingNewsId);
  const id = isEditing ? editingNewsId : makeId();
  const existing = isEditing ? news.find((item) => item.id === id) : null;
  const image = await readImage(form) || existing?.image || fallbackImage;
  const authorImage = await readImageFromFields(fields, "authorImageFile", "authorImageUrl") || existing?.authorImage || "";
  const item = {
    id,
    title: fields.title.value.trim(),
    category: fields.category.value,
    placement: fields.placement.value,
    image,
    authorName: fields.authorName.value.trim(),
    authorImage,
    summary: fields.summary.value.trim(),
    body: fields.body.value.trim(),
    createdAt: existing?.createdAt || Date.now()
  };

  try {
    if (serverMode) {
      await saveNewsToServer(item);
    } else {
      setNews(existing ? news.map((newsItem) => newsItem.id === id ? item : newsItem) : [item, ...news]);
    }
  } catch {
    alert("تعذر حفظ الخبر على السيرفر. تأكد من تسجيل الدخول وحجم الصور.");
    return;
  }
  form.reset();
  setEditorMode();
  renderSite();
  renderAdminNews();
});

document.querySelector("#newsForm").addEventListener("reset", (event) => {
  setTimeout(() => {
    event.currentTarget.elements.id.value = "";
    setEditorMode();
  });
});

document.querySelector("#searchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  searchTerm = document.querySelector("#searchInput").value.trim();
  activeView = "home";
  renderSite();
});

window.addEventListener("hashchange", () => {
  if (location.hash === "#admin") {
    openAdmin();
    return;
  }
  renderSite();
});

async function initApp() {
  await syncNewsFromServer();
  fillCategorySelect();
  renderSite();

  if (location.hash === "#admin") {
    openAdmin();
  }
}

initApp();
