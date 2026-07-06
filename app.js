const categories = [
  { id: "home", label: "الرئيسية" },
  { id: "syria", label: "سوريا" },
  { id: "palestine", label: "فلسطين" },
  { id: "hebrew", label: "ترجمات عبرية" },
  { id: "international", label: "ترجمات دولية" },
  { id: "middle-east", label: "الشرق الأوسط" }
];

const categoryNames = Object.fromEntries(categories.map((category) => [category.id, category.label]));
const newsKey = "mizan_news_v2";
const adminsKey = "mizan_admins_v1";
let activeView = "home";
let currentAdmin = localStorage.getItem("mizan_current_admin") || "";
let searchTerm = "";

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
  localStorage.setItem(newsKey, JSON.stringify(news));
}

function getAdmins() {
  return JSON.parse(localStorage.getItem(adminsKey) || "[]");
}

function setAdmins(admins) {
  localStorage.setItem(adminsKey, JSON.stringify(admins));
}

function visibleNews() {
  let news = getNews().sort((a, b) => b.createdAt - a.createdAt);
  if (activeView !== "home") {
    news = news.filter((item) => item.category === activeView);
  }
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    news = news.filter((item) => `${item.title} ${item.summary} ${item.body || ""}`.toLowerCase().includes(term));
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

function mainStory(item) {
  return `
    <article class="main-story">
      <img src="${item.image || fallbackImage}" alt="">
      <div class="story-overlay">
        <span class="story-tag">${categoryNames[item.category] || "خبر"}</span>
        <h2>${item.title}</h2>
        <p>${item.summary}</p>
      </div>
    </article>
  `;
}

function sideStory(item) {
  return `
    <article class="side-card">
      <img src="${item.image || fallbackImage}" alt="">
      <div>
        <span class="story-tag">${categoryNames[item.category] || "خبر"}</span>
        <h3>${item.title}</h3>
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
    <article class="news-card">
      <img src="${item.image || fallbackImage}" alt="">
      <div class="card-body">
        <span class="story-tag">${categoryNames[item.category] || "خبر"}</span>
        <h3>${item.title}</h3>
        <p>${item.summary}</p>
        <div class="meta">${placementName(item.placement)}</div>
      </div>
    </article>
  `).join("");
}

function renderSite() {
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
  authView.classList.toggle("hidden", Boolean(currentAdmin));
  dashboard.classList.toggle("hidden", !currentAdmin);
  currentAdminEl.textContent = currentAdmin ? `مرحبًا، ${currentAdmin}` : "";
  if (currentAdmin) {
    renderAdminNews();
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

function readImage(form) {
  const fields = form.elements;
  const file = fields.imageFile.files[0];
  if (!file) {
    return Promise.resolve(fields.imageUrl.value.trim());
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function switchAuthTab(tabName) {
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authTab === tabName);
  });
  document.querySelector("#loginForm").classList.toggle("hidden", tabName !== "login");
  document.querySelector("#registerForm").classList.toggle("hidden", tabName !== "register");
  document.querySelector("#authMessage").textContent = "";
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    activeView = viewButton.dataset.view;
    searchTerm = "";
    document.querySelector("#searchInput").value = "";
    renderSite();
  }

  if (event.target.closest("[data-close-admin]")) {
    closeAdmin();
  }

  const authTab = event.target.closest("[data-auth-tab]");
  if (authTab) {
    switchAuthTab(authTab.dataset.authTab);
  }

  if (event.target.closest("[data-logout]")) {
    currentAdmin = "";
    localStorage.removeItem("mizan_current_admin");
    renderAdminState();
  }

  const deleteButton = event.target.closest("[data-delete]");
  if (deleteButton) {
    setNews(getNews().filter((item) => item.id !== deleteButton.dataset.delete));
    renderSite();
    renderAdminNews();
  }

  const editButton = event.target.closest("[data-edit]");
  if (editButton) {
    const item = getNews().find((newsItem) => newsItem.id === editButton.dataset.edit);
    const form = document.querySelector("#newsForm");
    const fields = form.elements;
    fields.id.value = item.id;
    fields.title.value = item.title;
    fields.category.value = item.category;
    fields.placement.value = item.placement;
    fields.imageUrl.value = item.image?.startsWith("data:") ? "" : item.image;
    fields.summary.value = item.summary;
    fields.body.value = item.body || "";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

document.querySelector("#adminDialog").addEventListener("close", () => {
  if (location.hash === "#admin") {
    history.replaceState(null, "", location.pathname + location.search);
  }
});

document.querySelector("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = form.elements;
  const admins = getAdmins();
  const admin = admins.find((item) => item.username === fields.username.value.trim() && item.password === fields.password.value);
  const authMessage = document.querySelector("#authMessage");

  if (!admins.length) {
    authMessage.textContent = "لا يوجد مدير مسجل بعد. استخدم تبويب تسجيل أدمن لإنشاء أول حساب.";
    return;
  }

  if (!admin) {
    authMessage.textContent = "بيانات الدخول غير صحيحة.";
    return;
  }

  currentAdmin = admin.username;
  localStorage.setItem("mizan_current_admin", currentAdmin);
  form.reset();
  renderAdminState();
});

document.querySelector("#registerForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = form.elements;
  const admins = getAdmins();
  const username = fields.username.value.trim();
  const authMessage = document.querySelector("#authMessage");

  if (admins.some((admin) => admin.username === username)) {
    authMessage.textContent = "اسم المدير مسجل مسبقًا.";
    return;
  }

  admins.push({ username, password: fields.password.value });
  setAdmins(admins);
  currentAdmin = username;
  localStorage.setItem("mizan_current_admin", currentAdmin);
  form.reset();
  renderAdminState();
});

document.querySelector("#newsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = form.elements;
  const news = getNews();
  const id = fields.id.value || makeId();
  const existing = news.find((item) => item.id === id);
  const image = await readImage(form) || existing?.image || fallbackImage;
  const item = {
    id,
    title: fields.title.value.trim(),
    category: fields.category.value,
    placement: fields.placement.value,
    image,
    summary: fields.summary.value.trim(),
    body: fields.body.value.trim(),
    createdAt: existing?.createdAt || Date.now()
  };

  setNews(existing ? news.map((newsItem) => newsItem.id === id ? item : newsItem) : [item, ...news]);
  form.reset();
  renderSite();
  renderAdminNews();
});

document.querySelector("#newsForm").addEventListener("reset", (event) => {
  setTimeout(() => {
    event.currentTarget.elements.id.value = "";
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
  }
});

fillCategorySelect();
renderSite();

if (location.hash === "#admin") {
  openAdmin();
}
