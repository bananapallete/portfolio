/* ==========================================================================
   Unlimit_Cho Portfolio — 프로젝트 상세 페이지 (블록 렌더링은 blocks.js 공용)
   ========================================================================== */

/* ------------------- 프로젝트 배경색 (카드 하나마다 지정) -------------------
   목록에서 카드를 눌러 이 프로젝트를 여는 동안에만 페이지 전체 배경이
   그 프로젝트의 색으로 서서히 바뀐다. 목록으로 돌아가면 원래대로 돌아온다. */

function setPageBg(color) {
  const body = document.body;
  if (!color) {
    body.style.backgroundColor = "";
    body.style.removeProperty("--chrome");
    body.classList.remove("bg-takeover", "bg-takeover-light");
    return;
  }
  // 기본 배경에서 지정한 색으로 서서히 넘어가도록 다음 프레임에 적용한다
  requestAnimationFrame(() => {
    body.style.backgroundColor = color;
    // 상단바·맨 위로 버튼도 같은 색을 쓰도록 알려준다
    body.style.setProperty("--chrome", color);
    body.classList.add("bg-takeover");
    // 밝은 배경으로 덮으면 글자·선 색을 어두운 쪽으로 뒤집어 대비를 유지한다
    body.classList.toggle("bg-takeover-light", !isDarkColor(color));
  });
}

/* ------------- 상단바 자동 숨김 + 맨 위로 버튼 (상세 페이지 전용) -------------
   내려갈 때는 상단바를 감춰 콘텐츠에 집중하게 하고, 올릴 때 다시 꺼낸다. */

function initScrollChrome() {
  const bar = document.querySelector(".proj-topbar");
  const toTop = document.getElementById("toTopBtn");
  if (!bar || !toTop) return;

  let lastY = window.scrollY;
  let ticking = false;

  const update = () => {
    const y = Math.max(0, window.scrollY);
    const delta = y - lastY;
    // 미세한 흔들림으로 상단바가 깜빡이지 않도록 일정 이상 움직였을 때만 반응
    if (Math.abs(delta) > 4) {
      // 맨 위 근처에서는 항상 보이게 둔다
      bar.classList.toggle("proj-topbar-hidden", delta > 0 && y > 120);
      lastY = y;
    }
    toTop.classList.toggle("to-top-show", y > 400);
  };

  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  }, { passive: true });

  toTop.addEventListener("click", () => {
    if (window.lenis) window.lenis.scrollTo(0);
    else window.scrollTo({ top: 0, behavior: "smooth" });
  });

  update();
}

async function initProject() {
  const wrap = document.getElementById("projectBlocks");
  const siteData = await loadSiteData();

  if (!siteData) {
    wrap.innerHTML = `<div class="empty-state">Couldn't load the data. <a href="index.html" style="text-decoration:underline;">← Back to list</a></div>`;
    return;
  }

  const id = new URLSearchParams(location.search).get("id");
  let project = null;
  let category = null;
  (siteData.categories || []).forEach((cat) => {
    (cat.projects || []).forEach((p) => {
      if (p.id === id) {
        project = p;
        category = cat;
      }
    });
  });

  // 프로필/푸터
  const profile = siteData.profile || {};
  applyLayoutVars(profile, "content");
  document.getElementById("projBrand").textContent = profile.nickname || profile.name || "Portfolio";
  document.getElementById("footerName").textContent = profile.name || profile.nickname || "";
  renderFooterContact(profile);

  // 미리보기 모드면 돌아갈 때도 미리보기 유지
  if (isPreviewMode()) {
    document.getElementById("backLink").href = "index.html?preview=1";
  }

  if (!project) {
    document.getElementById("projTitle").textContent = "Project not found";
    wrap.innerHTML = `<div class="empty-state">This link is invalid or the project has been removed. <a href="index.html" style="text-decoration:underline;">← Back to list</a></div>`;
    return;
  }

  document.title = `${project.title} — ${profile.nickname || profile.name || "Portfolio"}`;
  const tag = document.getElementById("projTag");
  tag.textContent = category.name;
  const titleEl = document.getElementById("projTitle");
  titleEl.textContent = project.title;
  // 폰트 두께는 프로필의 전역 설정을 모든 프로젝트에 일괄 적용
  const gw = profile.projectTitleWeight || (project.titleWeight /* 구버전 호환 */);
  if (gw) titleEl.style.fontWeight = gw;

  // 상세 페이지 상단(태그+제목) 배경색 지정
  if (project.heroBg) {
    const heroWrap = document.getElementById("projHeroWrap");
    heroWrap.style.background = project.heroBg;
    if (isDarkColor(project.heroBg)) heroWrap.classList.add("proj-hero-dark");
  }

  // 이 프로젝트를 여는 동안 페이지 전체 배경색 적용
  setPageBg(project.bgColor);

  wrap.innerHTML = "";
  stopSliders();

  // 콘텐츠 블록 사이 간격 (프로젝트별 설정, 최소 0px — 미설정이면 CSS 기본 28px)
  const blockGap = normalizeGap(project.blockGap);
  if (blockGap != null) wrap.style.gap = blockGap + "px";

  const blocks = blocksOf(project);
  let rendered = 0;
  blocks.forEach((block) => {
    // 콘텐츠 간격 설정이 있으면 그리드/이미지 사이 간격에도 함께 적용.
    // 첫 블록만 즉시 로드하고 나머지 이미지는 스크롤할 때 받아온다.
    const el = renderBlock(block, blockGap, rendered === 0);
    if (!el) return;
    rendered++;
    // 텍스트도 이미지·영상과 같은 폭을 쓴다 (좌/우 정렬 기준선이 서로 맞도록)
    wrap.appendChild(el);
  });

  initScrollReveal(wrap);

  if (rendered === 0) {
    wrap.innerHTML = `<div class="empty-state">No content yet.</div>`;
  }
}

// 데이터 로딩과 무관하게 동작해야 하므로 따로 초기화한다
initScrollChrome();
initProject();
