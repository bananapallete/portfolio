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

/* 홈 배경색. 목록 영역만 칠하면 헤더·푸터만 기본색으로 남아 띠처럼 보이므로
   페이지 전체(body)에 깔고, 헤더·푸터는 --chrome 으로 같은 색을 따라가게 한다.
   밝은 색을 깔면 bg-takeover-light 가 글자·선을 어두운 쪽으로 뒤집어 대비를 지킨다.
   (상세 페이지의 프로젝트 배경색과 완전히 같은 방식) */
function applyWorkBg(p) {
  const body = document.body;
  const color = p.workBg;
  if (!color) {
    body.style.backgroundColor = "";
    body.style.removeProperty("--chrome");
    body.classList.remove("bg-takeover", "bg-takeover-light");
    return;
  }
  body.style.backgroundColor = color;
  body.style.setProperty("--chrome", color);
  body.classList.add("bg-takeover");
  body.classList.toggle("bg-takeover-light", !isDarkColor(color));
}

function renderHeader() {
  const p = siteData.profile || {};
  applyLayoutVars(p);
  document.getElementById("brandName").textContent = p.nickname || p.name || "Portfolio";
  document.getElementById("brandRole").textContent = p.role || "";
  document.getElementById("footerName").textContent = p.name || p.nickname || "";
  applyWorkBg(p);

  renderFooterContact(p);
}

function renderTabs() {
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";

  // 빈 카테고리는 섹션이 없으므로 탭도 생략
  const cats = (siteData.categories || []).filter((cat) => (cat.projects || []).length);

  // 카테고리가 하나뿐이면 "All"과 가리키는 곳이 같아 탭을 나눌 이유가 없다
  if (cats.length > 1) {
    tabs.appendChild(makeTab("All", activeCatId === null, () => scrollToCategory(null)));
  }

  cats.forEach((cat) => {
    const active = cats.length === 1 ? true : activeCatId === cat.id;
    tabs.appendChild(makeTab(cat.name, active, () => scrollToCategory(cat.id)));
  });
}

// 제목·설명에 <, & 같은 글자가 들어가도 깨지지 않도록 DOM으로 직접 만든다.
// eager: 첫 화면에 보이는 카드만 즉시 로드하고 나머지는 스크롤할 때 받아온다.
function buildCard(project, eager) {
  const card = document.createElement("div");
  card.className = "card reveal";

  const media = document.createElement("div");
  media.className = "card-media";
  if (project.coverImage) {
    media.appendChild(buildCoverMedia(project.coverImage, project.title, eager));
  }
  card.appendChild(media);

  // 마우스를 올리면 어두워지면서 제목과 설명이 함께 뜬다
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
  const tags = buildToolTags(project);
  if (tags) body.appendChild(tags);
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
  stopCoverVideos();

  const cats = (siteData.categories || []).filter((cat) => (cat.projects || []).length);

  // 지금까지 그린 카드 수 — 첫 두 장만 즉시 로드할지 판단하는 데 쓴다
  let total = 0;
  cats.forEach((cat) => {
    const projects = cat.projects || [];

    const section = document.createElement("section");
    section.className = "work-section";
    section.id = `cat-${cat.id}`;
    section.dataset.catId = cat.id;

    // 카테고리가 하나뿐이면 탭 이름과 똑같은 제목이라 섹션 머리는 생략한다
    if (cats.length === 1) {
      section.classList.add("work-section-bare"); // 머리가 빠진 만큼 위 여백을 대신 준다
    } else {
      const head = document.createElement("div");
      head.className = "work-section-head";
      const headInner = document.createElement("div");
      headInner.className = "container";
      const h2 = document.createElement("h2");
      h2.textContent = cat.name || "";
      headInner.appendChild(h2);
      head.appendChild(headInner);
      section.appendChild(head);
    }

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
  } else {
    initScrollReveal(wrap);
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
