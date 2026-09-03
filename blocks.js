/* ==========================================================================
   Unlimit_Cho Portfolio — 공용 모듈 (index / project / admin 세 페이지가 공유)
   데이터 로딩 · 임베드 주소 정규화 · 블록 렌더링 · 카테고리 탭 내비게이션
   ========================================================================== */

/* 스크롤바를 평소엔 거의 안 보이게 뒀다가, 실제로 스크롤하는 동안만
   옅게 드러낸다(style.css의 html.is-scrolling 참고). 스크롤이 멎고
   나서도 잠깐 남아있다 사라지게, 마지막 스크롤 뒤 타이머로 지운다. */
let scrollBarHideTimer = null;
window.addEventListener("scroll", () => {
  document.documentElement.classList.add("is-scrolling");
  clearTimeout(scrollBarHideTimer);
  scrollBarHideTimer = setTimeout(() => {
    document.documentElement.classList.remove("is-scrolling");
  }, 700);
}, { passive: true });

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

// 마지막으로 적용된 --side/--wrap 값을 페이지(scope)별로 저장해둔다.
// 페이지가 열리자마자, 실제 데이터가 오기 전에 이 값부터 되살려 써서
// 로딩 스켈레톤이 처음부터 실제 콘텐츠와 같은 여백으로 그려지게 한다.
const LAYOUT_CACHE_KEY = "portfolioLayoutCache";

function cacheLayoutVars(scope, side, max) {
  try {
    const all = JSON.parse(localStorage.getItem(LAYOUT_CACHE_KEY) || "{}");
    all[scope] = { side, max };
    localStorage.setItem(LAYOUT_CACHE_KEY, JSON.stringify(all));
  } catch (e) {}
}

function restoreCachedLayoutVars(scope) {
  try {
    const all = JSON.parse(localStorage.getItem(LAYOUT_CACHE_KEY) || "{}");
    const cached = all[scope];
    if (!cached) return;
    const root = document.documentElement.style;
    if (cached.side != null) root.setProperty("--side", cached.side + "px");
    if (cached.max != null) root.setProperty("--wrap", `min(${cached.max}px, 100%)`);
  } catch (e) {}
}

// blocks.js는 body 맨 아래에서 동기적으로 실행되므로, 여기서 바로 되살리면
// 첫 페인트 전에 적용된다. 상세 페이지(#projectBlocks)와 목록 페이지는
// 서로 다른 scope 값을 쓴다.
restoreCachedLayoutVars(document.getElementById("projectBlocks") ? "content" : "home");

// 아코디언 카테고리 목록의 세부 간격. 지금 CSS에 실제로 적용돼 있는
// 값을 그대로 기본값으로 삼아서, 관리자에서 처음 열어도 화면이 안 바뀐다.
const LIST_TOP_GAP_DEFAULT = 82; // 목록 맨 위 여백
const HEAD_GAP_DEFAULT = 13; // 카테고리 이름 줄 위아래 여백
const PANEL_TOP_GAP_DEFAULT = 5; // 펼친 그리드 위쪽 여백
const PANEL_BOTTOM_GAP_DEFAULT = 24; // 펼친 그리드 아래쪽 여백
const CARD_RADIUS_DEFAULT = 0; // 카드 모서리 둥글기
// 모바일에서는 지금까지 좌우 여백을 18px로 고정해 뒀던 값을 그대로 기본값으로 쓴다
const SIDE_MARGIN_MOBILE_DEFAULT = 18;
const CONTENT_MARGIN_MOBILE_DEFAULT = 18;

/* 반응형 타이포그래피 스케일(Figma 참고). "본문 기본"만 실제 px 값이고,
   나머지 7단계는 본문 기본의 배율(rem 개념)로 정의한다 — 본문 기본만
   바꾸면 전부 비례해서 함께 바뀐다. 배율은 지금 CSS에 실제로 적용돼
   있는 px를 본문 기본으로 나눈 값이라, 관리자에서 처음 열어도 화면이
   안 바뀐다(예: 49 ÷ 16 = 3.063).
   데스크톱/모바일은 배율 자체가 다르다(모바일에서 라벨·캡션은 본문 기본과
   거의 같이 줄어 배율이 오히려 커진다) — 그래서 배율도 화면별로 따로 둔다. */
const TEXT_BODY_DEFAULT = 16;
const TEXT_BODY_MOBILE_DEFAULT = 12;
const TEXT_RATIO_DEFAULTS = {
  display: { desktop: 3.063, mobile: 3.000 },
  headline: { desktop: 2.438, mobile: 2.500 },
  h3: { desktop: 1.250, mobile: 1.250 },
  label: { desktop: 0.813, mobile: 1.000 },
  caption: { desktop: 0.750, mobile: 0.917 },
};

// 배율(소수) 값을 읽는다 — normalizeGap은 정수로 잘라버려서 배율엔 못 쓴다
function normalizeRatio(v) {
  if (v == null || v === "") return null;
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  return Math.max(0.1, n);
}

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

  // 데이터가 로딩되는 동안(스켈레톤이 떠 있는 짧은 순간) --side/--wrap이
  // 아직 이 값으로 안 바뀐 상태라, 스켈레톤이 기본값(28px/1350px) 기준으로
  // 그려져 실제 콘텐츠와 어긋나 보인다. 매번 적용된 값을 저장해뒀다가
  // restoreCachedLayoutVars()가 페이지가 열리자마자(첫 페인트 전) 되살린다.
  cacheLayoutVars(scope, side, max);

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

  // 아코디언 세부 여백 · 모서리 둥글기 · 모바일 여백. scope와 무관하게 항상
  // 같이 넣는다 (--side-menu 등 상단 메뉴 값과 같은 방식).
  const listTop = normalizeGap(p.listTopGap);
  const headGap = normalizeGap(p.headGap);
  const panelTop = normalizeGap(p.panelTopGap);
  const panelBottom = normalizeGap(p.panelBottomGap);
  const radius = normalizeGap(p.cardRadius);
  const sideMobile = normalizeGap(p.sideMarginMobile);
  const contentMobile = normalizeGap(p.contentMarginMobile);

  root.setProperty("--acc-list-top", (listTop != null ? listTop : LIST_TOP_GAP_DEFAULT) + "px");
  root.setProperty("--acc-head-gap", (headGap != null ? headGap : HEAD_GAP_DEFAULT) + "px");
  root.setProperty("--acc-panel-top", (panelTop != null ? panelTop : PANEL_TOP_GAP_DEFAULT) + "px");
  root.setProperty("--acc-panel-bottom", (panelBottom != null ? panelBottom : PANEL_BOTTOM_GAP_DEFAULT) + "px");
  root.setProperty("--card-radius", (radius != null ? radius : CARD_RADIUS_DEFAULT) + "px");
  root.setProperty("--side-mobile", (sideMobile != null ? sideMobile : SIDE_MARGIN_MOBILE_DEFAULT) + "px");
  root.setProperty("--side-menu-mobile", (contentMobile != null ? contentMobile : CONTENT_MARGIN_MOBILE_DEFAULT) + "px");

  // 타이포그래피 스케일: 본문 기본(px) 하나를 기준으로 나머지 7단계는
  // 그 배율로 계산한다. --text-body 를 바꾸면 전부 비례해서 따라온다.
  // (사용처는 style.css 모바일 분기에서 -mobile 버전을 따로 참조한다 —
  // applyLayoutVars가 인라인 스타일로 덮어써서 미디어쿼리만으로는
  // --text-body 자체를 되돌릴 수 없기 때문.)
  const bodyDesktop = normalizeGap(p.textBody);
  const bodyMobile = normalizeGap(p.textBodyMobile);
  const bd = bodyDesktop != null ? bodyDesktop : TEXT_BODY_DEFAULT;
  const bm = bodyMobile != null ? bodyMobile : TEXT_BODY_MOBILE_DEFAULT;
  root.setProperty("--text-body", bd + "px");
  root.setProperty("--text-body-mobile", bm + "px");

  Object.keys(TEXT_RATIO_DEFAULTS).forEach((tier) => {
    const def = TEXT_RATIO_DEFAULTS[tier];
    const key = "text" + tier[0].toUpperCase() + tier.slice(1);
    const ratioDesktop = normalizeRatio(p[key + "RatioDesktop"]);
    const ratioMobile = normalizeRatio(p[key + "RatioMobile"]);
    const rd = ratioDesktop != null ? ratioDesktop : def.desktop;
    const rm = ratioMobile != null ? ratioMobile : def.mobile;
    root.setProperty(`--text-${tier}`, +(rd * bd).toFixed(2) + "px");
    root.setProperty(`--text-${tier}-mobile`, +(rm * bm).toFixed(2) + "px");
  });
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
   .reveal 클래스가 붙은 요소는 화면에 들어오는 순간까지 스켈레톤으로 반짝이다가
   슬라이드 인 된다. 한 번 나타난 요소는 다시 관찰하지 않는다
   (재방문 시 매번 재생되지 않도록).

   같은 순간에 함께 화면에 들어온(=IntersectionObserver 콜백 한 번에 묶인)
   블록들은 위에서 아래 문서 순서대로 조금씩 지연을 줘 차례대로 등장하게 한다. */

let revealObserver = null;
const REVEAL_STAGGER_MS = 90;

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
        const arrived = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target)
          .sort((a, b) =>
            a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
          );
        arrived.forEach((el, i) => {
          el.style.setProperty("--reveal-delay", i * REVEAL_STAGGER_MS + "ms");
          el.classList.add("reveal-in");
          // 등장이 끝나면 지연값을 지워, 이후 다른 전환(색 변경 등)에 남지 않게 한다
          el.addEventListener(
            "transitionend",
            () => el.style.removeProperty("--reveal-delay"),
            { once: true }
          );
        });
        entries.forEach((entry) => {
          if (entry.isIntersecting) revealObserver.unobserve(entry.target);
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

/* ------------------------------- 방문자 카운팅 -------------------------------
   백엔드가 없는 사이트라, Google Apps Script를 웹앱으로 배포해 그 주소로
   조회 신호(GET)만 보낸다. 응답은 읽지 않는 순수 기록용이라 mode:'no-cors'로
   보낸다 — 크로스오리진 프리플라이트 없이 요청만 전달되고, 응답 내용은
   못 읽지만 애초에 필요 없다. ANALYTICS_URL을 비워두면(기본값) 아무 일도
   하지 않으므로, 로컬 테스트나 배포 전에는 안전하게 no-op이다.
   관리자가 미리보기(?preview=1)로 자기 사이트를 볼 때는 방문으로 치지 않는다. */
const ANALYTICS_URL = "https://script.google.com/macros/s/AKfycbxwmu1u29l-2mEpJ0mn-MQ2afZNITGQooPdihyPv4eUzym0EC4XvlODyN0wMJGoGczZ/exec";

function trackVisit(page, projectId, projectTitle) {
  if (!ANALYTICS_URL || isPreviewMode()) return;
  try {
    let vid = localStorage.getItem("portfolioVisitorId");
    if (!vid) {
      vid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("portfolioVisitorId", vid);
    }
    const params = new URLSearchParams({
      vid,
      page,
      pid: projectId || "",
      pt: projectTitle || "",
      ref: document.referrer || "",
      lang: navigator.language || "",
    });
    fetch(ANALYTICS_URL + "?" + params.toString(), { mode: "no-cors" });
  } catch (e) {}
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

/* ------------------------- 텍스트 블록의 글자 모델 (공용) -------------------------
   굵게가 섞인 글은 [{ t: "글자", b: true }] 조각 목록으로 담는다.
   HTML 문자열을 넣지 않고 글자 노드로만 그리므로, data.json에 어떤 값이
   들어와도 화면에서 코드로 실행되지 않는다. runs가 없으면 예전처럼
   content(민글자)를 그대로 쓴다. */

// source: { runs, content } 모양이면 무엇이든 받는다 (텍스트 블록 · 개요 설명)
function textRunsOf(source) {
  const runs = Array.isArray(source.runs)
    ? source.runs.filter((r) => r && typeof r.t === "string" && r.t !== "")
    : null;
  if (runs && runs.length) return runs;
  return [{ t: source.content || "", b: false }];
}

// 조각들을 글자 노드로 채운다 (굵은 조각만 <b>로 감싼다)
function fillTextRuns(el, source) {
  el.textContent = "";
  textRunsOf(source).forEach((r) => {
    const text = document.createTextNode(r.t);
    if (!r.b) { el.appendChild(text); return; }
    const b = document.createElement("b");
    b.appendChild(text);
    el.appendChild(b);
  });
}

// 색 · 정렬을 한 곳에서 입힌다 (공개 화면과 관리자 미리보기 공용).
// 크기·자간은 이제 텍스트 시스템(--text-body)을 그대로 따르므로 여기서 건드리지 않는다
function applyTextStyle(el, block) {
  el.style.color = block.color || "";
  el.style.textAlign = block.align && block.align !== "left" ? block.align : "";
}

/* ---------------------------------- 블록 렌더링 ---------------------------------- */

function renderBlock(block, defaultGap = null, firstEager = false) {
  if (block.type === "text") {
    if (!block.content) return null;
    const p = document.createElement("p");
    p.className = "blk-text reveal";
    fillTextRuns(p, block);
    applyTextStyle(p, block);
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
    div.className = "blk-embed reveal";
    const embedUrl = toEmbedUrl(src);
    if (!embedUrl && isVideoFile(src)) {
      const v = document.createElement("video");
      v.src = src;
      const autoplayOn = block.videoAutoplay !== false;
      v.controls = block.videoControls !== false;
      v.autoplay = autoplayOn;
      // 브라우저는 음소거 상태가 아니면 자동재생을 막으므로, 자동재생을
      // 켰다면 "음소거" 설정과 상관없이 소리는 끈 채로 재생한다
      v.muted = autoplayOn || block.videoMuted !== false;
      v.loop = block.videoLoop !== false;
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

/* ------------------------------ 사용 툴 (공용) ------------------------------
   프로젝트마다 쓴 툴을 골라두면 목록 카드에 마우스를 올렸을 때 태그로 뜬다.
   아이콘 판의 배경색과 그림 위치·크기는 디자인(Figma) 값을 28.125px 기준
   비율(%)로 환산한 것이라 어떤 크기로 그려도 모양이 그대로 유지된다.
   x/y가 "c"면 그 축은 가운데. crop은 그림을 판 안에서 잘라 쓰는 경우. */

const TOOLS = [
  { id: "photoshop",    label: "Photoshop",   bg: "#001e36", w: 91.17, h: 91.17, x: 4.46,  y: 4.47 },
  { id: "illustrator",  label: "Illustrator", bg: "#330000", w: 73.98, h: 66.73, x: "c",   y: "c",
    crop: { w: 121.64, h: 134.85, x: -10.82, y: -17.42 } },
  { id: "aftereffects", label: "After Effect", bg: "#00005b", w: 94.11, h: 91.75, x: 2.84, y: 4.18 },
  { id: "procreate",    label: "Procreate",   bg: "#242424", w: 71.96, h: 71.59, x: 13.91, y: 14.25,
    crop: { w: 116.43, h: 117.02, x: -8.21, y: -8.51 } },
  { id: "lottie",       label: "Lottie",      bg: "#00dfb4", w: 72.58, h: 81.24, x: "c",   y: 9.38,
    crop: { w: 976.3, h: 654.65, x: -145.87, y: -277.33 } },
  { id: "figma",        label: "Figma",       bg: "#2b2d34", w: 63.56, h: 80.46, x: 18.13, y: "c",
    crop: { w: 184.52, h: 145.78, x: -42.26, y: -20 } },
  { id: "c4d",          label: "C4D",         bg: "#2b2ba3", w: 100,   h: 112.05, x: "c",  y: "c" },
  { id: "kling",        label: "Kling AI",    bg: "#eef5f7", w: 72.07, h: 72.07, x: 14.04, y: 14.02 },
  { id: "redshift",     label: "Redshift",    bg: "#700428", w: 90.43, h: 102.27, x: "c",  y: "c" },
  { id: "gemini",       label: "Gemini",      bg: "#eef5f7", w: 74.43, h: 74.43, x: "c",   y: "c" },
  { id: "gpt",          label: "GPT",         bg: "#eef5f7", w: 100,   h: 100,   x: "c",   y: "c" },
  { id: "claude",       label: "Claude",      bg: "#da7656", w: 76.12, h: 75.76, x: "c",   y: "c",
    crop: { w: 131.37, h: 132, x: -15.68, y: -16 } },
];

const TOOL_BY_ID = TOOLS.reduce((m, t) => { m[t.id] = t; return m; }, {});

// 프로젝트에 저장된 id 목록을 디자인에 정의된 순서대로 정리한다
function toolsOf(project) {
  const picked = new Set(project.tools || []);
  return TOOLS.filter((t) => picked.has(t.id));
}

// 아이콘 한 개. 크기는 CSS가 정하고, 안쪽 그림은 비율로 자리를 잡는다.
function buildToolIcon(tool) {
  const icon = document.createElement("span");
  icon.className = "tool-icon";
  icon.style.background = tool.bg;

  const leaf = document.createElement("span");
  leaf.className = "tool-icon-leaf";
  leaf.style.width = tool.w + "%";
  leaf.style.height = tool.h + "%";
  leaf.style.left = (tool.x === "c" ? (100 - tool.w) / 2 : tool.x) + "%";
  leaf.style.top = (tool.y === "c" ? (100 - tool.h) / 2 : tool.y) + "%";

  const img = document.createElement("img");
  img.src = `assets/tools/${tool.id}.png`;
  img.alt = "";
  img.draggable = false;
  if (tool.crop) {
    // 판 안에서 잘라 쓰는 그림 — 잘린 위치까지 그대로 맞춘다
    img.style.width = tool.crop.w + "%";
    img.style.height = tool.crop.h + "%";
    img.style.left = tool.crop.x + "%";
    img.style.top = tool.crop.y + "%";
  }
  leaf.appendChild(img);
  icon.appendChild(leaf);
  return icon;
}

// 카드에 마우스를 올렸을 때 뜨는 툴 태그 줄
function buildToolTags(project) {
  const list = toolsOf(project);
  if (!list.length) return null;
  const row = document.createElement("div");
  row.className = "card-tags";
  list.forEach((t) => {
    const tag = document.createElement("span");
    tag.className = "card-tag";
    tag.textContent = t.label;
    row.appendChild(tag);
  });
  return row;
}

/* -------------------- 프로젝트 개요 (상세 페이지 최상단 · 공용) --------------------
   설명 아래에 작업년도 · 기여도 · 사용 툴을 한 줄로 늘어놓는다.
   사용 툴은 따로 적지 않는다 — 제목 옆 아이콘에서 켜둔 것이 그대로 따라온다.

   edit 를 넘기면(관리자) 빈 항목도 자리를 지키고 눌러서 바로 고칠 수 있게 만든다.
   공개 화면과 같은 마크업을 써야 미리보기가 실제와 어긋나지 않는다. */

// 관리자에서 그 자리에 바로 쓰는 한 줄/여러 줄 입력칸
function makeOverviewEditor(el, placeholder, multiline, onInput) {
  el.classList.add("blk-text-edit");
  el.contentEditable = "true";
  el.spellcheck = false;
  el.dataset.placeholder = placeholder;
  el.addEventListener("input", () => {
    const text = multiline ? el.innerText : el.innerText.replace(/\n/g, " ").trim();
    onInput(text);
  });
  // 한 줄짜리는 엔터로 줄을 늘리지 않는다
  if (!multiline) {
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
  }
  // 서식이 딸려 들어오지 않도록 붙여넣기는 글자만 받는다
  el.addEventListener("paste", (e) => {
    e.preventDefault();
    let text = (e.clipboardData || window.clipboardData).getData("text/plain");
    if (!multiline) text = text.replace(/\s+/g, " ");
    document.execCommand("insertText", false, text);
  });
}

// 개요 설명도 텍스트 블록과 같은 조각 모델을 쓴다 (키 이름만 다르다)
function overviewSource(project) {
  return { runs: project.overviewRuns, content: project.overview };
}

/* 아이콘 + 이름 한 짝. 공개 화면은 보여주기만 하고(span),
   관리자는 눌러서 켜고 끄므로 버튼으로 만든다. 마크업이 같아야
   관리자 미리보기가 실제 화면과 어긋나지 않는다. */
function buildToolNameItem(tool, asButton) {
  const item = document.createElement(asButton ? "button" : "span");
  item.className = "proj-meta-tool";
  if (asButton) {
    item.type = "button";
    item.title = tool.label;
  }
  const icon = document.createElement("span");
  icon.className = "proj-meta-tool-icon";
  icon.appendChild(buildToolIcon(tool));
  const name = document.createElement("span");
  name.textContent = tool.label;
  item.appendChild(icon);
  item.appendChild(name);
  return item;
}

function buildProjectOverview(project, edit) {
  const desc = (project.overview || "").trim();
  const year = (project.year || "").trim();
  const contribution = (project.contribution || "").trim();
  const tools = toolsOf(project);
  // 공개 화면에서는 채워진 게 하나도 없으면 영역 자체를 만들지 않는다
  if (!edit && !desc && !year && !contribution && !tools.length) return null;

  const sec = document.createElement("section");
  sec.className = "proj-overview";
  const inner = document.createElement("div");
  inner.className = "container";
  sec.appendChild(inner);

  if (edit || desc) {
    const p = document.createElement("p");
    p.className = "proj-overview-desc";
    fillTextRuns(p, overviewSource(project));
    // 지정 안 하면 배경 밝기에 따라 자동으로 대비를 맞춘 색(CSS 기본값)을 그대로 쓴다
    if (project.overviewColor) p.style.color = project.overviewColor;
    // 굵게 편집은 관리자에서 붙인다 (여기서는 자리만 내어준다)
    if (edit) edit.desc(p);
    inner.appendChild(p);
  }

  const meta = document.createElement("dl");
  meta.className = "proj-meta";

  // 라벨 + 값 한 칸
  const col = (label, build) => {
    const box = document.createElement("div");
    box.className = "proj-meta-col";
    const dt = document.createElement("dt");
    dt.className = "proj-meta-label";
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.className = "proj-meta-value";
    build(dd);
    box.appendChild(dt);
    box.appendChild(dd);
    meta.appendChild(box);
  };

  if (edit || year) {
    col("작업년도", (dd) => {
      dd.textContent = project.year || "";
      if (edit) makeOverviewEditor(dd, "2026.06", false, (v) => edit.set("year", v));
    });
  }
  if (edit || contribution) {
    col("기여도", (dd) => {
      dd.textContent = project.contribution || "";
      if (edit) makeOverviewEditor(dd, "100%", false, (v) => edit.set("contribution", v));
    });
  }
  // 관리자는 이 자리에서 툴을 직접 고른다. 공개 화면은 켜둔 것만 보여준다.
  if (edit) {
    col("사용 툴", (dd) => {
      dd.classList.add("proj-meta-tools");
      edit.tools(dd);
    });
  } else if (tools.length) {
    col("사용 툴", (dd) => {
      dd.classList.add("proj-meta-tools");
      // 아이콘과 이름은 한 덩어리라 줄이 바뀌어도 짝이 갈라지지 않는다
      tools.forEach((t) => dd.appendChild(buildToolNameItem(t, false)));
    });
  }

  if (meta.children.length) inner.appendChild(meta);
  return sec;
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
