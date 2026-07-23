/* ==========================================================================
   Unlimit_Cho Portfolio — 프로젝트 상세 페이지 (블록 렌더링은 blocks.js 공용)
   ========================================================================== */

async function initProject() {
  const wrap = document.getElementById("projectBlocks");
  const siteData = await loadSiteData();

  if (!siteData) {
    wrap.innerHTML = `<div class="empty-state">데이터를 불러오지 못했어요. <a href="index.html" style="text-decoration:underline;">← 목록으로</a></div>`;
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
    document.getElementById("projTitle").textContent = "프로젝트를 찾을 수 없어요";
    wrap.innerHTML = `<div class="empty-state">주소가 잘못되었거나 삭제된 프로젝트예요. <a href="index.html" style="text-decoration:underline;">← 목록으로</a></div>`;
    return;
  }

  document.title = `${project.title} — ${profile.nickname || profile.name || "Portfolio"}`;
  const tag = document.getElementById("projTag");
  tag.textContent = category.name;
  document.getElementById("projTitle").textContent = project.title;

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
    wrap.innerHTML = `<div class="empty-state">아직 등록된 콘텐츠가 없어요.</div>`;
  }
}

initProject();
