/* ==========================================================================
   Unlimit_Cho Portfolio — 목록 페이지 로직 (블록 렌더링은 blocks.js 공용)
   ========================================================================== */

// 탭은 필터가 아니라 해당 카테고리 섹션으로 스크롤하는 앵커.
// activeCatId는 현재 화면에 보이는 섹션의 카테고리 id (null = 최상단/All)
let activeCatId = null;
let siteData = null;

function renderFallback() {
  const grid = document.getElementById("workSections");
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

// 홈 화면 프로젝트 영역 배경색 (관리자에서 지정한 경우에만 기본 다크 배경 위에 덮어씀)
function applyWorkBg(p) {
  const work = document.querySelector(".work");
  if (!work) return;
  work.style.background = p.workBg || "";
}

function renderHeader() {
  const p = siteData.profile || {};
  document.getElementById("brandName").textContent = p.nickname || p.name || "Portfolio";
  document.getElementById("brandRole").textContent = p.role || "";
  document.getElementById("footerName").textContent = p.name || p.nickname || "";
  applyWorkBg(p);

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

/* ---------------- 카테고리 섹션으로 스크롤 + 스크롤 위치에 따른 활성 탭 ---------------- */

// 고정 헤더 아래 여백을 고려한 스크롤 오프셋
function headerOffset() {
  const h = document.querySelector(".site-header");
  return h ? h.getBoundingClientRect().bottom + 6 : 90;
}

function scrollToCategory(catId) {
  if (!catId) {
    if (window.lenis) window.lenis.scrollTo(0);
    else window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const el = document.getElementById(`cat-${catId}`);
  if (!el) return;
  // 엘리먼트 대신 숫자 좌표를 넘겨야 고정 헤더 오프셋이 정확히 적용된다
  const y = Math.max(0, el.getBoundingClientRect().top + window.scrollY - headerOffset());
  if (window.lenis) window.lenis.scrollTo(y);
  else window.scrollTo({ top: y, behavior: "smooth" });
}

// 스크롤 위치에 맞춰 활성 탭을 갱신 (스크롤 스파이)
function updateActiveTab() {
  const threshold = headerOffset() + 30;
  let current = null;
  // 최상단 근처에서는 All 활성 (첫 섹션이 헤더 바로 아래에서 시작하므로)
  if (window.scrollY > 40) {
    const secs = document.querySelectorAll(".work-section");
    secs.forEach((sec) => {
      if (sec.getBoundingClientRect().top <= threshold) current = sec.dataset.catId;
    });
    // 페이지 끝에 도달하면 마지막 섹션 활성
    // (마지막 섹션은 스크롤이 끝까지 가도 헤더에 못 닿을 수 있음)
    if (secs.length && window.innerHeight + window.scrollY >= document.body.scrollHeight - 40) {
      current = secs[secs.length - 1].dataset.catId;
    }
  }
  if (current !== activeCatId) {
    activeCatId = current;
    renderTabs();
  }
}

let scrollTick = false;
window.addEventListener("scroll", () => {
  if (scrollTick) return;
  scrollTick = true;
  requestAnimationFrame(() => {
    scrollTick = false;
    if (siteData) updateActiveTab();
  });
}, { passive: true });

function renderTabs() {
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";

  tabs.appendChild(makeTab("All", activeCatId === null, () => scrollToCategory(null)));

  (siteData.categories || []).forEach((cat) => {
    if (!(cat.projects || []).length) return; // 빈 카테고리는 섹션이 없으므로 탭도 생략
    tabs.appendChild(makeTab(cat.name, activeCatId === cat.id, () => scrollToCategory(cat.id)));
  });
}

function projectMediaHTML(project) {
  if (project.coverImage) {
    return `<img src="${project.coverImage}" alt="${project.title}" />`;
  }
  return "";
}

function goToProject(project) {
  const q = new URLSearchParams({ id: project.id });
  if (isPreviewMode()) q.set("preview", "1");
  location.href = "project.html?" + q.toString();
}

// 카테고리별로 단(섹션)을 나눠서 렌더링: 섹션 제목 + 그 카테고리의 카드 그리드
function renderSections() {
  const wrap = document.getElementById("workSections");
  wrap.innerHTML = "";

  let total = 0;
  (siteData.categories || []).forEach((cat) => {
    const projects = cat.projects || [];
    if (!projects.length) return;
    total += projects.length;

    const section = document.createElement("section");
    section.className = "work-section";
    section.id = `cat-${cat.id}`;
    section.dataset.catId = cat.id;

    const head = document.createElement("div");
    head.className = "work-section-head";
    const headInner = document.createElement("div");
    headInner.className = "container";
    const dot = document.createElement("span");
    dot.className = "ws-dot";
    if (cat.accent) dot.style.background = cat.accent;
    const h2 = document.createElement("h2");
    h2.textContent = cat.name || "";
    headInner.appendChild(dot);
    headInner.appendChild(h2);
    head.appendChild(headInner);
    section.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "work-grid";
    projects.forEach((project) => {
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
    section.appendChild(grid);

    wrap.appendChild(section);
  });

  if (total === 0) {
    wrap.innerHTML = `<div class="empty-state">No projects yet.</div>`;
  }
}

function init() {
  if (!siteData) {
    renderFallback();
    return;
  }
  renderHeader();
  renderTabs();
  renderSections();
  updateActiveTab();
}

loadSiteData().then((data) => {
  siteData = data;
  init();
});
