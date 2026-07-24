/* ==========================================================================
   Unlimit_Cho Portfolio — 프로젝트 상세 페이지 (블록 렌더링은 blocks.js 공용)
   ========================================================================== */

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
  document.getElementById("projBrand").textContent = profile.nickname || profile.name || "Portfolio";
  document.getElementById("footerName").textContent = profile.name || profile.nickname || "";
  const contactEl = document.getElementById("footerContact");
  const contact = profile.contact || {};
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

  wrap.innerHTML = "";
  stopSliders();

  const blocks = blocksOf(project);
  let rendered = 0;
  blocks.forEach((block) => {
    const el = renderBlock(block);
    if (!el) return;
    rendered++;
    if (block.type === "text") {
      // 텍스트는 읽기 좋은 폭으로, 이미지·영상은 화면 가로 꽉 채움
      const narrow = document.createElement("div");
      narrow.className = "container-narrow";
      narrow.appendChild(el);
      wrap.appendChild(narrow);
    } else {
      wrap.appendChild(el);
    }
  });

  if (rendered === 0) {
    wrap.innerHTML = `<div class="empty-state">No content yet.</div>`;
  }
}

initProject();
