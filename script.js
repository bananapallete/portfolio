/* ==========================================================================
   Unlimit_Cho Portfolio — Public site logic
   ========================================================================== */

const ALL_KEY = "__all__";
let currentFilter = ALL_KEY;
let siteData = null;

function toEmbedUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "");
      return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith("/embed/")) return url;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return `https://player.vimeo.com/video/${id}`;
    }
  } catch (e) {
    return null;
  }
  return null;
}

async function loadData() {
  const params = new URLSearchParams(location.search);
  if (params.get("preview") === "1") {
    const draft = localStorage.getItem("portfolioDraftData");
    if (draft) {
      try {
        return JSON.parse(draft);
      } catch (e) {}
    }
  }
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    if (!res.ok) throw new Error("fetch failed");
    return await res.json();
  } catch (e) {
    return null;
  }
}

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

function renderHeader() {
  const p = siteData.profile || {};
  document.getElementById("brandName").textContent = p.nickname || p.name || "Portfolio";
  document.getElementById("brandRole").textContent = p.role || "";
  document.getElementById("heroName").textContent = p.nickname || p.name || "";
  document.getElementById("heroTagline").textContent = p.tagline || "";
  document.getElementById("footerName").textContent = p.name || p.nickname || "";

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

function projectMediaHTML(project, accent) {
  if (project.coverImage) {
    return `<img src="${project.coverImage}" alt="${project.title}" />`;
  }
  return `<span>${project.title}</span>`;
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

  cards.forEach(({ project, cat }) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-media" style="background:${cat.accent}">
        ${projectMediaHTML(project, cat.accent)}
      </div>
      <div class="card-body">
        <span class="card-tag" style="background:${cat.accent}">${cat.name}</span>
        <div class="card-title">${project.title}</div>
      </div>
    `;
    card.addEventListener("click", () => openModal(project, cat));
    grid.appendChild(card);
  });
}

function openModal(project, cat) {
  document.getElementById("modalTag").textContent = cat.name;
  document.getElementById("modalTag").style.background = cat.accent;
  document.getElementById("modalTitle").textContent = project.title;
  document.getElementById("modalDescription").textContent =
    project.description || "아직 설명이 등록되지 않았어요.";

  const gallery = document.getElementById("modalGallery");
  gallery.innerHTML = "";
  (project.images || []).forEach((src) => {
    const img = document.createElement("img");
    img.src = src;
    gallery.appendChild(img);
  });

  const videosEl = document.getElementById("modalVideos");
  videosEl.innerHTML = "";
  (project.videos || []).forEach((video) => {
    if (video.type === "embed") {
      const embedUrl = toEmbedUrl(video.src) || video.src;
      const iframe = document.createElement("iframe");
      iframe.src = embedUrl;
      iframe.setAttribute("allowfullscreen", "true");
      iframe.setAttribute(
        "allow",
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      );
      videosEl.appendChild(iframe);
    } else {
      const v = document.createElement("video");
      v.src = video.src;
      v.controls = true;
      videosEl.appendChild(v);
    }
  });

  document.getElementById("modalOverlay").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modalOverlay").classList.add("hidden");
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

document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("modalOverlay").addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

loadData().then((data) => {
  siteData = data;
  init();
});
