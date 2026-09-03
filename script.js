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

/* -------------------------------- 경력(이력서) 레이아웃 --------------------------------
   프로젝트 그리드 대신 About·Skills·Experience·Education 네 줄로 이루어진
   이력서 형태를 쓴다. cat.career 가 있는 카테고리에서만 쓰인다(buildGrid 참고). */

// 줄 왼쪽의 영문 라벨(About 등) + 오른쪽 내용을 한 행으로 묶는다
function buildCareerRow(labelText, contentEl) {
  const row = document.createElement("div");
  row.className = "career-row";
  const label = document.createElement("div");
  label.className = "career-row-label";
  label.textContent = labelText;
  row.appendChild(label);
  row.appendChild(contentEl);
  return row;
}

function buildCareerAbout(about) {
  const wrap = document.createElement("div");
  wrap.className = "career-about";

  const avatar = document.createElement("div");
  avatar.className = "career-avatar";
  wrap.appendChild(avatar);

  const info = document.createElement("div");
  info.className = "career-about-info";

  const nameLine = document.createElement("div");
  nameLine.className = "career-about-line";
  const nameEl = document.createElement("span");
  nameEl.className = "career-about-name";
  nameEl.textContent = about.name || "";
  nameLine.appendChild(nameEl);
  if (about.birthday) {
    const bday = document.createElement("span");
    bday.className = "career-about-sub";
    bday.textContent = about.birthday;
    nameLine.appendChild(bday);
  }
  info.appendChild(nameLine);

  if (about.phone || about.email) {
    const contactLine = document.createElement("div");
    contactLine.className = "career-about-line";
    if (about.phone) {
      const phone = document.createElement("span");
      phone.className = "career-about-sub";
      phone.textContent = about.phone;
      contactLine.appendChild(phone);
    }
    if (about.email) {
      const email = document.createElement("span");
      email.className = "career-about-sub";
      email.textContent = about.email;
      contactLine.appendChild(email);
    }
    info.appendChild(contactLine);
  }

  wrap.appendChild(info);
  return wrap;
}

function buildCareerSkills(skillGroups) {
  const wrap = document.createElement("div");
  wrap.className = "career-skills";
  skillGroups.forEach((group) => {
    // 라벨 + 그 그룹의 아이콘들을 한 덩어리로 묶어야, 좁은 화면에서 줄바꿈이
    // 일어나도 라벨과 아이콘이 떨어지지 않고 그룹째로 다음 줄로 넘어간다
    const groupEl = document.createElement("span");
    groupEl.className = "career-skill-group";

    const label = document.createElement("span");
    label.className = "career-skill-group-label";
    label.textContent = group.label || "";
    groupEl.appendChild(label);

    (group.tools || []).forEach((toolId) => {
      const tool = TOOL_BY_ID[toolId];
      if (!tool) return;
      const badge = document.createElement("span");
      badge.className = "career-skill-icon";
      badge.title = tool.label;
      badge.appendChild(buildToolIcon(tool));
      groupEl.appendChild(badge);
    });

    wrap.appendChild(groupEl);
  });
  return wrap;
}

// 첫 항목(최종 경력/학력)만 라벨이 붙은 상세 카드로, 나머지는 이전 이력으로
// 옅게 이어 붙인다. fields: [[데이터 키, 라벨], ...] 순서대로 한 줄씩 채운다.
// 데스크톱은 한 줄로 늘어놓고, 모바일은 2열 그리드로 접어 전부 한눈에 보인다.
function buildCareerTimeline(items, fields) {
  const wrap = document.createElement("div");
  wrap.className = "career-timeline-wrap";

  const list = document.createElement("div");
  list.className = "career-timeline";

  items.forEach((item, i) => {
    const card = document.createElement("div");
    card.className = "career-card" + (i === 0 ? " career-card-main" : " career-card-more");

    if (i === 0) {
      fields.forEach(([key, label]) => {
        if (!item[key]) return;
        const line = document.createElement("div");
        line.className = "career-card-line";
        const l = document.createElement("span");
        l.className = "career-card-label";
        l.textContent = label;
        const v = document.createElement("span");
        v.className = "career-card-value";
        v.textContent = item[key];
        line.appendChild(l);
        line.appendChild(v);
        card.appendChild(line);
      });
    } else {
      fields.forEach(([key], fi) => {
        if (!item[key]) return;
        const v = document.createElement("div");
        v.className = "career-card-value" + (fi === 0 ? " career-card-value-strong" : "");
        v.textContent = item[key];
        card.appendChild(v);
      });
    }

    list.appendChild(card);
  });

  wrap.appendChild(list);
  return wrap;
}

function buildCareerSection(career) {
  const wrap = document.createElement("div");
  wrap.className = "career";

  if (career.about) wrap.appendChild(buildCareerRow("About", buildCareerAbout(career.about)));
  if (career.skillGroups && career.skillGroups.length) {
    wrap.appendChild(buildCareerRow("Skills", buildCareerSkills(career.skillGroups)));
  }
  if (career.experience && career.experience.length) {
    wrap.appendChild(buildCareerRow("Experience", buildCareerTimeline(
      career.experience,
      [["company", "직장명"], ["period", "기간"], ["role", "업무"]]
    )));
  }
  if (career.education && career.education.length) {
    wrap.appendChild(buildCareerRow("Education", buildCareerTimeline(
      career.education,
      [["school", "학교"], ["major", "전공"], ["years", "년도"]]
    )));
  }

  return wrap;
}

/* 패널을 열고 닫는 트랜지션 시간을 고정값으로 두면, 카드가 많아 패널이
   긴 카테고리일수록 같은 시간 동안 훨씬 더 먼 거리(높이)를 움직여야 해서
   "더 빨리 스르륵 열리는" 것처럼 보인다. 실제 펼쳐질 높이에 비례해 시간을
   늘려, 카테고리마다 체감 속도(px/ms)가 비슷하게 느껴지도록 맞춘다. */
const ACC_PANEL_DURATION_MIN = 250;
const ACC_PANEL_DURATION_MAX = 650;
const ACC_PANEL_DURATION_BASE = 200;
const ACC_PANEL_DURATION_RATE = 0.35;

function accPanelDuration(height) {
  const ms = ACC_PANEL_DURATION_BASE + height * ACC_PANEL_DURATION_RATE;
  return Math.min(ACC_PANEL_DURATION_MAX, Math.max(ACC_PANEL_DURATION_MIN, ms));
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
      // "경력" 같은 카테고리는 프로젝트 그리드 대신 이력서 형태의 전용 레이아웃을 쓴다
      if (cat.career) {
        panelInner.appendChild(buildCareerSection(cat.career));
        return;
      }
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
        const prevPanel = openItem.querySelector(".acc-panel");
        prevPanel.style.transitionDuration = accPanelDuration(prevPanel.scrollHeight) + "ms";
        openItem.classList.remove("open");
        openItem.querySelector(".acc-head").setAttribute("aria-expanded", "false");
        prevPanel.style.maxHeight = "";
      }
      if (isOpen) {
        panel.style.transitionDuration = accPanelDuration(panel.scrollHeight) + "ms";
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
        const targetHeight = panel.scrollHeight;
        panel.style.transitionDuration = accPanelDuration(targetHeight) + "ms";
        panel.style.maxHeight = targetHeight + "px";
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
  // 실제 콘텐츠가 준비됐으니, 그 위에 덮여 있던 로딩 스켈레톤을 걷어낸다
  // (데이터를 못 받아와도 스켈레톤이 영원히 반짝이면 안 되므로 여기서 함께 정리한다)
  document.getElementById("workSkeleton")?.classList.add("is-hidden");
  document.getElementById("brandSkeleton")?.classList.add("is-hidden");
  document.getElementById("bioSkeleton")?.classList.add("is-hidden");
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
