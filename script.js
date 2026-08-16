/* ==========================================================================
   Unlimit_Cho Portfolio — 목록 페이지 로직 (블록 렌더링은 blocks.js 공용)
   ========================================================================== */

// 탭 내비게이션(activeCatId · scrollToCategory · updateActiveTab · makeTab)은 blocks.js 공용
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

function renderTabs() {
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";

  tabs.appendChild(makeTab("All", activeCatId === null, () => scrollToCategory(null)));

  (siteData.categories || []).forEach((cat) => {
    if (!(cat.projects || []).length) return; // 빈 카테고리는 섹션이 없으므로 탭도 생략
    tabs.appendChild(makeTab(cat.name, activeCatId === cat.id, () => scrollToCategory(cat.id)));
  });
}

// 제목·설명에 <, & 같은 글자가 들어가도 깨지지 않도록 DOM으로 직접 만든다.
// eager: 첫 화면에 보이는 카드만 즉시 로드하고 나머지는 스크롤할 때 받아온다.
function buildCard(project, eager) {
  const card = document.createElement("div");
  card.className = "card";

  const media = document.createElement("div");
  media.className = "card-media";
  if (project.coverImage) {
    const img = document.createElement("img");
    img.src = project.coverImage;
    img.alt = project.title || "";
    setImgLoading(img, eager);
    media.appendChild(img);
  }
  card.appendChild(media);

  const body = document.createElement("div");
  body.className = "card-body";
  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = project.title || "";
  body.appendChild(title);
  if (project.summary) {
    const desc = document.createElement("div");
    desc.className = "card-desc";
    desc.textContent = project.summary;
    body.appendChild(desc);
  }
  card.appendChild(body);

  card.addEventListener("click", () => goToProject(project));
  return card;
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

  // 지금까지 그린 카드 수 — 첫 두 장만 즉시 로드할지 판단하는 데 쓴다
  let total = 0;
  (siteData.categories || []).forEach((cat) => {
    const projects = cat.projects || [];
    if (!projects.length) return;

    const section = document.createElement("section");
    section.className = "work-section";
    section.id = `cat-${cat.id}`;
    section.dataset.catId = cat.id;

    const head = document.createElement("div");
    head.className = "work-section-head";
    const headInner = document.createElement("div");
    headInner.className = "container";
    const h2 = document.createElement("h2");
    h2.textContent = cat.name || "";
    headInner.appendChild(h2);
    head.appendChild(headInner);
    section.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "work-grid";
    projects.forEach((project) => {
      // 2열 그리드라 처음 두 장만 첫 화면에 걸린다
      grid.appendChild(buildCard(project, total < 2));
      total++;
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
