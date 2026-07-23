/* ==========================================================================
   Unlimit_Cho Portfolio — 공용 블록 렌더링 (index.html, project.html에서 사용)
   ========================================================================== */

let sliderTimers = [];

function stopSliders() {
  sliderTimers.forEach((t) => clearInterval(t));
  sliderTimers = [];
}

function isPreviewMode() {
  return new URLSearchParams(location.search).get("preview") === "1";
}

async function loadSiteData() {
  if (isPreviewMode()) {
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

// iframe 임베드 코드에서 src 추출, 프로토콜 없는 링크에 https:// 보완
function normalizeEmbedSrc(raw) {
  let v = (raw || "").trim();
  const m = /<iframe[^>]*\ssrc=["']([^"']+)["']/i.exec(v);
  if (m) v = m[1];
  v = v.replace(/&amp;/g, "&");
  if (!v) return "";
  if (v.startsWith("//")) return "https:" + v;
  if (v.startsWith("data:") || v.startsWith("assets/") || /^https?:\/\//i.test(v)) return v;
  if (/^[\w.-]+\.[a-z]{2,}([\/?#]|$)/i.test(v)) return "https://" + v;
  return v;
}

function toEmbedUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      const parts = u.pathname.split("/").filter(Boolean);
      if (["shorts", "live", "embed"].includes(parts[0]) && parts[1]) {
        return `https://www.youtube.com/embed/${parts[1]}`;
      }
    }
    if (u.hostname.includes("vimeo.com")) {
      if (u.hostname.includes("player.vimeo.com")) return url;
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
  } catch (e) {
    return null;
  }
  return null;
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

// 브라우저 자동재생 정책상 소리가 있으면 막히므로, 자동재생은 항상 음소거로 시작한다
// (유튜브/비메오 자체 컨트롤로 사용자가 언제든 음소거를 해제할 수 있다)
function withAutoplayParams(url) {
  try {
    const u = new URL(url);
    u.searchParams.set("autoplay", "1");
    if (u.hostname.includes("youtube.com")) {
      u.searchParams.set("mute", "1");
      u.searchParams.set("playsinline", "1");
    } else if (u.hostname.includes("vimeo.com")) {
      u.searchParams.set("muted", "1");
    } else {
      u.searchParams.set("mute", "1");
      u.searchParams.set("muted", "1");
    }
    return u.toString();
  } catch (e) {
    return url;
  }
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
    if (block.layout === "grid") {
      if (block.grid === "masonry") {
        div.className = "blk-images-masonry";
      } else {
        const cols = ["2", "3", "4"].includes(String(block.grid)) ? block.grid : "3";
        div.className = `blk-images-grid blk-grid-${cols}`;
      }
    } else {
      div.className = "blk-images-single";
    }
    images.forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      div.appendChild(img);
    });
    return div;
  }

  if (block.type === "embed") {
    const src = normalizeEmbedSrc(block.src);
    if (!src) return null;
    const div = document.createElement("div");
    div.className = "blk-embed";
    const embedUrl = toEmbedUrl(src);
    if (!embedUrl && isVideoFile(src)) {
      const v = document.createElement("video");
      v.src = src;
      v.controls = true;
      v.autoplay = true;
      v.muted = true;
      v.loop = true;
      v.setAttribute("playsinline", "");
      div.appendChild(v);
    } else {
      const iframe = document.createElement("iframe");
      iframe.src = withAutoplayParams(embedUrl || src);
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
