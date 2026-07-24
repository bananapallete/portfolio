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
      Couldn't load data.json.<br/>
      If you opened this file directly (file://), your browser's security policy may be blocking the data from loading.<br/>
      Select the data.json file below, or serve this folder with a local server (e.g. VSCode Live Server, <code>python -m http.server</code>).
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
        alert("There was an error reading the JSON file.");
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
    document.body.classList.add("has-hero-video");
    dim.style.opacity = p.heroDim != null ? p.heroDim : 0.5;
  } else {
    media.hidden = true;
    hero.classList.remove("has-video");
    document.body.classList.remove("has-hero-video");
  }
}

function renderHeader() {
  const p = siteData.profile || {};
  document.getElementById("brandName").textContent = p.nickname || p.name || "Portfolio";
  document.getElementById("brandRole").textContent = p.role || "";
  const heroTitleEl = document.getElementById("heroTitle");
  if (p.showHeroTitle === false) {
    heroTitleEl.hidden = true;
  } else {
    heroTitleEl.hidden = false;
    heroTitleEl.textContent = p.heroTitle || `Hi, I'm ${p.nickname || p.name || ""}`;
  }
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

function makeTab(text, isActive, onClick) {
  const btn = document.createElement("button");
  btn.className = "tab" + (isActive ? " active" : "");
  const label = document.createElement("span");
  label.className = "tab-label";
  // 볼드 글자가 폭을 정하고(레이아웃 안 흔들림), 레귤러 글자는 그 위에 겹쳐 크로스페이드
  const bold = document.createElement("span");
  bold.className = "tl-bold";
  bold.textContent = text;
  const reg = document.createElement("span");
  reg.className = "tl-reg";
  reg.textContent = text;
  label.appendChild(bold);
  label.appendChild(reg);
  btn.appendChild(label);
  btn.addEventListener("click", onClick);
  return btn;
}

function renderTabs() {
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";

  tabs.appendChild(makeTab("All", currentFilter === ALL_KEY, () => {
    currentFilter = ALL_KEY;
    renderTabs();
    renderGrid();
  }));

  (siteData.categories || []).forEach((cat) => {
    tabs.appendChild(makeTab(cat.name, currentFilter === cat.id, () => {
      currentFilter = cat.id;
      renderTabs();
      renderGrid();
    }));
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
    grid.innerHTML = `<div class="empty-state">No projects yet.</div>`;
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

// 모바일에서는 헤더가 히어로 위에 투명하게 떠 있으므로, 히어로를
// 벗어나 밝은 배경(작업물 목록) 위로 스크롤되면 헤더를 다시 불투명하게 바꾼다
function setupHeaderScroll() {
  const header = document.querySelector(".site-header");
  const hero = document.getElementById("hero");
  if (!header || !hero) return;
  const update = () => {
    const threshold = hero.offsetHeight - 40;
    header.classList.toggle("scrolled", window.scrollY > threshold);
  };
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

function init() {
  if (!siteData) {
    renderFallback();
    return;
  }
  renderHeader();
  renderTabs();
  renderGrid();
  setupHeaderScroll();
}

loadSiteData().then((data) => {
  siteData = data;
  init();
});
