/* ==========================================================================
   Unlimit_Cho Portfolio — 목록 페이지 로직 (블록 렌더링은 blocks.js 공용)
   ========================================================================== */

const ALL_KEY = "__all__";
let currentFilter = ALL_KEY;
let siteData = null;

function renderFallback() {
  const grid = document.getElementById("workGrid");
  grid.innerHTML = `
    <div class="empty-state">
      data.json을 불러오지 못했어요.<br/>
      브라우저에서 파일을 직접 열었다면(file://) 보안 정책 때문에 데이터를 못 읽어올 수 있어요.<br/>
      아래에서 data.json 파일을 직접 선택하거나, 로컬 서버(예: VSCode Live Server, <code>python -m http.server</code>)로 열어주세요.
      <div style="margin-top:16px;">
        <input type="file" accept="application/json" id="fallbackFile" />
      </div>
    </div>
  `;
  document.getElementById("fallbackFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        siteData = JSON.parse(reader.result);
        init();
      } catch (err) {
        alert("JSON 파일을 읽는 중 오류가 발생했어요.");
      }
    };
    reader.readAsText(file);
  });
}

function renderHero(p) {
  const hero = document.getElementById("hero");
  const media = document.getElementById("heroMedia");
  const video = document.getElementById("heroVideo");
  const dim = document.getElementById("heroDim");

  if (p.heroVideo) {
    video.src = p.heroVideo;
    media.hidden = false;
    hero.classList.add("has-video");
    dim.style.opacity = p.heroDim != null ? p.heroDim : 0.5;
  } else {
    media.hidden = true;
    hero.classList.remove("has-video");
  }
}

function renderHeader() {
  const p = siteData.profile || {};
  document.getElementById("brandName").textContent = p.nickname || p.name || "Portfolio";
  document.getElementById("brandRole").textContent = p.role || "";
  document.getElementById("heroName").textContent = p.nickname || p.name || "";
  document.getElementById("heroTagline").textContent = p.tagline || "";
  document.getElementById("footerName").textContent = p.name || p.nickname || "";
  renderHero(p);

  const contactEl = document.getElementById("footerContact");
  contactEl.innerHTML = "";
  const contact = p.contact || {};
  if (contact.phone) {
    const a = document.createElement("a");
    a.href = `tel:${contact.phone.replace(/\s+/g, "")}`;
    a.textContent = contact.phone;
    contactEl.appendChild(a);
  }
  (contact.emails || []).forEach((email) => {
    const a = document.createElement("a");
    a.href = `mailto:${email}`;
    a.textContent = email;
    contactEl.appendChild(a);
  });
}

function renderTabs() {
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = "tab" + (currentFilter === ALL_KEY ? " active" : "");
  allBtn.textContent = "전체";
  allBtn.addEventListener("click", () => {
    currentFilter = ALL_KEY;
    renderTabs();
    renderGrid();
  });
  tabs.appendChild(allBtn);

  (siteData.categories || []).forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "tab" + (currentFilter === cat.id ? " active" : "");
    btn.textContent = cat.name;
    btn.addEventListener("click", () => {
      currentFilter = cat.id;
      renderTabs();
      renderGrid();
    });
    tabs.appendChild(btn);
  });
}

function projectMediaHTML(project) {
  if (project.coverImage) {
    return `<img src="${project.coverImage}" alt="${project.title}" />`;
  }
  return `<span>${project.title}</span>`;
}

function goToProject(project) {
  const q = new URLSearchParams({ id: project.id });
  if (isPreviewMode()) q.set("preview", "1");
  location.href = "project.html?" + q.toString();
}

function renderGrid() {
  const grid = document.getElementById("workGrid");
  grid.innerHTML = "";

  const cats = (siteData.categories || []).filter(
    (c) => currentFilter === ALL_KEY || c.id === currentFilter
  );

  const cards = [];
  cats.forEach((cat) => {
    (cat.projects || []).forEach((project) => {
      cards.push({ project, cat });
    });
  });

  if (cards.length === 0) {
    grid.innerHTML = `<div class="empty-state">아직 등록된 프로젝트가 없어요.</div>`;
    return;
  }

  cards.forEach(({ project }) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-media">
        ${projectMediaHTML(project)}
      </div>
      <div class="card-body">
        <div class="card-title">${project.title}</div>
        ${project.summary ? `<div class="card-desc">${project.summary}</div>` : ""}
      </div>
    `;
    card.addEventListener("click", () => goToProject(project));
    grid.appendChild(card);
  });
}

function init() {
  if (!siteData) {
    renderFallback();
    return;
  }
  renderHeader();
  renderTabs();
  renderGrid();
}

loadSiteData().then((data) => {
  siteData = data;
  init();
});
