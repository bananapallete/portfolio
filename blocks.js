/* ==========================================================================
   Unlimit_Cho Portfolio — 공용 모듈 (index / project / admin 세 페이지가 공유)
   데이터 로딩 · 임베드 주소 정규화 · 블록 렌더링 · 카테고리 탭 내비게이션
   ========================================================================== */

let sliderTimers = [];

function stopSliders() {
  sliderTimers.forEach((t) => clearInterval(t));
  sliderTimers = [];
}

/* -------------------------- 목록 카드의 커버 (이미지/영상) --------------------------
   커버로 영상 파일을 쓰면 소리 없이 반복 재생한다. 카드가 여러 장이라
   전부 동시에 돌면 무거우므로, 화면에 들어와 있는 것만 재생한다. */

let coverVideoWatcher = null;

function stopCoverVideos() {
  if (coverVideoWatcher) coverVideoWatcher.disconnect();
  coverVideoWatcher = null;
}

function playWhileVisible(video) {
  if (!("IntersectionObserver" in window)) {
    video.autoplay = true;
    return;
  }
  if (!coverVideoWatcher) {
    coverVideoWatcher = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.play().catch(() => {});
          else e.target.pause();
        });
      },
      { rootMargin: "120px" }
    );
  }
  coverVideoWatcher.observe(video);
}

/* 레이아웃 값(좌우 여백·카드 사이 간격)은 CSS 변수로 한 번에 적용한다.
   헤더·목록 그리드·상세 블록이 모두 이 변수를 보므로 값만 바꾸면 전부 따라온다. */
const SIDE_MARGIN_DEFAULT = 28;
const CARD_GAP_DEFAULT = 0;
// 가운데 정렬 최대 폭. 화면보다 크게 잡으면 자연스럽게 화면 폭까지만 쓴다
const MAX_WIDTH_DEFAULT = 1350;
const MAX_WIDTH_FULL = 2560;

// 예전 데이터의 "꽉 채우기" 스위치를 최대 폭 값으로 옮겨 읽는다
function readMaxWidth(value, legacyFull) {
  const v = normalizeGap(value);
  if (v != null) return v;
  return legacyFull ? MAX_WIDTH_FULL : MAX_WIDTH_DEFAULT;
}

/* scope: "home"(목록) | "content"(상세). 화면마다 다른 여백 값을 쓴다.
   상세 화면은 상단바·제목·블록·푸터가 모두 --side 하나를 보므로
   값 하나로 그 화면 전체가 함께 움직인다. */
function applyLayoutVars(profile, scope = "home") {
  const p = profile || {};
  const raw = normalizeGap(scope === "content" ? p.contentMargin : p.sideMargin);
  const side = raw != null ? raw : SIDE_MARGIN_DEFAULT;
  const gap = normalizeGap(p.cardGap);
  // "꽉 채우기"를 켠 화면만 가운데 정렬용 최대 폭을 푼다.
  // 여백 값과 분리해 둬야 0↔1 사이에서 폭이 계단처럼 튀지 않는다.
  const max = scope === "content"
    ? readMaxWidth(p.maxWidthContent, p.fullBleedContent)
    : readMaxWidth(p.maxWidthHome, p.fullBleedHome);

  // 상세 화면의 상단 메뉴(← Back to list)는 본문과 따로, 홈과 같은 값을 쓴다.
  // 어느 화면에서든 맨 위 줄의 기준선이 같아 보이도록 하기 위함이다.
  const menuRaw = normalizeGap(p.sideMargin);
  const menu = menuRaw != null ? menuRaw : SIDE_MARGIN_DEFAULT;
  const menuMax = readMaxWidth(p.maxWidthHome, p.fullBleedHome);

  const root = document.documentElement.style;
  root.setProperty("--side", side + "px");
  // min(…, 100%)이라 최대 폭을 화면보다 크게 잡으면 그대로 화면 끝까지 찬다.
  // 켜고 끄는 스위치가 아니라 이어지는 값이라 폭이 계단처럼 튀지 않는다.
  root.setProperty("--wrap", `min(${max}px, 100%)`);
  root.setProperty("--side-menu", menu + "px");
  root.setProperty("--wrap-menu", `min(${menuMax}px, 100%)`);
  root.setProperty("--card-gap", (gap != null ? gap : CARD_GAP_DEFAULT) + "px");
}

// eager: 첫 화면에 걸리는 카드만 미리 받아 둔다
function buildCoverMedia(src, alt, eager) {
  if (!isVideoFile(src)) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt || "";
    setImgLoading(img, eager);
    return img;
  }
  const video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.controls = false;
  video.preload = eager ? "auto" : "metadata";
  video.setAttribute("aria-label", alt || "");
  playWhileVisible(video);
  return video;
}

// #RGB / #RRGGBB 색이 어두운지 판별 (밝기 < 0.55면 어두움 → 흰 글자 사용)
function isDarkColor(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return false;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum < 0.55;
}

function isPreviewMode() {
  return new URLSearchParams(location.search).get("preview") === "1";
}

/* ------------------- 스크롤 리빌 애니메이션 (공개 사이트 공용) -------------------
   .reveal 클래스가 붙은 요소는 화면에 들어오는 순간 슬라이드 인 된다.
   한 번 나타난 요소는 다시 관찰하지 않는다 (재방문 시 매번 재생되지 않도록). */

let revealObserver = null;

function initScrollReveal(root) {
  const els = (root || document).querySelectorAll(".reveal:not(.reveal-in)");
  if (!els.length) return;
  // 동작 최소화를 원하는 사용자에게는 애니메이션 없이 바로 보여준다
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    els.forEach((el) => el.classList.add("reveal-in"));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("reveal-in");
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.01, rootMargin: "0px 0px -10% 0px" }
    );
  }
  els.forEach((el) => revealObserver.observe(el));
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

// 임베드 영상의 비율을 iframe에 적용한다.
// CSS 기본값은 16:9인데, 그보다 넓거나 좁은 영상은 플레이어가 위아래(또는 좌우)에
// 검은 여백을 만든다. 보통은 관리자에서 저장해둔 비율을 그대로 쓰고(요청 0건),
// 저장된 값이 없을 때만 원본에서 알아내 보정한다.
function applyEmbedRatio(iframe, block) {
  const w = parseFloat(block.ratioW);
  const h = parseFloat(block.ratioH);
  if (w > 0 && h > 0) {
    iframe.style.aspectRatio = `${w} / ${h}`;
    return;
  }
  // 비율이 저장되기 전에 올라간 영상도 스스로 맞도록 마지막 보정
  const m = /vimeo\.com\/(?:video\/)?(\d+)/.exec(block.src || "");
  if (!m) return;
  fetch(`https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F${m[1]}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((d) => {
      if (d && d.width && d.height) iframe.style.aspectRatio = `${d.width} / ${d.height}`;
    })
    .catch(() => {});
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

function renderSlider(images, firstEager = false) {
  const wrap = document.createElement("div");
  wrap.className = "blk-slider reveal";
  const track = document.createElement("div");
  track.className = "blk-slider-track";
  images.forEach((src, i) => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    // 첫 장만 즉시, 나머지는 넘어가기 전에 받아온다 (3.5초 간격이라 충분)
    setImgLoading(img, firstEager && i === 0);
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

// 간격 값(px)을 0 이상 정수로 정규화. 미설정이면 null (CSS 기본값 사용)
function normalizeGap(v) {
  if (v == null || v === "") return null;
  const n = parseInt(v, 10);
  if (isNaN(n)) return null;
  return Math.max(0, n);
}

// 이미지 블록의 그리드 레이아웃 클래스명
function gridClassName(block) {
  if (block.grid === "masonry") return "blk-images-masonry";
  const cols = ["2", "3", "4"].includes(String(block.grid)) ? block.grid : "3";
  return `blk-images-grid blk-grid-${cols}`;
}

// 화면 밖 이미지는 스크롤해서 다가갈 때 받아온다.
// eager=true인 첫 이미지만 즉시 로드해 첫 화면이 늦지 않게 한다.
function setImgLoading(img, eager) {
  img.decoding = "async";
  img.loading = eager ? "eager" : "lazy";
  if (eager) img.fetchPriority = "high";
}

// defaultGap: 블록에 자체 간격(block.gap)이 없을 때 쓸 기본 간격
//   (프로젝트의 "콘텐츠 간격" 설정 — 블록 사이와 이미지 사이가 같이 조절된다)
// firstEager: 첫 화면에 보이는 블록이면 true — 그 블록의 첫 이미지만 즉시 로드한다
/* ------------------- 카테고리 탭 내비게이션 (공개 사이트 · 관리자 공용) -------------------
   탭은 필터가 아니라 해당 카테고리 섹션으로 스크롤하는 앵커다.
   각 페이지는 renderTabs()를 자기 방식대로 정의하고, 아래 함수들을 공유한다. */

// 현재 화면에 보이는 섹션의 카테고리 id (null = 최상단 / All)
let activeCatId = null;

// 고정 헤더 아래 여백을 고려한 스크롤 오프셋
function headerOffset() {
  const h = document.querySelector(".site-header");
  return h ? h.getBoundingClientRect().bottom + 6 : 90;
}

function scrollToCategory(catId) {
  if (!catId) {
    if (window.lenis) window.lenis.scrollTo(0);
    else window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const el = document.getElementById(`cat-${catId}`);
  if (!el) return;
  // 엘리먼트 대신 숫자 좌표를 넘겨야 고정 헤더 오프셋이 정확히 적용된다
  const y = Math.max(0, el.getBoundingClientRect().top + window.scrollY - headerOffset());
  if (window.lenis) window.lenis.scrollTo(y);
  else window.scrollTo({ top: y, behavior: "smooth" });
}

// 스크롤 위치에 맞춰 활성 탭을 갱신 (스크롤 스파이)
function updateActiveTab() {
  const threshold = headerOffset() + 30;
  let current = null;
  // 최상단 근처에서는 All 활성 (첫 섹션이 헤더 바로 아래에서 시작하므로)
  if (window.scrollY > 40) {
    const secs = document.querySelectorAll(".work-section");
    secs.forEach((sec) => {
      if (sec.getBoundingClientRect().top <= threshold) current = sec.dataset.catId;
    });
    // 페이지 끝에 도달하면 마지막 섹션 활성
    // (마지막 섹션은 스크롤이 끝까지 가도 헤더에 못 닿을 수 있음)
    if (secs.length && window.innerHeight + window.scrollY >= document.body.scrollHeight - 40) {
      current = secs[secs.length - 1].dataset.catId;
    }
  }
  if (current !== activeCatId) {
    activeCatId = current;
    renderTabs();
  }
}

// 볼드 글자가 폭을 정하고(레이아웃 안 흔들림) 레귤러 글자가 그 위에 겹쳐 크로스페이드
function makeTab(text, isActive, onClick) {
  const btn = document.createElement("button");
  btn.className = "tab" + (isActive ? " active" : "");
  const label = document.createElement("span");
  label.className = "tab-label";
  const bold = document.createElement("span");
  bold.className = "tl-bold";
  bold.textContent = text;
  const reg = document.createElement("span");
  reg.className = "tl-reg";
  reg.textContent = text;
  label.appendChild(bold);
  label.appendChild(reg);
  btn.appendChild(label);
  btn.addEventListener("click", onClick);
  return btn;
}

// 스크롤 스파이는 프레임당 한 번만 계산한다
let scrollTick = false;
window.addEventListener("scroll", () => {
  if (scrollTick) return;
  scrollTick = true;
  requestAnimationFrame(() => {
    scrollTick = false;
    if (document.querySelector(".work-section")) updateActiveTab();
  });
}, { passive: true });

/* ---------------------------------- 블록 렌더링 ---------------------------------- */

function renderBlock(block, defaultGap = null, firstEager = false) {
  if (block.type === "text") {
    if (!block.content) return null;
    const p = document.createElement("p");
    p.className = "blk-text";
    p.textContent = block.content;
    if (block.size) p.style.fontSize = block.size + "px";
    if (block.color) p.style.color = block.color;
    if (block.align && block.align !== "left") p.style.textAlign = block.align;
    return p;
  }

  if (block.type === "images") {
    const images = block.images || [];
    if (!images.length) return null;
    if (block.layout === "slider" && images.length > 1) return renderSlider(images, firstEager);
    const div = document.createElement("div");
    div.classList.add("reveal");
    // 블록별 "이미지 간격"이 우선, 없으면 프로젝트의 "콘텐츠 간격"을 따른다 (최소 0px)
    const ownGap = normalizeGap(block.gap);
    const gap = ownGap != null ? ownGap : normalizeGap(defaultGap);
    const isMasonry = block.layout === "grid" && block.grid === "masonry";
    if (block.layout === "grid") {
      div.classList.add(...gridClassName(block).split(" "));
      if (gap != null) div.style[isMasonry ? "columnGap" : "gap"] = gap + "px";
    } else {
      div.classList.add("blk-images-single");
      if (gap != null) div.style.gap = gap + "px";
    }
    images.forEach((src, i) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      setImgLoading(img, firstEager && i === 0);
      // 모자이크(컬럼) 레이아웃은 세로 간격이 margin-bottom으로 정해진다
      if (isMasonry && gap != null) img.style.marginBottom = gap + "px";
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
      // 16:9가 아닌 영상이 위아래 여백 없이 딱 맞게 들어가도록 실제 비율을 적용
      applyEmbedRatio(iframe, block);
      div.appendChild(iframe);
    }
    return div;
  }

  return null;
}

/* ---------------------------- 푸터 연락처 (공용) ----------------------------
   목록 화면과 상세 화면이 같은 마크업을 쓰므로 한 곳에서 만든다. */

function renderFooterContact(profile) {
  const el = document.getElementById("footerContact");
  if (!el) return;
  el.innerHTML = "";
  const contact = (profile || {}).contact || {};
  const link = (href, text) => {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    el.appendChild(a);
  };
  if (contact.phone) link(`tel:${contact.phone.replace(/\s+/g, "")}`, contact.phone);
  (contact.emails || []).forEach((email) => link(`mailto:${email}`, email));
}
