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

  const bio = document.getElementById("siteBio");
  if (p.bio && p.bio.trim()) {
    bio.textContent = p.bio;
    bio.hidden = false;
  } else {
    bio.hidden = true;
  }

  renderFooterContact(p);
}

// 언어 전환. 콘텐츠 자체를 두 언어로 따로 관리하진 않지만(관리자에 그런
// 입력칸은 없다), 카테고리 이름 줄만은 국문/영문 중 어느 쪽을 더 크게 보여줄지
// 실제로 바꾼다 — renderAccordion()이 채워두는 langEntries를 그때그때 다시 칠한다.
let langEntries = [];

function applyLangToEntries(lang) {
  const isEn = lang === "en";
  langEntries.forEach(({ koEl, enEl }) => {
    koEl.className = isEn ? "acc-sub" : "acc-name";
    enEl.className = isEn ? "acc-name" : "acc-sub";
    koEl.style.order = isEn ? "2" : "1";
    enEl.style.order = isEn ? "1" : "2";
  });
}

function initLangSwitch() {
  const wrap = document.getElementById("langSwitch");
  if (!wrap) return;
  wrap.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      wrap.querySelectorAll(".lang-btn").forEach((b) => b.classList.toggle("active", b === btn));
      applyLangToEntries(btn.dataset.lang);
    });
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

/* 카테고리를 아코디언으로 렌더링: 이름 줄을 누르면 바로 아래로 그 카테고리의
   프로젝트 그리드가 펼쳐진다. 한 번에 하나만 열리도록 다른 항목은 함께 접는다.
   그리드는 처음 열 때 한 번만 만들고(이미지 낭비 없이), 이후로는 열고 닫기만 한다. */
function renderAccordion() {
  const wrap = document.getElementById("workSections");
  wrap.innerHTML = "";
  stopCoverVideos();

  const cats = siteData.categories || [];

  if (!cats.length) {
    wrap.innerHTML = `<div class="empty-state">No projects yet.</div>`;
    return;
  }

  let openItem = null;
  langEntries = [];

  // 창 크기가 바뀌면(카드 폭이 바뀌어 이미지 높이도 바뀌므로) 열려 있는
  // 패널의 max-height를 다시 재준다. 리스너는 아코디언당 하나만 붙인다.
  window.addEventListener("resize", () => {
    if (!openItem) return;
    const panel = openItem.querySelector(".acc-panel");
    panel.style.maxHeight = panel.scrollHeight + "px";
  });

  cats.forEach((cat) => {
    const item = document.createElement("div");
    item.className = "acc-item";
    item.dataset.catId = cat.id;

    // acc-head 바로 위에 숨어있는 1px짜리 기준점. 이게 뷰포트 위로 넘어가는
    // 순간이 곧 이름 줄이 최상단에 붙어 GNB 자리를 대신하기 시작하는 순간이다.
    const sentinel = document.createElement("div");
    sentinel.className = "acc-sentinel";
    item.appendChild(sentinel);

    const head = document.createElement("button");
    head.type = "button";
    head.className = "acc-head";
    head.setAttribute("aria-expanded", "false");

    const text = document.createElement("span");
    text.className = "acc-head-text";
    const name = document.createElement("span");
    name.className = "acc-name";
    name.textContent = cat.name || "";
    text.appendChild(name);
    if (cat.nameSub && cat.nameSub.trim()) {
      const sub = document.createElement("span");
      sub.className = "acc-sub";
      sub.textContent = cat.nameSub;
      text.appendChild(sub);
      // 영문 버전에서는 이 둘의 크기·순서를 맞바꾼다 (initLangSwitch 참고)
      langEntries.push({ koEl: name, enEl: sub });
    }
    head.appendChild(text);

    const chevron = document.createElement("img");
    chevron.className = "acc-chevron";
    chevron.src = "assets/icons/chevron-down.svg";
    chevron.alt = "";
    head.appendChild(chevron);

    const panel = document.createElement("div");
    panel.className = "acc-panel";
    const panelInner = document.createElement("div");
    panelInner.className = "acc-panel-inner";
    panel.appendChild(panelInner);

    let built = false;
    const buildGrid = () => {
      if (built) return;
      built = true;
      const grid = document.createElement("div");
      grid.className = "work-grid";
      (cat.projects || []).forEach((project, i) => {
        const card = buildCard(project, i < 2);
        // 스크롤로 발견하는 카드가 아니라 눌러서 여는 카드라, 관찰 없이 바로 보여준다
        card.classList.add("reveal-in");
        grid.appendChild(card);
      });
      panelInner.appendChild(grid);
    };

    // 이름 줄이 최상단에 닿았는지를 스크롤마다 계산하지 않고, 기준점이
    // 뷰포트 경계를 넘는 순간에만 반응한다(열려 있을 때만 CSS로 보이므로
    // 닫혀 있는 항목에서 계속 관찰해도 화면엔 아무 영향이 없다).
    const stickyObserver = new IntersectionObserver(
      ([entry]) => head.classList.toggle("is-stuck", !entry.isIntersecting),
      { threshold: 0 }
    );
    stickyObserver.observe(sentinel);

    head.addEventListener("click", () => {
      const isOpen = item.classList.contains("open");
      if (openItem && openItem !== item) {
        openItem.classList.remove("open");
        openItem.querySelector(".acc-head").setAttribute("aria-expanded", "false");
        openItem.querySelector(".acc-panel").style.maxHeight = "";
      }
      if (isOpen) {
        item.classList.remove("open");
        head.setAttribute("aria-expanded", "false");
        panel.style.maxHeight = "";
        openItem = null;
        document.body.classList.remove("has-open-category");
      } else {
        buildGrid();
        item.classList.add("open");
        head.setAttribute("aria-expanded", "true");
        // 실제 콘텐츠 높이를 재서 넣어야 max-height 트랜지션이 부드럽게 펼쳐진다
        panel.style.maxHeight = panel.scrollHeight + "px";
        openItem = item;
        // 카테고리가 열려 있는 동안엔 GNB가 스크롤을 따라오지 않고 흘러 지나가서,
        // 이 이름 줄이 최상단에 닿았을 때 그 자리를 대신할 수 있게 한다
        document.body.classList.add("has-open-category");
      }
    });

    item.appendChild(head);
    item.appendChild(panel);
    wrap.appendChild(item);
  });
}

function init() {
  if (!siteData) {
    renderFallback();
    return;
  }
  renderHeader();
  renderAccordion();
  initLangSwitch();
}

loadSiteData().then((data) => {
  siteData = data;
  init();
});
