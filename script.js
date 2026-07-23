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

/* ------------------------------ 콘텐츠 블록 렌더링 ------------------------------ */

let sliderTimers = [];

function stopSliders() {
  sliderTimers.forEach((t) => clearInterval(t));
  sliderTimers = [];
}

// blocks가 없는 구버전 데이터는 즉석에서 블록 형태로 변환
function blocksOf(project) {
  if (project.blocks && project.blocks.length) return project.blocks;
  const blocks = [];
  if (project.description) {
    blocks.push({ type: "text", content: project.description, size: 15, color: "" });
  }
  if (project.images && project.images.length) {
    blocks.push({ type: "images", layout: "grid", images: project.images });
  }
  (project.videos || []).forEach((v) => {
    if (v && v.src) blocks.push({ type: "embed", src: v.src });
  });
  return blocks;
}

function isVideoFile(src) {
  return /^data:video\//.test(src) || /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(src);
}

function renderSlider(images) {
  const wrap = document.createElement("div");
  wrap.className = "blk-slider";
  const track = document.createElement("div");
  track.className = "blk-slider-track";
  images.forEach((src) => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    track.appendChild(img);
  });
  wrap.appendChild(track);

  const dots = document.createElement("div");
  dots.className = "blk-slider-dots";
  let idx = 0;
  let timer = null;

  const go = (i) => {
    idx = (i + images.length) % images.length;
    track.style.transform = `translateX(-${idx * 100}%)`;
    Array.from(dots.children).forEach((d, j) => d.classList.toggle("active", j === idx));
  };
  const start = () => {
    timer = setInterval(() => go(idx + 1), 3500);
    sliderTimers.push(timer);
  };

  images.forEach((_, i) => {
    const d = document.createElement("button");
    d.addEventListener("click", () => {
      clearInterval(timer);
      go(i);
      start();
    });
    dots.appendChild(d);
  });
  wrap.appendChild(dots);

  go(0);
  start();
  return wrap;
}

function renderBlock(block) {
  if (block.type === "text") {
    if (!block.content) return null;
    const p = document.createElement("p");
    p.className = "blk-text";
    p.textContent = block.content;
    if (block.size) p.style.fontSize = block.size + "px";
    if (block.color) p.style.color = block.color;
    return p;
  }

  if (block.type === "images") {
    const images = block.images || [];
    if (!images.length) return null;
    if (block.layout === "slider" && images.length > 1) return renderSlider(images);
    const div = document.createElement("div");
    div.className = block.layout === "grid" ? "blk-images-grid" : "blk-images-single";
    images.forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      div.appendChild(img);
    });
    return div;
  }

  if (block.type === "embed") {
    if (!block.src) return null;
    const div = document.createElement("div");
    div.className = "blk-embed";
    const embedUrl = toEmbedUrl(block.src);
    if (!embedUrl && isVideoFile(block.src)) {
      const v = document.createElement("video");
      v.src = block.src;
      v.controls = true;
      div.appendChild(v);
    } else {
      const iframe = document.createElement("iframe");
      iframe.src = embedUrl || block.src;
      iframe.setAttribute("allowfullscreen", "true");
      iframe.setAttribute(
        "allow",
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      );
      div.appendChild(iframe);
    }
    return div;
  }

  return null;
}

function openModal(project, cat) {
  document.getElementById("modalTag").textContent = cat.name;
  document.getElementById("modalTag").style.background = cat.accent;
  document.getElementById("modalTitle").textContent = project.title;

  stopSliders();
  const container = document.getElementById("modalBlocks");
  container.innerHTML = "";

  const blocks = blocksOf(project);
  let rendered = 0;
  blocks.forEach((block) => {
    const el = renderBlock(block);
    if (el) {
      container.appendChild(el);
      rendered++;
    }
  });
  if (rendered === 0) {
    const empty = document.createElement("p");
    empty.className = "blk-text";
    empty.style.color = "rgba(20,18,26,0.5)";
    empty.textContent = "아직 등록된 콘텐츠가 없어요.";
    container.appendChild(empty);
  }

  document.getElementById("modalOverlay").classList.remove("hidden");
}

function closeModal() {
  stopSliders();
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
