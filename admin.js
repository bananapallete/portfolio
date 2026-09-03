/* ==========================================================================
   Unlimit_Cho Portfolio — Admin editor logic
   ========================================================================== */

const DRAFT_KEY = "portfolioDraftData";
const RECENT_COLORS_KEY = "portfolioRecentColors";
const DEFAULT_COLORS = ["#f5f4f0", "#ff4d6d", "#6c5ce7", "#00c2a8", "#ffc93c", "#14121a"];
let data = null;

/* 블록 목록의 접힘 상태. 블록 객체 자체를 열쇠로 삼아 순서를 바꿔도 따라간다.
   (편집 팝업은 프로젝트 복사본을 한 번만 만들므로 다시 그려도 객체가 유지된다) */
/* 블록별 접힘 여부. 값이 없으면 기본값(임베드만 접힘)을 따른다. */
const blockFolds = new WeakMap();
const isBlockFolded = (block) =>
  blockFolds.has(block) ? blockFolds.get(block) : block.type === "embed";

const openSettings = new WeakSet(); // 조절값 줄은 기본으로 접고, 연 것만 기억한다

/* 카테고리 접힘 상태. 공개 사이트와 달리 한 번에 하나만 열리는 게 아니라
   (드래그로 카테고리 사이에 프로젝트를 옮기려면 양쪽 다 열려 있어야 한다),
   각자 따로 접고 편다. 기본은 전부 펼침 — 여기 들어있는 id만 접힌 상태다. */
const closedCategoryIds = new Set();

/* 마우스를 누르고 있는 동안인지. 누르는 도중에 화면이 길어지면 버튼이 밀려
   손을 떼는 지점이 빗나가 클릭이 씹힌다. 그래서 화면을 늘리는 일은
   손을 뗄 때까지 미룬다. */
let pointerHeld = false;
document.addEventListener("pointerdown", () => { pointerHeld = true; }, true);
document.addEventListener("pointerup", () => { pointerHeld = false; }, true);

// 지금 누르는 중이면 손을 뗀 뒤에, 아니면 바로 실행한다
function afterClick(fn) {
  if (!pointerHeld) { fn(); return; }
  document.addEventListener("pointerup", () => requestAnimationFrame(fn), { once: true, capture: true });
}

// 방금 추가해서 아직 아무것도 안 들어간 블록 — 그려진 뒤 입력칸에 커서를 둔다
let focusNewBlock = null;

/* 아직 내용이 없어서, 넣을 방법이 조절값 줄에만 있는 블록.
   이런 블록은 줄을 접지 않고 업로드 버튼·링크 입력칸을 바로 보여준다.
   텍스트는 미리보기 자체가 입력칸이므로 여기 해당하지 않는다. */
function needsSetup(block) {
  if (block.type === "images") return !(block.images || []).length;
  if (block.type === "embed") return !block.src;
  return false;
}

// 텍스트 블록의 미리보기 요소. 크기·색상을 다시 그리지 않고 바로 반영하는 데 쓴다.
const textPreviewNodes = new WeakMap();
// 현재 드래그 중인 항목 정보 { group, list, from }
let dragCtx = null;

// 프로젝트 카드는 카테고리와 무관하게 한 그룹으로 묶어 서로 오갈 수 있게 한다
const PROJECT_DRAG_GROUP = "projects";
// 편집 팝업이 열려 있는 대상. type: "project" | "profile" | "category"
// 편집은 복사본에서 이루어지고 "저장 · 사이트에 반영"을 눌러야 실제 데이터에 반영된다
let editingContext = null;
// 탭 내비게이션(activeCatId · scrollToCategory · updateActiveTab · makeTab)은 blocks.js 공용

// "간격 ___ px [기본값]" 형태의 조절 필드. 빈 값이면 기본값(CSS 지정) 사용.
// getVal/setVal로 데이터에 읽고 쓰고, onApply(gap|null)로 즉시 반영한다.
/* [값, 표시글] 목록으로 만드는 분절 버튼 줄. 네 군데에서 같은 코드를 쓰고 있었다. */
function buildSeg(options, current, onPick) {
  const seg = document.createElement("div");
  seg.className = "layout-seg";
  options.forEach(([value, text]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (String(current) === value) b.classList.add("active");
    b.addEventListener("click", () => {
      onPick(value);
      saveDraft();
      renderEditModalBody();
    });
    seg.appendChild(b);
  });
  return seg;
}

/* 끌면서 값이 바로 반영되는 슬라이더. 숫자칸으로도 넣을 수 있다.
   끄는 동안 화면을 다시 그리면 손잡이를 놓치므로 onApply로만 반영한다. */
function buildSliderField(labelText, getVal, setVal, { min = 0, max = 120, def = 0, step = 1, unit = "px" } = {}, onApply) {
  const row = document.createElement("div");
  row.className = "slider-field";

  const label = document.createElement("span");
  label.className = "control-label";
  label.textContent = labelText;

  const range = document.createElement("input");
  range.type = "range";
  range.min = min;
  range.max = max;
  range.step = step;

  const num = document.createElement("input");
  num.type = "number";
  num.min = min;
  num.max = max;
  num.step = step;
  num.className = "size-input";

  const px = document.createElement("span");
  px.className = "control-label";
  px.textContent = unit;

  // 자간처럼 음수·소수를 쓰는 값도 있어 0 이상 정수로 자르지 않는다
  const raw = getVal();
  const cur = raw == null || raw === "" || !Number.isFinite(parseFloat(raw)) ? null : parseFloat(raw);
  const start = cur == null ? def : cur;
  range.value = start;
  num.value = start;

  /* 지나온 구간을 강조색으로 칠해 손잡이가 어디쯤인지 눈으로 알 수 있게 한다.
     막대 자체에 그리는 배경이라 브라우저마다 다른 트랙 가상요소를 손대지 않아도 된다.
     자간처럼 최솟값이 음수인 값도 있어 (값-최소)/(최대-최소)로 비율을 낸다. */
  const paint = () => {
    const v = parseFloat(range.value);
    const pct = max === min ? 0 : ((v - min) / (max - min)) * 100;
    range.style.setProperty("--fill", Math.min(100, Math.max(0, pct)) + "%");
  };
  paint();

  const apply = (v, from) => {
    const g = Math.min(max, Math.max(min, v));
    if (from !== "range") range.value = g;
    if (from !== "num") num.value = g;
    paint();
    setVal(g);
    saveDraft();
    if (onApply) onApply(g);
  };
  range.addEventListener("input", () => apply(parseFloat(range.value), "range"));
  num.addEventListener("input", () => {
    const v = parseFloat(num.value);
    if (!Number.isNaN(v)) apply(v, "num");
  });

  const clearBtn = document.createElement("button");
  clearBtn.className = "btn btn-outline btn-xs";
  clearBtn.textContent = "기본값";
  clearBtn.addEventListener("click", () => {
    range.value = def;
    num.value = def;
    paint();
    setVal(null);
    saveDraft();
    if (onApply) onApply(null);
  });

  row.appendChild(label);
  row.appendChild(range);
  row.appendChild(num);
  row.appendChild(px);
  row.appendChild(clearBtn);
  return row;
}

function buildGapField(labelText, getVal, setVal, placeholder, onApply) {
  const row = document.createElement("div");
  row.className = "gap-field";

  const label = document.createElement("span");
  label.className = "control-label";
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "number";
  input.min = 0;
  input.max = 300;
  input.className = "size-input";
  input.placeholder = placeholder;
  const cur = normalizeGap(getVal());
  input.value = cur == null ? "" : cur;
  input.addEventListener("input", () => {
    const g = normalizeGap(input.value);
    setVal(g);
    saveDraft();
    if (onApply) onApply(g);
  });

  const px = document.createElement("span");
  px.className = "control-label";
  px.textContent = "px";

  const clearBtn = document.createElement("button");
  clearBtn.className = "btn btn-outline btn-xs";
  clearBtn.textContent = "기본값";
  clearBtn.addEventListener("click", () => {
    input.value = "";
    setVal(null);
    saveDraft();
    if (onApply) onApply(null);
  });

  row.appendChild(label);
  row.appendChild(input);
  row.appendChild(px);
  row.appendChild(clearBtn);
  return row;
}

function slugify(text, fallback) {
  const base = (text || fallback || "item")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base || "item"}-${Date.now().toString(36)}`;
}

function saveDraft() {
  // 편집 팝업이 열려 있는 동안의 saveDraft 호출은 전부 팝업 안에서의 수정이므로
  // "저장되지 않은 변경사항" 상태로 표시한다 (복사본 수정이라 draft에는 아직 안 들어감)
  if (editingContext) {
    editingContext.dirty = true;
    updateModalSaveState();
  }
  const status = document.getElementById("autosaveStatus");
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    status.textContent = `임시 저장됨 (브라우저에만) · ${hh}:${mm}`;
  } catch (e) {
    // 대용량 이미지/영상 때문에 localStorage 용량(약 5MB)을 넘긴 경우
    status.textContent =
      "임시 저장 실패(브라우저 용량 초과) — \"사이트에 반영\"을 누르면 파일이 업로드되며 용량이 줄어들어요.";
  }
}

async function fetchServerData() {
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    if (!res.ok) throw new Error("fetch failed");
    return await res.json();
  } catch (e) {
    return null;
  }
}

// 브라우저에 남은 임시저장(초안)과 실제 사이트의 data.json을 함께 읽는다.
// 초안을 그대로 쓰되, 사이트 쪽이 그 사이 바뀌었으면 알려주기 위해 서버 내용도 넘긴다.
async function loadInitial() {
  const raw = localStorage.getItem(DRAFT_KEY);
  let draft = null;
  if (raw) {
    try { draft = JSON.parse(raw); } catch (e) {}
  }

  const server = await fetchServerData();
  if (draft) return { data: draft, source: "draft", server };
  if (server) return { data: server, source: "fetch", server };
  return { data: null, source: "none", server: null };
}

/* 오래된 초안으로 사이트를 덮어쓰는 사고를 막는 경고 배너.
   예전에 열어둔 탭의 초안이 남아 있으면 그걸로 발행할 때 최신 내용이 통째로
   날아가므로, 서버 내용과 다르면 반영 전에 어느 쪽을 쓸지 먼저 고르게 한다. */
// 배너가 가리키는 사이트 쪽 내용. "사이트에 올라간 내용 불러오기"가 이 값을 쓴다.
let staleServer = null;
// 견줄 때 쓴 정리된 형태. "계속 편집"을 고른 내용과 같은지지 판단하는 기준이다.
let staleServerJson = null;
// "임시저장 내용으로 계속 편집"을 고른 시점의 사이트 내용.
//  그 뒤로 사이트가 또 바뀌지 않았다면 같은 경고를 다시 띄우지 않는다.
let staleDismissed = null;

/* 버튼은 한 번만 걸어둔다. 확인할 때마다 새로 걸면 이벤트가 쌓인다. */
function bindStaleBanner() {
  const banner = document.getElementById("staleBanner");
  if (!banner) return;

  document.getElementById("staleUseServer").addEventListener("click", () => {
    if (!staleServer) return;
    localStorage.removeItem(DRAFT_KEY);
    data = staleServer;
    staleDismissed = null;
    renderAll();
    banner.hidden = true;
    document.getElementById("autosaveStatus").textContent = "사이트에 올라간 내용을 불러왔어요.";
  });
  document.getElementById("staleKeepDraft").addEventListener("click", () => {
    staleDismissed = staleServerJson;
    banner.hidden = true;
  });
}

bindStaleBanner();

function checkStaleDraft(server) {
  const banner = document.getElementById("staleBanner");
  if (!banner || !server || !data) return;

  // 사이트 내용도 같은 정리를 거친 뒤에 견준다. 화면의 data는 이미 거쳤으므로
  //  그러지 않으면 빠진 값이 채워진 것만으로 다르다고 판정된다.
  const serverJson = JSON.stringify(ensureShape(structuredClone(server)));
  if (JSON.stringify(data) === serverJson) {
    banner.hidden = true;
    return;
  }
  // 이미 "계속 편집"으로 넘긴 그 내용이면 다시 묻지 않는다
  if (serverJson === staleDismissed) return;

  staleServer = server;
  staleServerJson = serverJson;
  const count = (d) => (d.categories || []).reduce((n, c) => n + (c.projects || []).length, 0);
  document.getElementById("staleMsg").innerHTML =
    `⚠️ 지금 화면은 브라우저에 남아 있던 <strong>임시저장 내용</strong>이고, ` +
    `사이트에 올라간 내용과 달라요. ` +
    `(임시저장 프로젝트 ${count(data)}개 / 사이트 ${count(server)}개)<br/>` +
    `이대로 "사이트에 반영"을 누르면 사이트 쪽 내용이 임시저장 내용으로 덮어써집니다.`;
  banner.hidden = false;
}

/* 다른 기기에서 발행한 내용을 이 탭이 모른 채 덮어쓰지 않도록,
   탭을 다시 볼 때 사이트 쪽 내용을 다시 확인한다.

   회사와 집을 오가며 탭을 켜둔 채로 쓰면, 열 때 한 번만 확인해서는
   어제 열어둔 탭이 그 사이의 발행을 알지 못한다. */
async function recheckStaleDraft() {
  // 임시저장이 없으면 덮어쓸 위험도 없다
  if (!localStorage.getItem(DRAFT_KEY)) return;
  const server = await fetchServerData();
  if (server) checkStaleDraft(server);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") recheckStaleDraft();
});

function showLoadFailure() {
  const msg = `
    <div class="empty-state">
      ⚠️ data.json을 자동으로 불러오지 못했어요.<br/><br/>
      파일을 더블클릭해서 열었다면(file://) 브라우저 보안 정책 때문에 자동 로딩이 막혀 있을 수 있어요.<br/>
      위쪽 <strong>"불러오기(json)"</strong> 버튼으로 data.json 파일을 직접 선택하거나,
      README 안내대로 로컬 서버(<code>python -m http.server</code>)로 열어주세요.<br/><br/>
      <strong>주의:</strong> 이 상태에서 그냥 편집을 시작하면 기존 데이터가 사라진 채로 저장/내보내기 될 수 있어요.
      먼저 데이터를 꼭 불러온 뒤에 편집해주세요.
    </div>
  `;
  document.getElementById("workSections").innerHTML = msg;
  document.getElementById("tabs").innerHTML = "";
  document.getElementById("autosaveStatus").textContent =
    "data.json 로딩 실패 — 편집 전에 파일을 먼저 불러와주세요.";
}

/* 빠진 값을 채우고 구버전 데이터를 지금 구조로 옮�다.

   넘겨받은 것만 손대고 그대로 돌려준다. 사이트 내용과 임시저장을 견줄 때도
   쓰이는데, 한쪽만 이 정리를 거치면 실제로는 같은 내용인데도
   다르다고 판정돼 헛된 경고가 뜨기 때문이다. */
function ensureShape(d) {
  if (!d) d = { profile: {}, categories: [] };
  d.profile = d.profile || {};
  d.profile.contact = d.profile.contact || {};
  d.profile.contact.emails = d.profile.contact.emails || [];
  d.categories = d.categories || [];
  // 구버전: 프로젝트별 titleWeight가 있으면 전역 설정으로 승격 후 제거
  if (!d.profile.projectTitleWeight) {
    for (const c of d.categories) {
      const found = (c.projects || []).find((p) => p.titleWeight);
      if (found) { d.profile.projectTitleWeight = found.titleWeight; break; }
    }
  }
  d.categories.forEach((c) => (c.projects || []).forEach((p) => { delete p.titleWeight; }));
  d.categories.forEach((cat) => {
    cat.projects = cat.projects || [];
    cat.projects.forEach((p) => {
      p.summary = p.summary || "";
      // 구버전(description/images/videos) 데이터를 블록 구조로 변환
      if (!p.blocks) {
        p.blocks = [];
        if (p.description) {
          p.blocks.push({ type: "text", content: p.description, size: 15, color: "#14121a" });
        }
        if (p.images && p.images.length) {
          p.blocks.push({ type: "images", layout: "grid", images: p.images.slice() });
        }
        (p.videos || []).forEach((v) => {
          if (v && v.src) p.blocks.push({ type: "embed", src: v.src });
        });
      }
      delete p.description;
      delete p.images;
      delete p.videos;
      // 잘못 저장된 임베드(iframe 코드, https 누락)를 정리
      p.blocks.forEach((b) => {
        if (b.type === "embed" && b.src) b.src = normalizeEmbedSrc(b.src);
      });
    });
  });
  return d;
}

/* ------------------------------ 드래그 정렬 공통 ------------------------------ */

const DROP_CLASSES = ["drop-before", "drop-after", "drop-x", "drop-y"];

// 화면에 떠 있는 삽입 위치 표시를 모두 지운다
function clearDropMarkers() {
  document.querySelectorAll(".drop-before, .drop-after").forEach((el) => {
    el.classList.remove(...DROP_CLASSES);
  });
}

// 이웃한 형제와의 위치 관계로 배치 방향을 판단한다.
// 같은 줄에 나란히 있으면 가로("x"), 아니면 세로("y").
function dragAxis(itemEl) {
  const r = itemEl.getBoundingClientRect();
  for (const sib of [itemEl.previousElementSibling, itemEl.nextElementSibling]) {
    if (!sib) continue;
    const s = sib.getBoundingClientRect();
    if (!s.width && !s.height) continue;
    if (Math.abs(s.top - r.top) < Math.max(8, r.height / 2)) return "x";
  }
  return "y";
}

// 포인터가 항목의 앞쪽 절반에 있으면 그 앞에, 뒤쪽 절반이면 그 뒤에 끼워 넣는다.
// to는 "빼내기 전" 기준의 삽입 위치.
function dropTargetAt(itemEl, index, e) {
  const axis = dragAxis(itemEl);
  const r = itemEl.getBoundingClientRect();
  const before = axis === "x"
    ? e.clientX < r.left + r.width / 2
    : e.clientY < r.top + r.height / 2;
  return { axis, before, to: before ? index : index + 1 };
}

// handle을 잡고 끌면 itemEl을 같은 group/list 안에서 순서를 바꿀 수 있다.
// 끄는 동안 실제로 끼워질 자리(항목과 항목 사이)를 색 막대로 표시한다.
// onChange: 순서가 바뀐 뒤 다시 그릴 함수 (기본값은 편집 팝업 새로고침)
function attachDrag(itemEl, handleEl, group, list, index, onChange = renderEditModalBody) {
  handleEl.addEventListener("mousedown", () => { itemEl.draggable = true; });
  itemEl.addEventListener("dragstart", (e) => {
    e.stopPropagation();
    dragCtx = { group, list, from: index };
    itemEl.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", ""); } catch (err) {}
  });
  itemEl.addEventListener("dragend", () => {
    itemEl.draggable = false;
    itemEl.classList.remove("dragging");
    clearDropMarkers();
    dragCtx = null;
  });
  itemEl.addEventListener("dragover", (e) => {
    if (!dragCtx || dragCtx.group !== group) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const { axis, before, to } = dropTargetAt(itemEl, index, e);
    clearDropMarkers();
    // 같은 목록 안에서, 놓아도 순서가 그대로인 자리(집어 든 카드의 양옆)에는 표시하지 않는다
    if (dragCtx.list === list && (to === dragCtx.from || to === dragCtx.from + 1)) return;
    itemEl.classList.add(axis === "x" ? "drop-x" : "drop-y", before ? "drop-before" : "drop-after");
  });
  itemEl.addEventListener("dragleave", (e) => {
    // 같은 항목 안의 자식 요소끼리 오갈 때는 표시를 유지한다
    if (e.relatedTarget && itemEl.contains(e.relatedTarget)) return;
    itemEl.classList.remove(...DROP_CLASSES);
  });
  itemEl.addEventListener("drop", (e) => {
    if (!dragCtx || dragCtx.group !== group) return;
    e.preventDefault();
    e.stopPropagation();
    const srcList = dragCtx.list;
    const from = dragCtx.from;
    const { to } = dropTargetAt(itemEl, index, e);
    dragCtx = null;
    clearDropMarkers();
    // 같은 목록 안에서 옮길 때만, 원래 자리를 빼내며 뒤쪽 인덱스가 하나씩 당겨진다
    const sameList = srcList === list;
    const target = sameList && to > from ? to - 1 : to;
    if (sameList && target === from) return;
    const [moved] = srcList.splice(from, 1);
    list.splice(target, 0, moved);
    saveDraft();
    onChange();
  });
}

/* ------------------------------ 자주 쓰는 색상 ------------------------------ */

function getRecentColors() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_COLORS_KEY));
    if (Array.isArray(saved) && saved.length) return saved.slice(0, 6);
  } catch (e) {}
  return DEFAULT_COLORS.slice();
}

function pushRecentColor(color) {
  const list = getRecentColors().filter((c) => c.toLowerCase() !== color.toLowerCase());
  list.unshift(color);
  localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(list.slice(0, 6)));
}

// #RGB / #RRGGBB → #rrggbb (color input이 6자리만 받으므로 정규화)
function toHex6(v) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((v || "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return "#" + h.toLowerCase();
}

// 컬러피커 + 헥스코드 입력 + (옵션)최근 색상 스와치를 묶은 색상 조절 필드.
// onChange(value): 색이 바뀔 때마다 호출. options.swatches: 최근색 표시,
// options.rerender: 스와치 클릭 후 다시 그릴 함수(선택 상태 갱신용).
function buildColorField(initial, onChange, options = {}) {
  const field = document.createElement("div");
  field.className = "color-control";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "color-input";
  colorInput.value = toHex6(initial) || "#000000";

  const hexInput = document.createElement("input");
  hexInput.type = "text";
  hexInput.className = "hex-input";
  hexInput.value = initial || "";
  hexInput.placeholder = "#000000";
  hexInput.spellcheck = false;
  hexInput.maxLength = 7;

  colorInput.addEventListener("input", () => {
    hexInput.value = colorInput.value;
    onChange(colorInput.value);
  });

  hexInput.addEventListener("input", () => {
    let v = hexInput.value.trim();
    if (v && !v.startsWith("#")) v = "#" + v;
    const hx = toHex6(v);
    if (hx) colorInput.value = hx;
    onChange(v);
  });

  field.appendChild(colorInput);
  field.appendChild(hexInput);

  if (options.swatches) {
    const sw = document.createElement("div");
    sw.className = "color-swatches";
    getRecentColors().forEach((c) => {
      const s = document.createElement("button");
      s.type = "button";
      s.className = "swatch";
      s.style.background = c;
      s.title = c;
      s.addEventListener("click", () => {
        colorInput.value = toHex6(c) || "#000000";
        hexInput.value = c;
        onChange(c);
        pushRecentColor(c);
        if (options.rerender) options.rerender();
      });
      sw.appendChild(s);
    });
    field.appendChild(sw);
  }

  return { field, colorInput, hexInput };
}

/* ---------------------------------- Profile ---------------------------------- */

// 프로필 편집 필드들을 wrap 안에 그린다. profile은 편집용 복사본.
function renderProfileFields(wrap, profile) {
  profile.contact = profile.contact || {};

  // 판이 열려 있는 동안 아래 화면이 바로 따라오도록 (저장 전 미리보기)
  const live = () => { saveDraft(); renderSiteHeader(profile); };

  renderLayoutFields(wrap, profile);

  // 이름·닉네임·역할·소개문·연락처를 "프로필" 한 구획으로 묶는다
  const profileFold = buildFoldSection("프로필");
  wrap.appendChild(profileFold.card);

  const row1 = document.createElement("div");
  row1.className = "field-row";

  row1.appendChild(makeTextField("이름", profile.name, (v) => { profile.name = v; live(); }));
  row1.appendChild(makeTextField("닉네임", profile.nickname, (v) => { profile.nickname = v; live(); }));
  row1.appendChild(makeTextField("역할/타이틀", profile.role, (v) => { profile.role = v; live(); }));
  profileFold.body.appendChild(row1);

  // ---- 소개문 (홈 화면 헤더 아래에 표시) ----
  const bioField = document.createElement("div");
  bioField.className = "field";
  const bioLabel = document.createElement("label");
  bioLabel.textContent = "소개문 (홈 화면 헤더 아래에 표시, 비워두면 표시 안 함)";
  const bioTa = document.createElement("textarea");
  bioTa.rows = 3;
  bioTa.value = profile.bio || "";
  bioTa.addEventListener("input", () => { profile.bio = bioTa.value; live(); });
  bioField.appendChild(bioLabel);
  bioField.appendChild(bioTa);
  profileFold.body.appendChild(bioField);

  const row3 = document.createElement("div");
  row3.className = "field-row";
  row3.appendChild(makeTextField("전화번호", profile.contact.phone, (v) => { profile.contact.phone = v; live(); }));

  const emailField = document.createElement("div");
  emailField.className = "field";
  const emailLabel = document.createElement("label");
  emailLabel.textContent = "이메일 (줄바꿈으로 여러 개 입력 가능)";
  const emailTa = document.createElement("textarea");
  emailTa.rows = 2;
  emailTa.value = (profile.contact.emails || []).join("\n");
  emailTa.addEventListener("input", () => {
    profile.contact.emails = emailTa.value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    live();
  });
  emailField.appendChild(emailLabel);
  emailField.appendChild(emailTa);
  row3.appendChild(emailField);

  profileFold.body.appendChild(row3);
}

/* 접었다 펼치는 설정 구획. 자주 안 건드리는 값들을 닫아 둬 화면을 덜 채운다.
   기본은 닫힌 채로 시작한다 — body를 wrap에 미리 붙여 두고 hidden만 켠다. */
function buildFoldSection(title) {
  const card = document.createElement("div");
  card.className = "settings-fold";

  const head = document.createElement("button");
  head.type = "button";
  head.className = "settings-fold-head";

  const text = document.createElement("span");
  text.textContent = title;
  head.appendChild(text);

  const chevron = document.createElement("img");
  chevron.className = "settings-fold-chevron";
  chevron.src = "assets/icons/chevron-down.svg";
  chevron.alt = "";
  head.appendChild(chevron);

  const body = document.createElement("div");
  body.className = "settings-fold-body";
  body.hidden = true;

  head.addEventListener("click", () => {
    body.hidden = !body.hidden;
    chevron.classList.toggle("is-open", !body.hidden);
  });

  card.appendChild(head);
  card.appendChild(body);
  return { card, body };
}

/* 레이아웃 값 두 가지를 한 자리에 모아 맨 위에 둔다.
   손잡이를 끄는 동안 화면이 바로 따라오도록 다시 그리지 않고 변수만 갱신한다. */
function renderLayoutFields(wrap, profile) {
  // 레이아웃(데스크톱 여백·최대 폭)과 모바일 화면 여백을 한 구획에 모으고,
  // 텍스트 크기처럼 웹/모바일 두 칸으로 나눠 보여준다.
  const layoutFold = buildFoldSection("레이아웃 (최대 폭을 화면보다 크게 올리면 양 끝까지 차요)");
  wrap.appendChild(layoutFold.card);

  const live = () => applyLayoutVars(profile);

  const layoutColumns = document.createElement("div");
  layoutColumns.className = "text-scale-columns";
  layoutFold.body.appendChild(layoutColumns);

  const webCol = document.createElement("div");
  webCol.className = "text-scale-column";
  const webColLabel = document.createElement("div");
  webColLabel.className = "text-scale-column-label";
  webColLabel.textContent = "웹";
  webCol.appendChild(webColLabel);

  webCol.appendChild(buildSliderField(
    "홈 · 상단 메뉴 여백",
    () => profile.sideMargin,
    (v) => { if (v == null) delete profile.sideMargin; else profile.sideMargin = v; },
    { min: 0, max: 120, def: SIDE_MARGIN_DEFAULT },
    live
  ));
  webCol.appendChild(buildSliderField(
    "최대 폭 (홈)",
    () => readMaxWidth(profile.maxWidthHome, profile.fullBleedHome),
    (v) => {
      delete profile.fullBleedHome;      // 예전 스위치 값은 버린다
      if (v == null) delete profile.maxWidthHome;
      else profile.maxWidthHome = v;
    },
    { min: 800, max: MAX_WIDTH_FULL, def: MAX_WIDTH_DEFAULT },
    live
  ));

  // 상세 화면 값이라 관리자 목록에는 바로 보이지 않는다 (미리보기로 확인)
  webCol.appendChild(buildSliderField(
    "콘텐츠 본문 여백",
    () => profile.contentMargin,
    (v) => { if (v == null) delete profile.contentMargin; else profile.contentMargin = v; },
    { min: 0, max: 120, def: SIDE_MARGIN_DEFAULT }
  ));
  webCol.appendChild(buildSliderField(
    "최대 폭 (콘텐츠)",
    () => readMaxWidth(profile.maxWidthContent, profile.fullBleedContent),
    (v) => {
      delete profile.fullBleedContent;
      if (v == null) delete profile.maxWidthContent;
      else profile.maxWidthContent = v;
    },
    { min: 800, max: MAX_WIDTH_FULL, def: MAX_WIDTH_DEFAULT }
  ));
  layoutColumns.appendChild(webCol);

  // 모바일 화면 여백. 데스크톱 값을 그냥 줄이는 게 아니라 따로 관리하는 값이다
  // (지금까지는 18px로 고정돼 있던 걸 조절 가능하게 연 것 — 기본값이 곧 그 18px).
  const mobileCol = document.createElement("div");
  mobileCol.className = "text-scale-column";
  const mobileColLabel = document.createElement("div");
  mobileColLabel.className = "text-scale-column-label";
  mobileColLabel.textContent = "모바일";
  mobileCol.appendChild(mobileColLabel);

  mobileCol.appendChild(buildSliderField(
    "홈 · 상단 메뉴 여백",
    () => profile.sideMarginMobile,
    (v) => { if (v == null) delete profile.sideMarginMobile; else profile.sideMarginMobile = v; },
    { min: 0, max: 60, def: SIDE_MARGIN_MOBILE_DEFAULT },
    live
  ));
  mobileCol.appendChild(buildSliderField(
    "콘텐츠 본문 여백",
    () => profile.contentMarginMobile,
    (v) => { if (v == null) delete profile.contentMarginMobile; else profile.contentMarginMobile = v; },
    { min: 0, max: 60, def: CONTENT_MARGIN_MOBILE_DEFAULT },
    live
  ));
  layoutColumns.appendChild(mobileCol);

  // 세부 조절: 자주 안 건드리는 값들을 한데 모아 접어 둔다. 기본값은 지금
  // 실제로 적용돼 있는 수치라서, 처음 열어도 화면이 그대로다.
  const detailFold = buildFoldSection("세부 조절");
  wrap.appendChild(detailFold.card);

  const detailBox = document.createElement("div");
  detailBox.className = "layout-fields";
  detailFold.body.appendChild(detailBox);
  detailBox.appendChild(buildSliderField(
    "카드 사이 간격",
    () => profile.cardGap,
    (v) => { if (v == null) delete profile.cardGap; else profile.cardGap = v; },
    { min: 0, max: 80, def: CARD_GAP_DEFAULT },
    live
  ));
  detailBox.appendChild(buildSliderField(
    "목록 상단 여백",
    () => profile.listTopGap,
    (v) => { if (v == null) delete profile.listTopGap; else profile.listTopGap = v; },
    { min: 0, max: 160, def: LIST_TOP_GAP_DEFAULT },
    live
  ));
  detailBox.appendChild(buildSliderField(
    "카테고리 줄 위아래 여백",
    () => profile.headGap,
    (v) => { if (v == null) delete profile.headGap; else profile.headGap = v; },
    { min: 0, max: 40, def: HEAD_GAP_DEFAULT },
    live
  ));
  detailBox.appendChild(buildSliderField(
    "펼친 영역 상단 여백",
    () => profile.panelTopGap,
    (v) => { if (v == null) delete profile.panelTopGap; else profile.panelTopGap = v; },
    { min: 0, max: 40, def: PANEL_TOP_GAP_DEFAULT },
    live
  ));
  detailBox.appendChild(buildSliderField(
    "펼친 영역 하단 여백",
    () => profile.panelBottomGap,
    (v) => { if (v == null) delete profile.panelBottomGap; else profile.panelBottomGap = v; },
    { min: 0, max: 80, def: PANEL_BOTTOM_GAP_DEFAULT },
    live
  ));
  detailBox.appendChild(buildSliderField(
    "카드 모서리 둥글기",
    () => profile.cardRadius,
    (v) => { if (v == null) delete profile.cardRadius; else profile.cardRadius = v; },
    { min: 0, max: 60, def: CARD_RADIUS_DEFAULT },
    live
  ));

  // 홈 화면 프로젝트 영역 배경색도 여기 함께 접어 둔다
  const workBgLabel = document.createElement("label");
  workBgLabel.textContent = "홈 화면 배경색 (헤더·푸터까지 함께 적용)";
  workBgLabel.className = "mini-label";
  detailFold.body.appendChild(workBgLabel);

  const workBgRow = document.createElement("div");
  workBgRow.className = "block-controls-row";
  const workBgField = buildColorField(
    profile.workBg || "#0d0d0d",
    (v) => { profile.workBg = v; saveDraft(); renderSiteHeader(profile); },
    { swatches: true, rerender: renderEditModalBody }
  );
  workBgRow.appendChild(workBgField.field);

  const workBgClear = document.createElement("button");
  workBgClear.className = "btn btn-outline btn-small";
  workBgClear.textContent = "기본값";
  workBgClear.addEventListener("click", () => {
    delete profile.workBg;
    renderSiteHeader(profile);
    saveDraft();
    renderEditModalBody();
  });
  workBgRow.appendChild(workBgClear);
  detailFold.body.appendChild(workBgRow);

  // 텍스트 크기: "본문 기본"만 실제 px이고, 나머지 7단계는 본문 기본의
  // 배율(rem 개념)이다. 그래서 평소에 건드릴 건 "본문 기본" 하나뿐 —
  // 바꾸면 카테고리 이름 줄·소개문·푸터·경력 섹션의 나머지 크기가
  // 전부 비례해서 함께 바뀐다. 배율 자체를 다시 잡고 싶을 때만 아래
  // 각 단계의 배율 칸을 고치면 된다. 웹/모바일은 배율 자체가 달라서
  // (모바일에서는 라벨·캡션이 본문과 거의 같이 줄어 배율이 오히려 커진다)
  // 블록을 나눠 따로 둔다.
  const textFold = buildFoldSection("텍스트 크기 (본문 기본 대비 배율)");
  wrap.appendChild(textFold.card);

  const ratioTiers = [
    ["display", "대형 표시", 0.5, 5],
    ["headline", "헤드라인", 0.5, 5],
    ["h3", "작은 제목", 0.5, 3],
    ["label", "라벨 / 작은 텍스트", 0.3, 2],
    ["caption", "캡션", 0.3, 2],
  ];

  // suffix: "Desktop" | "Mobile" — profile.text<Tier>Ratio<Desktop|Mobile> 필드명에 쓴다
  const buildScaleColumn = (title, bodyKey, bodyMin, bodyMax, suffix) => {
    const col = document.createElement("div");
    col.className = "text-scale-column";

    const colLabel = document.createElement("div");
    colLabel.className = "text-scale-column-label";
    colLabel.textContent = title;
    col.appendChild(colLabel);

    col.appendChild(buildSliderField(
      "본문 기본",
      () => profile[bodyKey],
      (v) => { if (v == null) delete profile[bodyKey]; else profile[bodyKey] = v; },
      { min: bodyMin, max: bodyMax, def: suffix === "Desktop" ? TEXT_BODY_DEFAULT : TEXT_BODY_MOBILE_DEFAULT },
      live
    ));

    ratioTiers.forEach(([tier, labelText, min, max]) => {
      const def = TEXT_RATIO_DEFAULTS[tier][suffix === "Desktop" ? "desktop" : "mobile"];
      const key = "text" + tier[0].toUpperCase() + tier.slice(1) + "Ratio" + suffix;
      col.appendChild(buildSliderField(
        labelText,
        () => profile[key],
        (v) => { if (v == null) delete profile[key]; else profile[key] = v; },
        { min, max, def, step: 0.001, unit: "배" },
        live
      ));
    });

    return col;
  };

  const textColumns = document.createElement("div");
  textColumns.className = "text-scale-columns";
  textColumns.appendChild(buildScaleColumn("웹", "textBody", 10, 28, "Desktop"));
  textColumns.appendChild(buildScaleColumn("모바일", "textBodyMobile", 8, 20, "Mobile"));
  textFold.body.appendChild(textColumns);

  // 상세 페이지 개요(설명 문단 · 작업년도 · 기여도 · 사용 툴)의 줄 간격.
  // 웹/모바일 구분 없이 하나로 쓴다 (CSS에 모바일 전용 값이 따로 없음).
  const lhRow = document.createElement("div");
  lhRow.style.marginTop = "10px";
  lhRow.appendChild(buildSliderField(
    "상세 페이지 개요 줄 간격",
    () => profile.overviewLineHeight,
    (v) => { if (v == null) delete profile.overviewLineHeight; else profile.overviewLineHeight = v; },
    { min: 1, max: 2.2, def: OVERVIEW_LINE_HEIGHT_DEFAULT, step: 0.01, unit: "배" },
    live
  ));
  textFold.body.appendChild(lhRow);
}

function makeTextField(labelText, value, onChange) {
  const field = document.createElement("div");
  field.className = "field";
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.addEventListener("input", () => onChange(input.value));
  field.appendChild(label);
  field.appendChild(input);
  return field;
}

/* ---------------------- 실제 사이트와 동일한 화면 (헤더·탭·그리드·푸터) ---------------------- */

// profile을 넘기면 그 값으로 그린다 (설정 판에서 저장 전 미리보기에 쓴다)
function renderSiteHeader(profile) {
  const p = profile || data.profile || {};
  document.getElementById("brandName").textContent = p.nickname || p.name || "Portfolio";
  document.getElementById("brandRole").textContent = p.role || "";
  document.getElementById("footerName").textContent = p.name || p.nickname || "";

  // 공개 사이트(script.js applyWorkBg)와 같은 방식으로 페이지 전체에 깔아
  // 관리자에서 보는 모습이 실제 사이트와 어긋나지 않게 한다
  const body = document.body;
  const work = document.querySelector(".work");
  if (work) work.style.background = "";
  if (p.workBg) {
    body.style.backgroundColor = p.workBg;
    body.style.setProperty("--chrome", p.workBg);
    body.classList.add("bg-takeover");
    body.classList.toggle("bg-takeover-light", !isDarkColor(p.workBg));
  } else {
    body.style.backgroundColor = "";
    body.style.removeProperty("--chrome");
    body.classList.remove("bg-takeover", "bg-takeover-light");
  }

  renderFooterContact(p);
}

/* -------- 카테고리 탭 (스크롤 이동·스크롤 스파이·makeTab은 blocks.js 공용) -------- */

function renderTabs() {
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";

  const cats = data.categories || [];

  // 공개 사이트와 같은 규칙: 카테고리가 하나뿐이면 "All" 탭은 중복이라 감춘다
  if (cats.length > 1) {
    tabs.appendChild(makeTab("All", activeCatId === null, () => scrollToCategory(null)));
  }

  cats.forEach((cat) => {
    const active = cats.length === 1 ? true : activeCatId === cat.id;
    tabs.appendChild(makeTab(cat.name || "(이름 없음)", active, () => scrollToCategory(cat.id)));
  });

  // 관리자 전용: 카테고리 추가 탭
  const add = document.createElement("button");
  add.className = "tab tab-add";
  add.textContent = "＋";
  add.title = "카테고리 추가";
  add.addEventListener("click", () => {
    const cat = {
      id: slugify("new-category"),
      name: "새 카테고리",
      projects: [],
    };
    data.categories.push(cat);
    saveDraft();
    renderTabs();
    renderSections();
    scrollToCategory(cat.id);
    openCategoryEditor(cat);
  });
  tabs.appendChild(add);
}

// 카테고리별로 단(섹션)을 나눠서 렌더링. 공개 사이트와 같은 구조에
// 관리자 전용으로 섹션 머리의 "⚙ 설정" 버튼과 "+ 프로젝트 추가" 카드가 붙는다.
function renderSections() {
  const wrap = document.getElementById("workSections");
  wrap.innerHTML = "";
  stopCoverVideos();

  (data.categories || []).forEach((cat) => {
    const isOpen = !closedCategoryIds.has(cat.id);

    const section = document.createElement("section");
    section.className = "work-section" + (isOpen ? "" : " ws-collapsed");
    section.id = `cat-${cat.id}`;
    section.dataset.catId = cat.id;

    // 공개 사이트의 아코디언 이름 줄과 같은 마크업(acc-head/acc-name/acc-sub)을
    // 그대로 써서 두 화면의 생김새가 어긋나지 않게 한다. 단, 공개 사이트와
    // 달리 여기서는 카테고리마다 따로 접고 펼 수 있다(드래그로 다른
    // 카테고리에 프로젝트를 옮기려면 양쪽 다 열려 있어야 하니까).
    const head = document.createElement("div");
    head.className = "work-section-head";
    const headInner = document.createElement("div");
    headInner.className = "container";

    const row = document.createElement("div");
    row.className = "acc-head ws-head-clickable";

    const text = document.createElement("div");
    text.className = "acc-head-text";
    const nameEl = document.createElement("span");
    nameEl.className = "acc-name";
    nameEl.textContent = cat.name || "(이름 없음)";
    text.appendChild(nameEl);
    if (cat.nameSub && cat.nameSub.trim()) {
      const subEl = document.createElement("span");
      subEl.className = "acc-sub";
      subEl.textContent = cat.nameSub;
      text.appendChild(subEl);
    }
    row.appendChild(text);

    const actions = document.createElement("div");
    actions.className = "work-section-actions";

    const chevron = document.createElement("img");
    chevron.className = "acc-chevron" + (isOpen ? " ws-chevron-open" : "");
    chevron.src = "assets/icons/chevron-down.svg";
    chevron.alt = "";
    actions.appendChild(chevron);

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-outline btn-small ws-edit";
    editBtn.textContent = "⚙ 설정";
    editBtn.title = "카테고리 이름·색상·삭제";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openCategoryEditor(cat);
    });
    actions.appendChild(editBtn);

    row.appendChild(actions);
    row.addEventListener("click", () => {
      if (closedCategoryIds.has(cat.id)) closedCategoryIds.delete(cat.id);
      else closedCategoryIds.add(cat.id);
      renderSections();
    });
    headInner.appendChild(row);
    head.appendChild(headInner);
    section.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "work-grid";
    (cat.projects || []).forEach((project, projIndex) => {
      grid.appendChild(renderAdminCard(cat, project, projIndex));
    });

    const addCard = document.createElement("button");
    addCard.type = "button";
    addCard.className = "card card-add";
    addCard.textContent = "＋ 프로젝트 추가";
    addCard.addEventListener("click", () => {
      const project = {
        id: slugify("new-project"),
        title: "새 프로젝트",
        coverImage: "",
        blocks: [],
        summary: "",
      };
      cat.projects.push(project);
      saveDraft();
      renderSections();
      openProjectEditor(cat, project, cat.projects.length - 1);
    });
    attachCardDropZone(addCard, cat.projects);
    grid.appendChild(addCard);

    section.appendChild(grid);
    wrap.appendChild(section);
  });

  if (!(data.categories || []).length) {
    wrap.innerHTML = `<div class="empty-state">아직 카테고리가 없어요. 탭의 ＋ 버튼으로 추가해보세요.</div>`;
  }
}

/* 카드가 하나도 없는 카테고리에도 떨어뜨릴 수 있도록, "＋ 프로젝트 추가" 카드를
   받는 자리로 함께 쓴다. 놓으면 그 카테고리의 맨 뒤로 들어간다. */
function attachCardDropZone(el, list) {
  el.addEventListener("dragover", (e) => {
    if (!dragCtx || dragCtx.group !== PROJECT_DRAG_GROUP) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    clearDropMarkers();
    // 이미 그 카테고리의 마지막이면 옮겨도 그대로이므로 표시하지 않는다
    if (dragCtx.list === list && dragCtx.from === list.length - 1) return;
    el.classList.add("drop-x", "drop-before");
  });
  el.addEventListener("dragleave", (e) => {
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;
    el.classList.remove(...DROP_CLASSES);
  });
  el.addEventListener("drop", (e) => {
    if (!dragCtx || dragCtx.group !== PROJECT_DRAG_GROUP) return;
    e.preventDefault();
    e.stopPropagation();
    const { list: srcList, from } = dragCtx;
    dragCtx = null;
    clearDropMarkers();
    if (srcList === list && from === list.length - 1) return;
    const [moved] = srcList.splice(from, 1);
    list.push(moved);
    saveDraft();
    renderSections();
  });
}

// 공개 사이트와 같은 카드 + 관리자용 삭제/드래그 핸들. 클릭하면 편집 팝업.
function renderAdminCard(cat, project, projIndex) {
  const card = document.createElement("div");
  card.className = "card admin-card";
  card.addEventListener("click", () => openProjectEditor(cat, project, projIndex));

  const media = document.createElement("div");
  media.className = "card-media";
  if (project.coverImage) {
    media.appendChild(buildCoverMedia(project.coverImage, project.title, false));
  } else {
    const ph = document.createElement("div");
    ph.className = "card-empty-title";
    ph.textContent = `${project.title || "(제목 없음)"} · 커버 없음`;
    media.appendChild(ph);
  }
  card.appendChild(media);

  // 공개 목록과 똑같은 호버 오버레이 (제목·설명·툴 태그)
  const body = document.createElement("div");
  body.className = "card-body";
  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = project.title || "(제목 없음)";
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

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "project-thumb-delete";
  deleteBtn.title = "삭제";
  deleteBtn.textContent = "✕";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm(`"${project.title}" 프로젝트를 삭제할까요?`)) {
      cat.projects.splice(projIndex, 1);
      saveDraft();
      renderSections();
    }
  });
  card.appendChild(deleteBtn);

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "project-thumb-handle";
  handle.title = "드래그해서 순서 변경 · 다른 카테고리로 이동";
  handle.textContent = "⠿";
  handle.addEventListener("click", (e) => {
    e.stopPropagation();
    card.draggable = false; // 드래그 없이 핸들만 클릭했다면 draggable 상태를 되돌린다
  });
  card.appendChild(handle);
  // 카테고리를 가리지 않는 한 그룹이라 다른 카테고리 카드 사이로도 끌어다 놓을 수 있다
  attachDrag(card, handle, PROJECT_DRAG_GROUP, cat.projects, projIndex, renderSections);

  return card;
}

/* ---------------------------------- 프로젝트 편집 팝업 ---------------------------------- */

function openProjectEditor(cat, project, projIndex) {
  editingContext = {
    type: "project",
    cat,
    projIndex,
    original: project,
    // 복사본을 편집하다가 "저장 · 사이트에 반영"을 눌러야 실제 데이터로 들어간다
    project: JSON.parse(JSON.stringify(project)),
    dirty: false,
  };
  openEditModal();
}

function isPanelEditor() {
  return !!editingContext && editingContext.type === "profile";
}

function openProfileEditor() {
  if (!data) return;
  editingContext = {
    type: "profile",
    profile: JSON.parse(JSON.stringify(data.profile || {})),
    dirty: false,
  };
  openEditModal();
}

// 버튼을 다시 누르면 닫힌다
function toggleProfileEditor() {
  if (isPanelEditor()) closeProjectEditor();
  else openProfileEditor();
}

function openCategoryEditor(cat) {
  editingContext = {
    type: "category",
    cat,
    copy: { name: cat.name || "", nameSub: cat.nameSub || "" },
    dirty: false,
  };
  openEditModal();
}

function openEditModal() {
  updateModalSaveState();
  renderEditModalBody();
  if (isPanelEditor()) {
    document.getElementById("profilePanel").hidden = false;
    document.getElementById("profileEditBtn").classList.add("btn-primary");
  } else {
    document.getElementById("projectEditOverlay").classList.remove("hidden");
  }
}

// force=true면 확인 없이 닫는다 (저장 완료 후, 삭제 후)
function closeProjectEditor(force = false) {
  if (!force && editingContext && editingContext.dirty) {
    if (!confirm("저장하지 않은 변경사항이 있어요.\n저장하지 않고 닫으면 이번에 수정한 내용은 사라져요. 그래도 닫을까요?")) {
      return;
    }
  }
  editingContext = null;
  applyModalBg(null);
  document.getElementById("projectEditOverlay").classList.add("hidden");
  document.getElementById("profilePanel").hidden = true;
  document.getElementById("profileEditBtn").classList.remove("btn-primary");
  renderAll();
}

function updateModalSaveState() {
  const dirty = !!(editingContext && editingContext.dirty);
  const id = isPanelEditor() ? "profilePanelState" : "modalSaveState";
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = dirty ? "● 저장되지 않은 변경사항이 있어요" : "";
  el.classList.toggle("visible", dirty);
}

// 편집 팝업의 복사본을 실제 데이터에 반영하고 곧바로 사이트에 배포한다
async function saveModalAndPublish() {
  if (!editingContext) return;
  const ctx = editingContext;
  if (ctx.type === "project") {
    ctx.cat.projects[ctx.projIndex] = ctx.project;
  } else if (ctx.type === "profile") {
    data.profile = ctx.profile;
  } else if (ctx.type === "category") {
    ctx.cat.name = ctx.copy.name;
    ctx.cat.nameSub = ctx.copy.nameSub;
  }
  saveDraft();
  const ok = await publishToGithub();
  if (ok) closeProjectEditor(true);
  // 실패하면(토큰 없음/네트워크 오류) 팝업을 유지해 다시 시도할 수 있게 한다
}

/* 상세 페이지 맨 위(배경 + 제목 + 카테고리 뱃지)를 실제 보이는 모습 그대로 그린다.
   project.js의 상단 처리와 같은 클래스·같은 판별을 써서 눈으로 본 대로 저장된다. */
/* 실제 페이지에서 이 자리에 깔리는 색을 미리보기에도 그대로 입힌다.
   상단은 heroBg가 없으면 프로젝트 전체 배경색이 그대로 비쳐 보이고,
   밝은 색을 깔면 사이트가 글자색을 뒤집으므로 여기서도 똑같이 뒤집는다. */
/* 편집 팝업 전체를 그 프로젝트의 배경색으로 물들인다.
   상세 페이지를 열었을 때와 같은 색 위에서 고치게 된다. */
function applyModalBg(color) {
  const modal = document.querySelector(".admin-modal");
  if (!modal) return;
  modal.style.background = "";
  modal.style.removeProperty("--preview-bg");
  modal.classList.remove("preview-light");
  applyPreviewBg(modal, color);
}

function applyPreviewBg(el, color) {
  if (!color) return false;
  el.style.background = color;
  el.style.setProperty("--preview-bg", color);
  const light = !isDarkColor(color);
  el.classList.toggle("preview-light", light);
  return !light;
}

function renderHeroPreview(cat, project) {
  const wrap = document.createElement("div");
  wrap.className = "proj-hero-wrap hero-preview";
  // heroBg를 안 정하면 실제 페이지에서는 전체 배경색이 그대로 보인다
  const dark = applyPreviewBg(wrap, project.heroBg || project.bgColor);
  if (dark || !(project.heroBg || project.bgColor)) wrap.classList.add("proj-hero-dark");

  const inner = document.createElement("div");
  inner.className = "container proj-hero";

  const h1 = document.createElement("h1");
  h1.className = "proj-title blk-text-edit";
  h1.contentEditable = "true";
  h1.spellcheck = false;
  h1.dataset.placeholder = "프로젝트 제목";
  h1.textContent = project.title || "";
  // 폰트 두께는 프로필의 전역 설정을 따른다 (실제 페이지와 같은 규칙)
  const weight = (data.profile || {}).projectTitleWeight || project.titleWeight;
  if (weight) h1.style.fontWeight = weight;
  if (project.titleColor) h1.style.color = project.titleColor;
  h1.addEventListener("input", () => {
    project.title = h1.innerText.replace(/\n/g, " ").trim();
    saveDraft();
  });
  // 제목은 한 줄이므로 엔터로 줄을 늘리지 않는다
  h1.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
  });
  h1.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain").replace(/\s+/g, " ");
    document.execCommand("insertText", false, text);
  });

  inner.appendChild(h1);
  wrap.appendChild(inner);
  return wrap;
}

/* 배경색·카드 설명·콘텐츠 간격처럼 한 번 정하면 잘 안 바꾸는 값들.
   제목 줄의 "⚙ 설정"으로 여닫으며, 상태는 팝업을 다시 열어도 유지된다. */
let projectSettingsOpen = false;

function renderProjectSettings(project) {
  const grid = document.createElement("div");
  grid.className = "proj-settings";

  // 라벨 + 내용 한 덩어리를 만든다
  const field = (labelText, wide = false) => {
    const box = document.createElement("div");
    box.className = wide ? "proj-field proj-field-wide" : "proj-field";
    const label = document.createElement("label");
    label.className = "mini-label";
    label.textContent = labelText;
    box.appendChild(label);
    grid.appendChild(box);
    return box;
  };

  // 색상 + "지우기" 버튼을 한 줄에
  const colorField = (labelText, get, set, clearText) => {
    const box = field(labelText);
    const row = document.createElement("div");
    row.className = "block-controls-row";
    row.style.marginTop = "6px";
    row.appendChild(
      buildColorField(get() || "#0d0d0d", (v) => { set(v); saveDraft(); },
        { swatches: true, rerender: renderEditModalBody }).field
    );
    const clear = document.createElement("button");
    clear.className = "btn btn-outline btn-small";
    clear.textContent = clearText;
    clear.addEventListener("click", () => { set(null); saveDraft(); renderEditModalBody(); });
    row.appendChild(clear);
    box.appendChild(row);
  };

  const summaryBox = field("카드 설명 (목록 카드의 제목 아래)", true);
  const summaryInput = document.createElement("input");
  summaryInput.type = "text";
  summaryInput.value = project.summary || "";
  summaryInput.placeholder = "예: Brand Concept & Strategy, Visual Identity Design";
  summaryInput.className = "summary-input";
  summaryInput.addEventListener("input", () => { project.summary = summaryInput.value; saveDraft(); });
  summaryBox.appendChild(summaryInput);

  colorField(
    "상세 페이지 제목 영역 배경",
    () => project.heroBg,
    (v) => { if (v == null) delete project.heroBg; else project.heroBg = v; },
    "배경 없음"
  );
  colorField(
    "상세 페이지 제목 색상",
    () => project.titleColor,
    (v) => { if (v == null) delete project.titleColor; else project.titleColor = v; },
    "자동 (배경에 맞춰 조정)"
  );
  colorField(
    project.bgColor ? "페이지 전체 배경" : "페이지 전체 배경 · 미설정",
    () => project.bgColor,
    (v) => { if (v == null) delete project.bgColor; else project.bgColor = v; },
    "기본 배경"
  );

  const gapBox = field("콘텐츠 간격 (블록 사이 + 그리드 이미지 사이)");
  const gapRow = document.createElement("div");
  gapRow.className = "block-controls-row";
  gapRow.style.marginTop = "6px";
  gapRow.appendChild(buildGapField(
    "간격",
    () => project.blockGap,
    (g) => { if (g == null) delete project.blockGap; else project.blockGap = g; },
    "28"
  ));
  gapBox.appendChild(gapRow);

  return grid;
}

function renderEditModalBody() {
  if (!editingContext) return;
  if (editingContext.type === "profile") return renderProfileModalBody();
  if (editingContext.type === "category") return renderCategoryModalBody();
  const { cat, project, projIndex } = editingContext;
  applyModalBg(project.bgColor);
  const card = document.getElementById("projectEditBody");
  card.innerHTML = "";

  const head = document.createElement("div");
  head.className = "project-card-head";

  const headLabel = document.createElement("span");
  headLabel.className = "mini-label";
  headLabel.textContent = "상세 페이지 상단 (제목을 눌러 바로 고칠 수 있어요)";
  headLabel.style.marginTop = "0";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn-danger btn-small";
  deleteBtn.textContent = "삭제";
  deleteBtn.addEventListener("click", () => {
    if (confirm(`"${project.title}" 프로젝트를 삭제할까요?`)) {
      cat.projects.splice(projIndex, 1);
      saveDraft();
      closeProjectEditor(true);
    }
  });

  const settingsBtn = document.createElement("button");
  settingsBtn.className = "btn btn-ghost btn-small";
  settingsBtn.textContent = projectSettingsOpen ? "⚙ 설정 접기" : "⚙ 설정";
  settingsBtn.title = "배경색 · 카드 설명 · 콘텐츠 간격";
  settingsBtn.addEventListener("click", () => {
    projectSettingsOpen = !projectSettingsOpen;
    renderEditModalBody();
  });

  head.appendChild(headLabel);
  head.appendChild(settingsBtn);
  head.appendChild(deleteBtn);
  card.appendChild(head);

  // 페이지 설정은 "⚙ 설정"을 누른 그 줄 바로 아래에 펼쳐진다
  if (projectSettingsOpen) card.appendChild(renderProjectSettings(project));

  card.appendChild(renderHeroPreview(cat, project));

  // 개요(설명 · 작업년도 · 기여도 · 사용 툴)는 공개 화면과 같은 마크업을 쓰고,
  // 눌러서 그 자리에서 바로 고친다. 사용 툴은 위 아이콘에서 자동으로 따라온다.
  const overviewWrap = document.createElement("div");
  overviewWrap.className = "overview-preview";
  applyPreviewBg(overviewWrap, project.heroBg || project.bgColor);

  // 설명 칸은 텍스트 블록과 똑같이 굵게·크기·자간을 다룰 수 있게 한다
  const descSlot = richSlot(project, "overview", "overviewRuns");
  let descEl = null;
  overviewWrap.appendChild(buildProjectOverview(project, {
    set: (field, value) => {
      if (value) project[field] = value;
      else delete project[field];
      saveDraft();
    },
    /* 툴은 이 칸에서 바로 고른다. 열두 개를 모두 늘어놓고 켜둔 것만
       또렷하게 보여준다 — 공개 화면에는 켜둔 것만 나간다. */
    tools: (dd) => {
      TOOLS.forEach((tool) => {
        const btn = buildToolNameItem(tool, true);
        const on = (project.tools || []).includes(tool.id);
        btn.classList.toggle("tool-off", !on);
        btn.setAttribute("aria-pressed", String(on));
        btn.addEventListener("click", () => {
          const picked = new Set(project.tools || []);
          if (picked.has(tool.id)) picked.delete(tool.id);
          else picked.add(tool.id);
          // 저장 순서는 디자인에 정의된 순서를 따른다
          const next = TOOLS.filter((t) => picked.has(t.id)).map((t) => t.id);
          if (next.length) project.tools = next;
          else delete project.tools;
          saveDraft();
          renderEditModalBody();
        });
        dd.appendChild(btn);
      });
    },
    desc: (el) => {
      descEl = el;
      el.classList.add("blk-text-edit");
      el.contentEditable = "true";
      el.spellcheck = false;
      el.dataset.placeholder = "프로젝트 설명";
      el.addEventListener("input", () => {
        storeRichText(el, descSlot);
        saveDraft();
      });
      // 서식이 딸려 들어오지 않도록 붙여넣기는 글자만 받는다
      el.addEventListener("paste", (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData("text/plain");
        document.execCommand("insertText", false, text);
      });
    },
  }));
  // 개요의 글자 크기·자간은 이제 텍스트 시스템(라벨/본문 토큰)을 그대로 따르므로
  // 굵게/보통 선택과 색상만 남긴다
  const ovControls = document.createElement("div");
  ovControls.className = "block-controls-row overview-controls";
  ovControls.appendChild(buildWeightButtons(() => descEl, descSlot));

  const ovColorLabel = document.createElement("span");
  ovColorLabel.className = "control-label";
  ovColorLabel.textContent = "색상";
  ovControls.appendChild(ovColorLabel);

  const ovColorField = buildColorField(
    project.overviewColor || "#000000",
    (v) => {
      project.overviewColor = v;
      if (descEl) descEl.style.color = v;
      saveDraft();
    },
    { swatches: true, rerender: renderEditModalBody }
  );
  ovControls.appendChild(ovColorField.field);

  const ovColorClear = document.createElement("button");
  ovColorClear.type = "button";
  ovColorClear.className = "btn btn-outline btn-xs";
  ovColorClear.textContent = "자동";
  ovColorClear.title = "배경 밝기에 맞춰 자동으로 정한 색으로 되돌리기";
  ovColorClear.addEventListener("click", () => {
    delete project.overviewColor;
    saveDraft();
    renderEditModalBody();
  });
  ovControls.appendChild(ovColorClear);

  card.appendChild(ovControls);
  card.appendChild(overviewWrap);

  // ---- 커버 이미지 ----
  const coverLabel = document.createElement("label");
  coverLabel.textContent = "커버 이미지 · 영상 (목록 카드에 표시)";
  coverLabel.className = "mini-label";
  coverLabel.style.marginTop = "14px";
  card.appendChild(coverLabel);

  const coverRow = document.createElement("div");
  coverRow.className = "thumb-row";
  if (project.coverImage) {
    coverRow.appendChild(makeThumb(project.coverImage, isVideoFile(project.coverImage) ? "video" : "image", () => {
      project.coverImage = "";
      saveDraft();
      renderEditModalBody();
    }));
  }
  // 커버는 이미지뿐 아니라 영상 파일도 쓸 수 있다 (목록에서 소리 없이 반복 재생)
  coverRow.appendChild(makeUploadTile(project.coverImage ? "교체" : "커버 업로드", { accept: "image/*,video/*" }, (files) => {
    if (!files.length) return;
    readFileAsDataURL(files[0]).then((dataUrl) => {
      project.coverImage = dataUrl;
      saveDraft();
      renderEditModalBody();
    });
  }));
  card.appendChild(coverRow);

  // ---- 콘텐츠 블록 ----
  // 위쪽(제목·개요·커버 이미지)과 구분되도록 선을 긋고 한 단 띄운다
  const blocksLabel = document.createElement("label");
  blocksLabel.textContent = "상세 콘텐츠 (실제 보이는 모습 그대로 · ⠿ 핸들을 드래그하면 순서가 바뀌어요)";
  blocksLabel.className = "mini-label content-section-label";
  card.appendChild(blocksLabel);

  card.appendChild(renderBlocksEditor(project));
}

// 프로필 편집 팝업 본문
function renderProfileModalBody() {
  const card = document.getElementById("profilePanelBody");
  card.innerHTML = "";
  renderProfileFields(card, editingContext.profile);
}

// 카테고리 설정 팝업 본문 (이름·색상·삭제)
function renderCategoryModalBody() {
  applyModalBg(null);
  const { cat, copy } = editingContext;
  const card = document.getElementById("projectEditBody");
  card.innerHTML = "";

  const head = document.createElement("div");
  head.className = "project-card-head";
  const title = document.createElement("strong");
  title.textContent = "카테고리 설정";
  head.appendChild(title);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn-danger btn-small";
  deleteBtn.textContent = "카테고리 삭제";
  deleteBtn.addEventListener("click", () => {
    if (confirm(`"${cat.name}" 카테고리와 그 안의 모든 프로젝트를 삭제할까요?`)) {
      const idx = data.categories.indexOf(cat);
      if (idx >= 0) data.categories.splice(idx, 1);
      saveDraft();
      closeProjectEditor(true);
    }
  });
  head.appendChild(deleteBtn);
  card.appendChild(head);

  const row = document.createElement("div");
  row.className = "field-row";
  row.appendChild(makeTextField("카테고리 이름 (헤더 탭과 상세 페이지 태그에 표시)", copy.name, (v) => {
    copy.name = v;
    saveDraft();
  }));
  row.appendChild(makeTextField("부제 (선택, 이름 옆에 작게 표시 — 예: Works)", copy.nameSub, (v) => {
    copy.nameSub = v;
    saveDraft();
  }));
  card.appendChild(row);
}

/* ---------------------------------- 블록 에디터 ---------------------------------- */

function blockTypeLabel(block) {
  if (block.type === "text") return "텍스트";
  if (block.type === "images") {
    return { single: "이미지 · 단일", grid: "이미지 · 그리드", slider: "이미지 · 자동 슬라이드" }[block.layout] || "이미지";
  }
  return "비디오";
}

/* 접어둔 영상 자리에 놓이는 한 줄짜리 표시.
   따로 버튼을 두지 않고 이 줄을 누르면 바로 펼쳐진다. */
function renderFoldedEmbed(block) {
  const strip = document.createElement("button");
  strip.type = "button";
  strip.className = "embed-folded";
  strip.title = "눌러서 영상 펼치기";
  const label = document.createElement("span");
  label.className = "embed-folded-src";
  label.textContent = block.src ? shortenEmbedSrc(block.src) : "(링크가 없는 임베드 블록)";
  if (!block.src) label.classList.add("embed-folded-empty");
  // "펼치기" 버튼이 이제 머리줄에 늘 붙어 있으므로, 여기서는 중복해서 적지 않는다
  strip.appendChild(label);
  strip.addEventListener("click", () => {
    blockFolds.set(block, false);
    renderEditModalBody();
  });
  return strip;
}

// 긴 임베드 주소를 알아볼 수 있는 만큼만 줄인다
function shortenEmbedSrc(src) {
  const m = /vimeo\.com\/(?:video\/)?(\d+)/.exec(src);
  if (m) return `Vimeo · ${m[1]}`;
  const y = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/.exec(src);
  if (y) return `YouTube · ${y[1]}`;
  if (isVideoFile(src)) return "업로드한 영상 파일";
  return src.length > 60 ? src.slice(0, 57) + "..." : src;
}

function renderBlocksEditor(project) {
  project.blocks = project.blocks || [];
  const wrap = document.createElement("div");
  wrap.className = "block-list";
  // 콘텐츠 간격(실제 페이지 값, 미설정이면 기본 28px)에 편집 카드끼리
  // 구분되도록 여유를 더 얹는다 — 실제 페이지 간격 자체는 그대로 둔다
  const blockGap = normalizeGap(project.blockGap);
  const gapPx = (blockGap != null ? blockGap : 28) + 20;
  wrap.style.gap = gapPx + "px";
  // 드래그 중 뜨는 삽입 표시(막대)가 카드 사이 빈 틈 한가운데 오도록,
  // 실제 간격 값을 CSS에서 절반씩 끌어당기는 데 쓴다
  wrap.style.setProperty("--block-gap", gapPx + "px");
  const group = `blocks-${project.id}`;

  project.blocks.forEach((block, i) => {
    const item = document.createElement("div");
    item.className = "block-item";

    const bh = document.createElement("div");
    bh.className = "block-head";

    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "drag-handle";
    handle.title = "드래그해서 순서 변경";
    handle.textContent = "⠿";

    const label = document.createElement("span");
    label.className = "block-type-label";
    label.textContent = blockTypeLabel(block);

    const spacer = document.createElement("span");
    spacer.className = "block-head-spacer";

    bh.appendChild(handle);
    bh.appendChild(label);
    bh.appendChild(spacer);

    // 영상은 세로로 길어 목록을 밀어내므로 기본으로 접어두고, 나머지는 실제 크기 그대로 둔다
    const folded = isBlockFolded(block);
    const canFold =
      block.type === "embed" || (block.type === "images" && (block.images || []).length > 0);
    // 이미지의 "줄이기/전체 보기"와 영상의 "펼치기/접기"를 한 말로 통일하고,
    // 종류 이름 바로 옆에 둔다 (오른쪽 끝 설정/삭제와 헷갈리지 않도록)
    if (canFold) {
      const fold = document.createElement("button");
      fold.type = "button";
      fold.className = "btn btn-ghost btn-xs";
      fold.textContent = folded ? "펼치기" : "접기";
      fold.addEventListener("click", () => {
        blockFolds.set(block, !folded);
        renderEditModalBody();
      });
      bh.insertBefore(fold, spacer);
    }

    /* 아직 비어 있는 블록은 넣을 방법이 설정 줄에 있으므로 접지 않는다.
       영상은 펼쳤을 때 링크 칸이 늘 영상 위에 함께 보이므로,
       따로 여닫는 설정 버튼을 두지 않는다. 텍스트는 조절 메뉴를 머리줄에
       바로 붙여 늘 보이므로, 이쪽도 여닫는 버튼이 필요 없다. */
    const mustShowSettings =
      needsSetup(block) || (block.type === "embed" && !folded) || block.type === "text";
    const settingsOpen = mustShowSettings || openSettings.has(block);
    // 영상·텍스트는 늘 설정이 함께 뜨므로 여닫는 버튼이 필요 없다
    if (!mustShowSettings && block.type !== "embed") {
      const gear = document.createElement("button");
      gear.type = "button";
      gear.className = "btn btn-ghost btn-xs";
      gear.textContent = settingsOpen ? "⚙ 설정 접기" : "⚙ 설정";
      gear.addEventListener("click", () => {
        if (settingsOpen) openSettings.delete(block);
        else openSettings.add(block);
        renderEditModalBody();
      });
      bh.appendChild(gear);
    }

    const del = document.createElement("button");
    del.className = "btn btn-danger btn-xs";
    del.textContent = "삭제";
    del.addEventListener("click", () => {
      if (confirm("이 블록을 삭제할까요?")) {
        project.blocks.splice(i, 1);
        saveDraft();
        renderEditModalBody();
      }
    });
    bh.appendChild(del);
    item.appendChild(bh);

    // 실제 사이트에 보이는 모습. 텍스트는 여기서 바로 고칠 수 있다.
    // 링크가 없는 임베드는 보여줄 게 없어 미리보기를 생략한다.
    // 이미지 블록은 비어 있어도 빈 칸을 보여줘야 하므로 항상 그린다.
    // 링크가 아예 없을 때만 감춘다 — 펼친 임베드는 설정을 늘 함께 보여주므로
    // mustShowSettings로 판단하면 영상이 영영 뜨지 않는다
    const hidePreview = block.type === "embed" && needsSetup(block);
    const preview = document.createElement("div");
    preview.className = "block-preview";
    if (hidePreview) {
      preview.remove();
    } else if (block.type === "embed" && folded) {
      // 접었을 때는 iframe을 아예 만들지 않아 영상이 로드되지 않는다
      preview.appendChild(renderFoldedEmbed(block));
    } else {
      // 기본은 실제 페이지와 같은 크기. 이미지를 접으면 높이만 잘라 보여준다
      if (canFold && folded) preview.classList.add("block-preview-capped");
      // 텍스트는 미리보기(textPreviewNodes)를 먼저 만들어야, 뒤이어 만들
      // 조절 줄의 "굵게/보통" 버튼이 그 실제 글자 요소를 붙잡을 수 있다
      preview.appendChild(renderPreviewBlockContent(project, block, i));
    }

    // 텍스트는 조절 메뉴가 짧아 따로 줄을 만들지 않고 머리줄에 바로 붙인다.
    // (위 미리보기가 만든 textPreviewNodes를 참조하므로 그 뒤에 만든다)
    let inlineControls = null;
    if (settingsOpen && block.type === "text") {
      inlineControls = renderBlockBody(project, block, i).firstChild;
      bh.insertBefore(inlineControls, spacer);
      bh.classList.add("block-head-merged");
    }

    // 조절 줄은 미리보기 위에 둔다 — 아래에 있으면 어느 블록 것인지 헷갈린다.
    // (텍스트는 위에서 이미 머리줄에 합쳐 넣었으니 여기서는 건너뛴다)
    if (settingsOpen && !inlineControls) {
      const settings = document.createElement("div");
      settings.className = "block-settings";
      settings.appendChild(renderBlockBody(project, block, i));
      item.appendChild(settings);
    }

    if (!hidePreview) item.appendChild(preview);

    attachDrag(item, handle, group, project.blocks, i);
    wrap.appendChild(item);

    // 막 추가한 블록이면 바로 쓸 수 있게 커서를 넣어 준다
    if (block === focusNewBlock) {
      focusNewBlock = null;
      const target = item.querySelector(".embed-input, .blk-text-edit");
      if (target) requestAnimationFrame(() => target.focus());
      requestAnimationFrame(() => item.scrollIntoView({ block: "center", behavior: "smooth" }));
    }
  });

  const addRow = document.createElement("div");
  addRow.className = "add-block-row";
  const mkAdd = (text, makeBlock) => {
    const b = document.createElement("button");
    b.className = "btn btn-outline btn-small";
    b.textContent = text;
    b.addEventListener("click", () => {
      const block = makeBlock();
      project.blocks.push(block);
      focusNewBlock = block;
      saveDraft();
      renderEditModalBody();
    });
    return b;
  };
  addRow.appendChild(mkAdd("+ 텍스트", () => ({ type: "text", content: "", color: "#000000", align: "left" })));
  addRow.appendChild(mkAdd("+ 이미지", () => ({ type: "images", layout: "single", images: [] })));
  addRow.appendChild(mkAdd("+ 비디오", () => ({ type: "embed", src: "" })));
  wrap.appendChild(addRow);

  return wrap;
}

function renderBlockBody(project, block, blockIndex) {
  const body = document.createElement("div");

  if (block.type === "text") {
    // 글은 위쪽 미리보기에서 바로 고친다. 여기에는 조절값만 둔다.
    const pv = textPreviewNodes.get(block) || document.createElement("p");

    const controls = document.createElement("div");
    controls.className = "block-controls-row";

    // 드래그로 고른 글자만 굵게/보통으로 바꾼다
    const weightButtons = buildWeightButtons(() => pv, richSlot(block, "content", "runs"));

    const colorLabel = document.createElement("span");
    colorLabel.className = "control-label";
    colorLabel.textContent = "색상";

    const colorField = buildColorField(
      block.color || "#000000",
      (v) => {
        block.color = v;
        applyTextStyle(pv, block);
        saveDraft();
      },
      { swatches: true, rerender: renderEditModalBody }
    );

    const alignLabel = document.createElement("span");
    alignLabel.className = "control-label";
    alignLabel.textContent = "정렬";

    const alignSeg = buildSeg(
      [["left", "왼쪽"], ["center", "가운데"], ["right", "오른쪽"]],
      block.align || "left",
      (v) => { block.align = v; }
    );

    controls.appendChild(weightButtons);
    controls.appendChild(colorLabel);
    controls.appendChild(colorField.field);
    controls.appendChild(alignLabel);
    controls.appendChild(alignSeg);
    body.appendChild(controls);
    return body;
  }

  if (block.type === "images") {
    // 레이아웃 · 그리드 형태 · 이미지 간격을 한 줄에 모아 배치
    const segRow = document.createElement("div");
    segRow.className = "block-controls-row";

    segRow.appendChild(buildSeg(
      [["single", "단일"], ["grid", "그리드"], ["slider", "자동 슬라이드"]],
      block.layout || "single",
      (v) => {
        block.layout = v;
        if (v === "grid" && !block.grid) block.grid = "3";
      }
    ));

    // 그리드 형태 선택
    if (block.layout === "grid") {
      segRow.appendChild(buildSeg(
        [["2", "2열"], ["3", "3열"], ["4", "4열"], ["masonry", "모자이크"]],
        block.grid || "3",
        (v) => { block.grid = v; }
      ));
    }

    // 이미지 사이 간격 (슬라이드는 한 장씩 보여서 간격 개념이 없음)
    // 비워두면 프로젝트의 "콘텐츠 간격"을 따르고, 그것도 없으면 레이아웃 기본값 사용
    if (block.layout !== "slider") {
      const projGap = normalizeGap(project.blockGap);
      const defGap = projGap != null ? String(projGap) : (block.layout === "grid" ? "10" : "0");
      segRow.appendChild(buildGapField(
        "간격",
        () => block.gap,
        (g) => { if (g == null) delete block.gap; else block.gap = g; },
        defGap
      ));
    }
    body.appendChild(segRow);


    if (block.layout === "slider") {
      const hint = document.createElement("div");
      hint.className = "block-hint";
      hint.textContent = "사이트에서 3.5초 간격으로 자동으로 넘어가요. 점을 눌러 이동할 수도 있어요.";
      body.appendChild(hint);
    }
    return body;
  }

  if (block.type === "embed") {
    const uploadedFile = block.src && (block.src.startsWith("data:") || block.src.startsWith("assets/"));

    // 파일 올리기와 링크/코드 붙여넣기를 좌우 반반, 같은 높이로 나란히 둔다
    const sourceRow = document.createElement("div");
    sourceRow.className = "embed-source-row";

    sourceRow.appendChild(makeUploadTile(uploadedFile ? "다른 영상으로 교체" : "영상 파일 올리기", { accept: "video/*" }, (files) => {
      if (!files.length) return;
      readFileAsDataURL(files[0]).then((dataUrl) => {
        block.src = dataUrl;
        blockFolds.set(block, false); // 방금 올린 영상은 펼친 채로 둔다
        saveDraft();
        autoFillEmbedRatio(block); // 원본 비율은 뒤에서 알아내 조용히 저장한다
        renderEditModalBody();
      });
    }));

    const input = document.createElement("input");
    input.type = "text";
    input.className = "embed-input";
    input.placeholder = "유튜브/비메오 링크 또는 <iframe> 임베드 코드 붙여넣기";
    input.value = block.src && !uploadedFile ? block.src : "";
    input.addEventListener("input", () => {
      block.src = normalizeEmbedSrc(input.value);
      saveDraft();
    });
    sourceRow.appendChild(input);

    body.appendChild(sourceRow);

    if (uploadedFile) {
      const note = document.createElement("div");
      note.className = "block-hint";
      note.textContent = "🎬 업로드된 영상 파일이 연결되어 있어요.";
      body.appendChild(note);

      // 넷 다 미리보기의 실제 <video> 속성에 반영돼야 하므로 바꿀 때마다 다시 그린다
      const toggles = document.createElement("div");
      toggles.className = "block-controls-row";
      toggles.appendChild(buildToggleField(
        "자동재생",
        () => block.videoAutoplay !== false,
        (v) => { block.videoAutoplay = v; },
        () => renderEditModalBody()
      ));
      toggles.appendChild(buildToggleField(
        "반복 재생",
        () => block.videoLoop !== false,
        (v) => { block.videoLoop = v; },
        () => renderEditModalBody()
      ));
      toggles.appendChild(buildToggleField(
        "음소거",
        () => block.videoMuted !== false,
        (v) => { block.videoMuted = v; },
        () => renderEditModalBody()
      ));
      toggles.appendChild(buildToggleField(
        "재생바 표시",
        () => block.videoControls !== false,
        (v) => { block.videoControls = v; },
        () => renderEditModalBody()
      ));
      body.appendChild(toggles);
      // 자동재생은 브라우저 정책상 음소거일 때만 허용된다
      const hint = document.createElement("div");
      hint.className = "block-hint";
      hint.textContent = "자동재생을 켜면, 음소거를 꺼도 브라우저 정책상 소리 없이 재생돼요.";
      body.appendChild(hint);
    }

    const ratioRow = buildEmbedRatioField(block);

    // 붙여넣기를 마치면 정리된 주소를 입력창에도 보여준다.
    // 여기서 화면을 통째로 다시 그리면 그 순간 누르고 있던 버튼이 사라져
    // 클릭이 씹히므로, 비율 확인만 새 주소 기준으로 다시 돌린다.
    // (어느 주소로 구한 비율인지는 block.ratioSrc가 기억한다)
    input.addEventListener("change", () => {
      const v = normalizeEmbedSrc(input.value);
      input.value = v;
      block.src = v;
      saveDraft();
      autoFillEmbedRatio(block, ratioRow.querySelector(".block-hint"));

      /* 링크를 처음 넣으면 그 자리에 바로 영상이 보여야 한다.
         화면을 통째로 다시 그리면 그 순간 누르고 있던 버튼이 사라져 클릭이
         씹히므로, 이 블록에만 미리보기를 만들어 붙인다.
         붙이면 블록이 길어져 아래 버튼이 밀리므로, 다른 버튼을 누르다가
         생긴 change라면 그 클릭이 끝난 뒤에 붙인다. */
      const item = input.closest(".block-item");
      if (!v || !item || item.querySelector(".block-preview")) return;
      blockFolds.set(block, false); // 방금 넣은 영상은 펼친 채로 둔다
      afterClick(() => {
        if (!item.isConnected || item.querySelector(".block-preview")) return;
        const preview = document.createElement("div");
        preview.className = "block-preview";
        preview.appendChild(renderPreviewBlockContent(project, block, blockIndex));
        item.appendChild(preview);
      });
    });

    body.appendChild(ratioRow);
    return body;
  }

  return body;
}

// 임베드 주소에서 원본 영상 비율을 자동으로 알아낸다.
// - 업로드한 영상 파일: 브라우저가 직접 크기를 읽는다 (네트워크 불필요)
// - Vimeo / YouTube: oEmbed가 원본 크기를 알려준다
// 알아내지 못하면 null을 돌려주고, 그 경우 16:9 기본값이 쓰인다.
async function detectEmbedRatio(src) {
  if (!src) return null;

  if (isVideoFile(src)) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.addEventListener("loadedmetadata", () => {
        resolve(v.videoWidth && v.videoHeight ? { w: v.videoWidth, h: v.videoHeight } : null);
      }, { once: true });
      v.addEventListener("error", () => resolve(null), { once: true });
      v.src = src;
    });
  }

  let api = null;
  try {
    const u = new URL(src);
    if (u.hostname.includes("vimeo.com")) {
      const m = u.pathname.match(/\/(?:video\/)?(\d+)/);
      if (m) api = `https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F${m[1]}`;
    } else if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      api = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(src)}`;
    }
  } catch (e) {}
  if (!api) return null;

  try {
    const res = await fetch(api);
    if (!res.ok) return null;
    const d = await res.json();
    return d.width && d.height ? { w: d.width, h: d.height } : null;
  } catch (e) {
    return null;
  }
}

// 지금 주소에 대한 비율이 아직 없으면 원본에서 알아내 채운다.
// ratioSrc(그 비율을 구한 주소)가 현재 주소와 같으면 건너뛰므로
// 다시 그려도 반복 요청하지 않고, 주소가 바뀌면 자동으로 다시 확인한다.
async function autoFillEmbedRatio(block, statusEl) {
  if (!block.src) return;
  if (block.ratioW && block.ratioH && block.ratioSrc === block.src) return;
  const target = block.src;
  if (statusEl) statusEl.textContent = "원본 비율 확인 중…";
  const r = await detectEmbedRatio(target);
  // 확인하는 동안 팝업이 닫혔거나 주소가 또 바뀌었으면 결과를 버린다
  if (!editingContext || block.src !== target) return;
  if (!r) {
    // 못 알아낸 경우 이전 비율을 지워 16:9 기본값으로 돌린다
    delete block.ratioW;
    delete block.ratioH;
    block.ratioSrc = target;
    saveDraft();
    if (statusEl) statusEl.textContent = "자동 확인 실패 — 16:9로 표시됩니다 (필요하면 직접 입력)";
    return;
  }
  block.ratioW = r.w;
  block.ratioH = r.h;
  block.ratioSrc = target;
  saveDraft();
  renderEditModalBody();
}

// 임베드 영상 비율. 주소를 넣으면 원본 비율을 자동으로 채우고,
// 자동 확인이 안 되는 경우에만 직접 넣을 수 있게 입력칸을 함께 둔다.
function buildEmbedRatioField(block) {
  const row = document.createElement("div");
  row.className = "block-controls-row";

  const label = document.createElement("span");
  label.className = "control-label";
  label.textContent = "영상 비율 (자동)";

  const w = document.createElement("input");
  w.type = "number";
  w.min = 1;
  w.className = "size-input";
  w.placeholder = "16";
  if (block.ratioW) w.value = block.ratioW;

  const times = document.createElement("span");
  times.className = "control-label";
  times.textContent = "×";

  const h = document.createElement("input");
  h.type = "number";
  h.min = 1;
  h.className = "size-input";
  h.placeholder = "9";
  if (block.ratioH) h.value = block.ratioH;

  const apply = () => {
    const wv = parseFloat(w.value);
    const hv = parseFloat(h.value);
    if (wv > 0 && hv > 0) {
      block.ratioW = wv;
      block.ratioH = hv;
    } else {
      delete block.ratioW;
      delete block.ratioH;
    }
    // 직접 넣은 값이 자동 감지에 덮이지 않도록 현재 주소에 귀속시킨다
    block.ratioSrc = block.src;
    saveDraft();
  };
  w.addEventListener("input", apply);
  h.addEventListener("input", apply);

  // 자동으로 알아낸 값이 마음에 안 들 때 16:9로 고정하는 버튼
  const reset = document.createElement("button");
  reset.className = "btn btn-outline btn-xs";
  reset.textContent = "16:9 고정";
  reset.addEventListener("click", () => {
    block.ratioW = 16;
    block.ratioH = 9;
    block.ratioSrc = block.src;
    saveDraft();
    renderEditModalBody();
  });

  const hint = document.createElement("span");
  hint.className = "block-hint";
  hint.style.marginTop = "0";
  hint.textContent = block.ratioW && block.ratioH
    ? `원본 비율 ${block.ratioW} × ${block.ratioH} 적용됨`
    : "주소를 넣으면 원본 비율을 자동으로 맞춰요";

  row.appendChild(label);
  row.appendChild(w);
  row.appendChild(times);
  row.appendChild(h);
  row.appendChild(reset);
  row.appendChild(hint);

  // 주소는 있는데 비율이 비어 있으면 원본에서 알아내 채운다
  autoFillEmbedRatio(block, hint);
  return row;
}

/* ----------------------- 텍스트 블록: 선택 영역 굵게 만들기 -----------------------
   contentEditable 안의 서식을 브라우저 명령(execCommand)에 맡기면 브라우저마다
   다른 태그가 생겨 저장 모양을 예측할 수 없다. 그래서 화면을 직접 읽어
   [{t,b}] 조각으로 바꾼 뒤, 글자 위치로 굵게를 칠하고 다시 그린다.
   드래그한 범위가 여러 조각에 걸쳐 있어도 결과가 항상 같다. */

// 굵게로 볼 요소인지 (b·strong 이거나 인라인 스타일로 굵게 지정된 경우)
function isBoldEl(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === "b" || tag === "strong") return true;
  const w = el.style.fontWeight;
  return w === "bold" || w === "bolder" || parseInt(w, 10) >= 600;
}

// 줄이 바뀌는 요소 — 저장할 때는 개행 한 칸으로 바꾼다
const LINE_TAGS = new Set(["div", "p", "li", "tr"]);

/* 편집 중인 요소를 훑어 조각 목록과 "글자 위치 ↔ 텍스트 노드" 대응표를 만든다.
   커서 위치를 글자 번호로 바꾸고, 다시 그린 뒤 되돌리는 데 쓴다. */
function scanRichText(root) {
  const runs = [];
  const marks = [];
  let len = 0;

  const push = (text, bold) => {
    if (!text) return;
    len += text.length;
    const last = runs[runs.length - 1];
    if (last && last.b === bold) last.t += text;
    else runs.push({ t: text, b: bold });
  };

  const walk = (node, bold) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === 3) {
        marks.push({ node: child, start: len });
        push(child.nodeValue, bold);
        return;
      }
      if (child.nodeType !== 1) return;
      const tag = child.tagName.toLowerCase();
      if (tag === "br") { push("\n", bold); return; }
      // 맨 앞 문단 앞에는 빈 줄을 만들지 않는다
      if (LINE_TAGS.has(tag) && len > 0) push("\n", bold);
      walk(child, bold || isBoldEl(child));
    });
  };

  walk(root, false);
  return { runs, marks, len };
}

// 커서·선택 지점을 글자 번호로 바꾼다
function charIndexOf(scan, node, offset) {
  if (node && node.nodeType === 3) {
    const mark = scan.marks.find((m) => m.node === node);
    if (mark) return mark.start + offset;
  }
  return null;
}

function runsPlainText(runs) {
  return runs.map((r) => r.t).join("");
}

// [from, to) 범위의 굵기를 bold로 바꾼 새 조각 목록
function setBoldRange(runs, from, to, bold) {
  const out = [];
  let pos = 0;
  runs.forEach((r) => {
    const start = pos;
    const end = pos + r.t.length;
    pos = end;
    // 범위와 겹치는 부분만 잘라 굵기를 바꾸고, 나머지는 그대로 둔다
    const cut = [
      [start, Math.min(end, Math.max(start, from)), r.b],
      [Math.min(end, Math.max(start, from)), Math.max(start, Math.min(end, to)), bold],
      [Math.max(start, Math.min(end, to)), end, r.b],
    ];
    cut.forEach(([a, b, weight]) => {
      if (b <= a) return;
      const text = r.t.slice(a - start, b - start);
      const last = out[out.length - 1];
      if (last && last.b === weight) last.t += text;
      else out.push({ t: text, b: weight });
    });
  });
  return out;
}

// 다시 그린 뒤 글자 번호로 선택을 되돌린다
function restoreSelection(root, from, to) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const spots = [];
  let len = 0;
  let node;
  while ((node = walker.nextNode())) {
    spots.push({ node, start: len });
    len += node.nodeValue.length;
  }
  const locate = (index) => {
    const i = Math.max(0, Math.min(len, index));
    for (let k = spots.length - 1; k >= 0; k--) {
      if (i >= spots[k].start) return { node: spots[k].node, offset: i - spots[k].start };
    }
    return spots.length ? { node: spots[0].node, offset: 0 } : null;
  };
  const a = locate(from);
  const b = locate(to);
  if (!a || !b) return;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/* 굵게 편집이 붙는 자리. 텍스트 블록과 개요 설명은 담는 키 이름만 다르므로
   읽고 쓰는 방법만 넘겨받아 같은 코드로 다룬다. */
function richSlot(obj, contentKey, runsKey) {
  return {
    read: () => ({ runs: obj[runsKey], content: obj[contentKey] }),
    write: (runs) => {
      obj[contentKey] = runsPlainText(runs);
      if (runs.some((r) => r.b)) obj[runsKey] = runs;
      else delete obj[runsKey];
    },
  };
}

// 편집 중인 화면 상태를 그대로 담는다 (굵기가 없으면 조각 기록은 지운다)
function storeRichText(el, slot) {
  slot.write(scanRichText(el).runs);
}

// "굵게" · "보통" 버튼이 하는 일
function applyWeightToSelection(el, slot, bold) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  if (range.collapsed || !el.contains(range.commonAncestorContainer)) return false;

  const scan = scanRichText(el);
  const from = charIndexOf(scan, range.startContainer, range.startOffset);
  const to = charIndexOf(scan, range.endContainer, range.endOffset);
  if (from == null || to == null || to <= from) return false;

  slot.write(setBoldRange(scan.runs, from, to, bold));
  fillTextRuns(el, slot.read());
  restoreSelection(el, from, to);
  saveDraft();
  return true;
}

/* "선택 글자 [굵게] [보통]" 버튼 한 쌍. 드래그로 고른 범위에만 적용된다. */
function buildWeightButtons(getEl, slot) {
  const frag = document.createDocumentFragment();
  const label = document.createElement("span");
  label.className = "control-label";
  label.textContent = "선택 글자";
  frag.appendChild(label);

  [["굵게", true, "weight-bold"], ["보통", false, "weight-normal"]].forEach(([text, bold, cls]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-outline btn-xs " + cls;
    b.textContent = text;
    b.title = "고칠 글자를 드래그해서 고른 뒤 누르세요";
    // 버튼을 누를 때 선택이 풀리지 않도록 기본 동작을 막는다
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      if (!applyWeightToSelection(getEl(), slot, bold)) {
        alert("바꿀 글자를 먼저 드래그해서 선택해 주세요.");
      }
    });
    frag.appendChild(b);
  });
  return frag;
}

/* --------------------- 블록 미리보기 (편집 목록 안에 함께 표시) --------------------- */

function renderPreviewBlockContent(project, block, blockIndex) {
  if (block.type === "text") {
    const p = document.createElement("p");
    p.className = "blk-text blk-text-edit";
    p.contentEditable = "true";
    p.spellcheck = false;
    p.dataset.placeholder = "여기에 바로 입력하세요";
    // 굵게가 섞인 글도 공개 화면과 같은 모양으로 그린다
    fillTextRuns(p, { runs: block.runs, content: block.content });
    applyTextStyle(p, block);

    // 입력할 때마다 다시 그리면 커서가 튀므로 화면을 읽어 값만 갱신한다
    const slot = richSlot(block, "content", "runs");
    p.addEventListener("input", () => {
      storeRichText(p, slot);
      saveDraft();
    });
    // 붙여넣기로 서식이 딸려 들어오지 않도록 글자만 넣는다
    p.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text/plain");
      document.execCommand("insertText", false, text);
    });

    // 크기·색상 조절이 이 요소에 바로 반영되도록 기억해둔다
    textPreviewNodes.set(block, p);
    return p;
  }

  if (block.type === "images") {
    const images = block.images || [];
    const imgGroup = `pvimgs-${project.id}-${blockIndex}`;
    let div;
    // 블록별 "이미지 간격"이 우선, 없으면 프로젝트의 "콘텐츠 간격"을 따른다
    const ownGap = normalizeGap(block.gap);
    const gap = ownGap != null ? ownGap : normalizeGap(project.blockGap);
    if (block.layout === "slider") {
      div = document.createElement("div");
      div.className = "pv-slider-strip";
    } else if (block.layout === "grid") {
      div = document.createElement("div");
      div.className = gridClassName(block);
      if (gap != null) {
        if (block.grid === "masonry") div.style.columnGap = gap + "px";
        else div.style.gap = gap + "px";
      }
    } else {
      div = document.createElement("div");
      div.className = "blk-images-single";
      if (gap != null) div.style.gap = gap + "px";
    }

    images.forEach((src, j) => {
      const w = document.createElement("div");
      w.className = "pv-img-wrap";
      // 모자이크(컬럼) 레이아웃의 세로 간격은 margin-bottom으로 정해진다
      if (block.layout === "grid" && block.grid === "masonry" && gap != null) {
        w.style.marginBottom = gap + "px";
      }
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.draggable = false;
      setImgLoading(img, false);
      w.appendChild(img);

      const h = document.createElement("button");
      h.type = "button";
      h.className = "drag-handle-mini";
      h.title = "드래그해서 이미지 순서 변경";
      h.textContent = "⠿";
      w.appendChild(h);

      // 사진 위에 올리면 그 자리에서 바로 갈아끼우거나 뺄 수 있다
      const actions = document.createElement("div");
      actions.className = "pv-img-actions";
      actions.appendChild(makeImageReplaceBtn((dataUrl) => {
        block.images[j] = dataUrl;
        saveDraft();
        renderEditModalBody();
      }));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "img-action img-remove";
      remove.title = "이 이미지만 빼기";
      remove.textContent = "✕";
      remove.addEventListener("click", (e) => {
        e.stopPropagation();
        block.images.splice(j, 1);
        saveDraft();
        renderEditModalBody();
      });
      actions.appendChild(remove);
      w.appendChild(actions);

      attachDrag(w, h, imgGroup, block.images, j);
      div.appendChild(w);
    });

    // 빈 칸을 실제 칸 모양 그대로 놓아, 고른 배열이 눈에 보이고 그 자리에 바로 올릴 수 있게 한다
    emptySlotCount(block).forEach(() => {
      div.appendChild(makeImageSlot((added) => {
        block.images = (block.images || []).concat(added);
        saveDraft();
        renderEditModalBody();
      }));
    });

    if (block.layout === "slider") {
      const outer = document.createElement("div");
      outer.appendChild(div);
      const hint = document.createElement("div");
      hint.className = "block-hint";
      hint.textContent = "실제 사이트에서는 한 장씩 자동으로 넘어가요. (여기서는 가로로 펼쳐서 순서 조절)";
      outer.appendChild(hint);
      return outer;
    }
    return div;
  }

  if (block.type === "embed") {
    const div = document.createElement("div");
    div.className = "blk-embed";
    if (!block.src) {
      div.className = "block-hint";
      div.textContent = "(링크가 없는 임베드 블록)";
      return div;
    }
    // 실제 사이트와 같은 판별·변환 로직을 공용 함수로 사용.
    // 재생바·클릭은 여기서는 늘 꺼 둔다 — 블록을 드래그해서 순서를 바꿀 때
    // 영상 컨트롤과 손이 겹치지 않게 하기 위해서다 (실제 사이트에는 안 걸림).
    if (isVideoFile(block.src)) {
      const v = document.createElement("video");
      v.src = block.src;
      const autoplayOn = block.videoAutoplay !== false;
      v.controls = false;
      v.autoplay = autoplayOn;
      v.muted = autoplayOn || block.videoMuted !== false;
      v.loop = block.videoLoop !== false;
      v.style.pointerEvents = "none";
      div.appendChild(v);
    } else {
      const iframe = document.createElement("iframe");
      iframe.src = toEmbedUrl(block.src) || block.src;
      iframe.style.pointerEvents = "none"; // 드래그 방해 방지
      applyEmbedRatio(iframe, block);
      div.appendChild(iframe);
    }
    return div;
  }

  return document.createElement("div");
}

// 켜고 끄는 체크박스 한 칸 (업로드한 영상의 자동재생·반복·음소거·재생바 등)
function buildToggleField(labelText, getVal, setVal, onApply) {
  const wrap = document.createElement("label");
  wrap.className = "toggle-field";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = !!getVal();
  input.addEventListener("change", () => {
    setVal(input.checked);
    saveDraft();
    if (onApply) onApply(input.checked);
  });

  const text = document.createElement("span");
  text.className = "control-label";
  text.textContent = labelText;

  wrap.appendChild(input);
  wrap.appendChild(text);
  return wrap;
}

// 썸네일 줄 안에 함께 놓이는 "＋ 추가" 타일. 버튼이 따로 한 줄을 차지하지 않는다.
function makeUploadTile(text, { multiple = false, accept = "image/*" } = {}, onFiles) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "thumb-add file-btn";

  const plus = document.createElement("span");
  plus.className = "thumb-add-plus";
  plus.textContent = "＋";
  const label = document.createElement("span");
  label.className = "thumb-add-text";
  label.textContent = text;
  tile.appendChild(plus);
  tile.appendChild(label);

  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  if (multiple) input.multiple = true;
  input.addEventListener("change", (e) => onFiles(Array.from(e.target.files || [])));
  tile.appendChild(input);
  return tile;
}

function makeThumb(src, kind, onRemove) {
  const thumb = document.createElement("div");
  thumb.className = "thumb";
  const media = kind === "image" ? document.createElement("img") : document.createElement("video");
  media.src = src;
  media.draggable = false;
  if (kind === "image") setImgLoading(media, false);
  thumb.appendChild(media);
  const removeBtn = document.createElement("button");
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", onRemove);
  thumb.appendChild(removeBtn);
  return thumb;
}

/* 미리보기에 함께 놓을 빈 칸 개수.
   그리드는 남은 칸을 채워 배열이 한눈에 보이게 하고(비어 있으면 한 줄 전체),
   줄이 딱 맞으면 다음 칸 하나만 둔다. 단일·슬라이드·모자이크는 하나면 충분하다. */
function emptySlotCount(block) {
  const n = (block.images || []).length;
  let slots = 1;
  if (block.layout === "grid" && block.grid !== "masonry") {
    const cols = parseInt(block.grid, 10) || 3;
    const rest = n % cols;
    slots = rest === 0 ? (n === 0 ? cols : 1) : cols - rest;
  }
  return new Array(slots).fill(0);
}

// 이미지가 들어갈 빈 칸. 눌러서 그 자리에 바로 올린다.
function makeImageSlot(onImages) {
  const slot = document.createElement("button");
  slot.type = "button";
  slot.className = "img-slot file-btn";
  slot.title = "이 칸에 이미지 올리기";

  const plus = document.createElement("span");
  plus.className = "img-slot-plus";
  plus.textContent = "＋";
  const text = document.createElement("span");
  text.className = "img-slot-text";
  text.textContent = "이미지 추가";
  slot.appendChild(plus);
  slot.appendChild(text);

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    Promise.all(files.map(readFileAsDataURL)).then(onImages);
  });
  slot.appendChild(input);
  return slot;
}

// 사진 위에 겹쳐 두는 "교체" 버튼. 평소에는 숨어 있다가 마우스를 올리면 나타난다.
function makeImageReplaceBtn(onImage) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "img-action img-replace file-btn";
  btn.title = "다른 이미지로 교체";
  btn.appendChild(document.createTextNode("교체"));

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", (e) => {
    const file = (e.target.files || [])[0];
    if (file) readFileAsDataURL(file).then(onImage);
  });
  btn.appendChild(input);
  return btn;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderAll() {
  applyLayoutVars(data && data.profile);
  if (!data) return;
  data = ensureShape(data);
  renderSiteHeader();
  renderTabs();
  renderSections();
  updateActiveTab();
}

/* ------------------- 지금 어느 부분을 수정 중인지 표시 ------------------- */

// 입력창에서 가장 가까운 라벨 텍스트를 찾는다.
// .field 안이면 그 라벨, 아니면(편집 팝업/프로필처럼 라벨→컨트롤이 평평하게 붙는 구조)
// 컨테이너 직계 조상에서부터 앞쪽 형제를 거슬러 올라가며 처음 만나는 라벨을 쓴다.
function findNearestLabel(target) {
  // "카드 설명 (목록 화면 제목 아래 표시…)" 같은 괄호 부연설명은 칩에서는 생략
  const clean = (t) => t.trim().replace(/\s*\([^)]*\)\s*$/, "");
  const field = target.closest(".field");
  if (field) {
    const l = field.querySelector("label");
    if (l) return clean(l.textContent);
  }
  const scope = target.closest("#projectEditBody");
  if (!scope) return null;
  let node = target;
  while (node && node.parentElement && node.parentElement !== scope) node = node.parentElement;
  while (node) {
    if (node.matches && node.matches("label")) return clean(node.textContent);
    node = node.previousElementSibling;
  }
  return null;
}

// 포커스된 입력창이 문서 어디에 속하는지 "카테고리 › 프로젝트 › 블록" 식으로 설명한다.
function describeEditingTarget(target) {
  if (!target || !target.closest) return null;
  if (!target.closest("#projectEditBody") || !editingContext) return null;
  const parts = [];

  // 프로필 편집 팝업
  if (editingContext.type === "profile") {
    parts.push("프로필 & 연락처");
    const lbl = findNearestLabel(target);
    if (lbl) parts.push(lbl);
    return parts;
  }

  // 카테고리 설정 팝업
  if (editingContext.type === "category") {
    parts.push((editingContext.copy.name || "카테고리") + " 설정");
    const lbl = findNearestLabel(target);
    if (lbl) parts.push(lbl);
    return parts;
  }

  // 프로젝트 편집 팝업
  parts.push(editingContext.cat.name || "카테고리");
  parts.push(editingContext.project.title || "(제목 없음)");
  const blockItem = target.closest(".block-item");
  const pvBlock = target.closest(".pv-block");
  if (blockItem) {
    const siblings = Array.from(blockItem.parentElement.querySelectorAll(":scope > .block-item"));
    const idx = siblings.indexOf(blockItem);
    const lbl = blockItem.querySelector(".block-type-label");
    parts.push(`블록 ${idx + 1}${lbl ? " (" + lbl.textContent.trim() + ")" : ""}`);
  } else if (pvBlock) {
    const lbl = pvBlock.querySelector(".pv-chip");
    if (lbl) parts.push(lbl.textContent.trim());
  } else if (target.closest(".project-card-head")) {
    parts.push("프로젝트 제목");
  } else {
    const lbl = findNearestLabel(target);
    if (lbl) parts.push(lbl);
  }
  return parts;
}

function showEditingIndicator(target) {
  const chip = document.getElementById("editingIndicator");
  if (!chip) return;
  const parts = describeEditingTarget(target);
  if (!parts || !parts.length) {
    chip.classList.remove("visible");
    return;
  }
  chip.innerHTML = "";
  const dot = document.createElement("span");
  dot.className = "ei-dot";
  const text = document.createElement("span");
  text.className = "ei-text";
  text.textContent = "수정 중 · " + parts.join(" › ");
  chip.appendChild(dot);
  chip.appendChild(text);
  chip.classList.add("visible");
}

document.addEventListener("focusin", (e) => {
  const t = e.target;
  if (!t.matches || !t.matches("input, textarea, select")) return;
  if (t.type === "file") return;
  showEditingIndicator(t);
});

document.addEventListener("focusout", () => {
  // 버튼 클릭 등으로 포커스가 잠깐 이동할 때 칩이 깜빡이지 않도록 약간 기다렸다 숨긴다
  setTimeout(() => {
    const a = document.activeElement;
    const stillEditing =
      a && a.matches && a.matches("input, textarea, select") && a.type !== "file";
    if (!stillEditing) {
      const chip = document.getElementById("editingIndicator");
      if (chip) chip.classList.remove("visible");
    }
  }, 150);
});

/* ---------------------------------- Top actions ---------------------------------- */

document.getElementById("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      data = JSON.parse(reader.result);
      saveDraft();
      renderAll();
    } catch (err) {
      alert("JSON 파일을 읽는 중 오류가 발생했어요.");
    }
  };
  reader.readAsText(file);
});

document.getElementById("resetBtn").addEventListener("click", async () => {
  if (!confirm("임시 저장된 수정 내용을 지우고 원본 data.json을 다시 불러올까요?")) return;
  localStorage.removeItem(DRAFT_KEY);
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    if (!res.ok) throw new Error("fetch failed");
    data = await res.json();
    renderAll();
    document.getElementById("autosaveStatus").textContent = "원본을 다시 불러왔어요.";
  } catch (e) {
    data = null;
    showLoadFailure();
  }
});

document.getElementById("previewBtn").addEventListener("click", () => {
  if (!data) {
    alert("먼저 상단 \"불러오기(json)\" 버튼으로 data.json을 불러온 뒤 미리보기 해주세요.");
    return;
  }
  saveDraft();
  window.open("index.html?preview=1", "_blank");
});

document.getElementById("exportBtn").addEventListener("click", () => {
  if (!data) {
    alert("먼저 상단 \"불러오기(json)\" 버튼으로 data.json을 불러온 뒤 내보내기 해주세요.");
    return;
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "data.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById("profileEditBtn").addEventListener("click", () => {
  if (!data) {
    alert("먼저 상단 \"불러오기(json)\" 버튼으로 data.json을 불러온 뒤 편집해주세요.");
    return;
  }
  toggleProfileEditor();
});

document.getElementById("profileSaveBtn").addEventListener("click", saveModalAndPublish);
document.getElementById("profileCloseBtn").addEventListener("click", () => closeProjectEditor());

document.getElementById("projectEditClose").addEventListener("click", () => closeProjectEditor());
document.getElementById("projectEditSave").addEventListener("click", saveModalAndPublish);
document.getElementById("projectEditOverlay").addEventListener("click", (e) => {
  if (e.target.id === "projectEditOverlay") closeProjectEditor();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editingContext) closeProjectEditor();
});

/* ---------------------------------- GitHub 자동 배포 ---------------------------------- */

const GH_OWNER = "bananapallete";
const GH_REPO = "portfolio";
const GH_BRANCH = "main";
const GH_TOKEN_KEY = "portfolioGithubToken";

const MIME_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

function setPublishStatus(text) {
  document.getElementById("autosaveStatus").textContent = text;
  // 편집 팝업이 열려 있으면 진행 상황을 팝업 상단에도 보여준다 (헤더는 오버레이에 가려짐)
  const m = document.getElementById("modalSaveState");
  if (m && editingContext) {
    m.textContent = text;
    m.classList.add("visible");
  }
}

/* 토큰 보관함. localStorage가 막히면 sessionStorage, 그것도 막히면 이 탭의
   메모리까지 차례로 내려간다. 어느 단계든 남아 있으면 다시 묻지 않는다. */
let memoryToken = null;

// 왜 토큰이 사라졌는지 남겨 두고, 다음에 물어볼 때 이유를 먼저 알려준다
const GH_TOKEN_GONE_KEY = "portfolioGithubTokenGone";

// 브라우저 설정에 따라 접근 자체가 예외를 던지므로 감싸서 쓴다
function safeStore(kind) {
  try {
    return window[kind] || null;
  } catch (e) {
    return null;
  }
}

function eachStore(fn) {
  ["localStorage", "sessionStorage"].forEach((kind) => {
    const store = safeStore(kind);
    if (!store) return;
    try { fn(store); } catch (e) {}
  });
}

function readStoredToken() {
  let found = null;
  eachStore((store) => { found = found || store.getItem(GH_TOKEN_KEY); });
  return found || memoryToken;
}

function storeToken(token) {
  memoryToken = token;
  let saved = false;
  eachStore((store) => {
    store.setItem(GH_TOKEN_KEY, token);
    store.removeItem(GH_TOKEN_GONE_KEY);
    saved = true;
  });
  refreshTokenButton();
  return saved;
}

function forgetToken(reason) {
  memoryToken = null;
  eachStore((store) => {
    store.removeItem(GH_TOKEN_KEY);
    if (reason) store.setItem(GH_TOKEN_GONE_KEY, reason);
  });
  refreshTokenButton();
}

/* 토큰이 저장돼 있는지 버튼에 그대로 드러낸다.
   발행 버튼을 누르고 나서야 없다는 걸 알게 되지 않도록. */
function refreshTokenButton() {
  const btn = document.getElementById("tokenBtn");
  if (!btn) return;
  const has = !!readStoredToken();
  btn.textContent = has ? "GitHub 토큰 · 저장됨" : "GitHub 토큰 · 없음";
  btn.title = has
    ? "토큰이 이 브라우저에 저장돼 있어요. 눌러서 다시 입력할 수 있어요."
    : "발행하려면 토큰이 필요해요. 눌러서 입력해주세요.";
  // 메뉴를 열지 않아도 알 수 있도록 "더보기" 버튼에 표시를 남긴다
  const more = document.getElementById("moreBtn");
  if (more) {
    more.classList.toggle("has-alert", !has);
    more.title = has ? "파일·토큰·잠금" : "GitHub 토큰이 없어요 · 파일·토큰·잠금";
  }
}

/* -------------------------- "더보기" 메뉴 여닫기 --------------------------
   가끔 쓰는 항목(토큰·파일·잠금)을 한 곳에 모아 두었다.
   바깥을 누르거나 Esc를 누르면 닫히고, 항목을 고르면 바로 닫힌다. */
function initMoreMenu() {
  const btn = document.getElementById("moreBtn");
  const menu = document.getElementById("moreMenu");
  if (!btn || !menu) return;

  const setOpen = (open) => {
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.classList.toggle("menu-open", open);
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(menu.hidden);
  });

  // 항목을 고르면 닫는다. 파일 고르기는 창이 뜨는 사이 닫혀도 동작에 지장이 없다.
  menu.addEventListener("click", (e) => {
    if (e.target.closest(".menu-item")) setOpen(false);
  });

  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      setOpen(false);
      btn.focus();
    }
  });
}

initMoreMenu();

/* 페이지 안 입력창으로 토큰을 받는다. 취소하면 null.
   prompt()는 임베드 브라우저 등에서 막혀 아무것도 안 뜨는 경우가 있어 쓰지 않는다. */
function askGithubToken() {
  return new Promise((resolve) => {
    const overlay = document.getElementById("tokenOverlay");
    const form = document.getElementById("tokenForm");
    const input = document.getElementById("tokenInput");
    const msg = document.getElementById("tokenMsg");

    // 토큰이 지워진 이유(예: 401로 거부됨)가 있으면 위에 띄워준다
    let why = "";
    eachStore((store) => { why = why || store.getItem(GH_TOKEN_GONE_KEY) || ""; });
    msg.textContent = why || "";
    msg.hidden = !why;

    input.value = "";
    overlay.classList.remove("hidden");
    input.focus();

    const close = (value) => {
      overlay.classList.add("hidden");
      form.removeEventListener("submit", onSubmit);
      document.getElementById("tokenCancel").removeEventListener("click", onCancel);
      document.getElementById("tokenCancel2").removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      resolve(value);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      close(v || null);
    };
    const onCancel = () => close(null);
    const onBackdrop = (e) => { if (e.target === overlay) close(null); };
    const onKey = (e) => { if (e.key === "Escape") close(null); };

    form.addEventListener("submit", onSubmit);
    document.getElementById("tokenCancel").addEventListener("click", onCancel);
    document.getElementById("tokenCancel2").addEventListener("click", onCancel);
    overlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
  });
}

async function getGithubToken(forceAsk = false) {
  const saved = readStoredToken();
  if (saved && !forceAsk) return saved;

  const token = await askGithubToken();
  if (!token) return null;
  if (!storeToken(token)) {
    setPublishStatus(
      "토큰을 브라우저에 저장하지 못했어요. 이 탭에서는 계속 쓸 수 있지만, " +
        "탭을 닫으면 다시 입력해야 해요."
    );
  }
  return token;
}

async function ghRequest(path, token, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/${path}`, {
    ...options,
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    // 토큰 자체가 잘못된 경우에만 지운다 (왜 지웠는지 남겨 다음 안내에 쓴다)
    forgetToken("⚠️ 이전 토큰을 GitHub이 거부해서(401) 지웠어요. 새로 발급받은 토큰을 넣어주세요.");
    throw new Error("토큰이 만료되었거나 잘못됐어요. \"사이트에 반영\"을 다시 눌러 새 토큰을 입력해주세요.");
  }
  if (res.status === 403) {
    // 권한 부족·rate limit 등 — 토큰은 멀쩡하므로 지우지 않는다
    throw new Error(
      "GitHub이 요청을 거부했어요(403). 토큰의 'repo' 권한이 있는지, 잠시 뒤 다시 시도해보세요."
    );
  }
  return res;
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], base64: m[2] };
}

async function hashBase64(base64) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(base64));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 20);
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/* GitHub에 파일 하나를 올린다.

   방금 커밋한 직후 같은 브랜치에 또 쓰면, 갱신이 아직 다 퍼지지 않아
   409(충돌)가 돌아올 때가 있다. 이미지·영상을 올리고 몇 초 뒤 바로
   data.json을 쓰는 우리 순서에서 특히 걸린다.
   그럴 때는 파일 상태를 다시 읽어 잠깐 기다렸다 다시 보낸다 —
   "사이트에 반영"을 한 번 더 누르는 것과 같은 일을 대신 해 주는 것이다.

   withSha: 이미 있는 파일을 덮어쓸 때는 현재 상태를 함께 보내야 한다.
            재시도마다 다시 읽어야 낡은 값으로 또 부딪치지 않는다. */
async function putFile(path, token, message, base64, withSha) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let put = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const body = { message, content: base64, branch: GH_BRANCH };
    if (withSha) {
      const cur = await ghRequest(`contents/${path}?ref=${GH_BRANCH}`, token);
      if (cur.status === 200) body.sha = (await cur.json()).sha;
    }

    put = await ghRequest(`contents/${path}`, token, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (put.ok || put.status !== 409) return put;

    if (attempt === 0) setPublishStatus("GitHub이 아직 정리 중이라 잠시 뒤 다시 시도해요…");
    await wait(800 * (attempt + 1));
  }
  return put;
}

// data: URL을 저장소의 assets/ 파일로 올리고 경로를 돌려준다.
// 같은 내용은 같은 파일명이 되므로 이미 올라간 파일은 건너뛴다.
async function uploadAssetIfNeeded(dataUrl, token) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return dataUrl;

  const approxBytes = parsed.base64.length * 0.75;
  if (approxBytes > 95 * 1024 * 1024) {
    throw new Error("95MB가 넘는 파일은 GitHub에 올릴 수 없어요. 큰 영상은 유튜브/비메오 링크를 사용해주세요.");
  }

  const hash = await hashBase64(parsed.base64);
  const ext = MIME_EXT[parsed.mime] || (parsed.mime.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "");
  const path = `assets/${hash}.${ext}`;

  const check = await ghRequest(`contents/${path}?ref=${GH_BRANCH}`, token);
  if (check.status !== 404) return path; // 이미 업로드된 파일

  // 새 파일이라 덮어쓸 상태가 없다 (같은 내용은 같은 이름이라 위에서 걸러진다)
  const put = await putFile(path, token, `assets: ${path} 업로드 (관리자 페이지)`, parsed.base64, false);
  if (!put.ok) throw new Error(`파일 업로드 실패 (GitHub 응답 ${put.status})`);
  return path;
}

// data 안에서 아직 업로드되지 않은(data:로 시작하는) 이미지/영상 목록을 모은다.
function collectPendingMedia() {
  const refs = [];
  (data.categories || []).forEach((cat) => {
    (cat.projects || []).forEach((p) => {
      if (p.coverImage && p.coverImage.startsWith("data:")) {
        refs.push({ get: () => p.coverImage, set: (v) => { p.coverImage = v; } });
      }
      (p.blocks || []).forEach((block) => {
        if (block.type === "images") {
          (block.images || []).forEach((src, i) => {
            if (src && src.startsWith("data:")) {
              refs.push({ get: () => block.images[i], set: (v) => { block.images[i] = v; } });
            }
          });
        }
        if (block.type === "embed" && block.src && block.src.startsWith("data:")) {
          refs.push({ get: () => block.src, set: (v) => { block.src = v; } });
        }
      });
    });
  });
  return refs;
}

// 성공하면 true, 실패·중단하면 false를 돌려준다
async function publishToGithub() {
  if (!data) {
    alert("먼저 상단 \"불러오기(json)\" 버튼으로 data.json을 불러온 뒤 반영해주세요.");
    return false;
  }
  const token = await getGithubToken();
  if (!token) return false;

  const btns = [
    document.getElementById("publishBtn"),
    document.getElementById("projectEditSave"),
  ].filter(Boolean);
  btns.forEach((b) => { b.disabled = true; });
  try {
    // 1) 새로 추가된 이미지/영상을 assets/ 폴더에 업로드
    const refs = collectPendingMedia();
    for (let i = 0; i < refs.length; i++) {
      setPublishStatus(`이미지/영상 업로드 중… (${i + 1}/${refs.length})`);
      const newPath = await uploadAssetIfNeeded(refs[i].get(), token);
      refs[i].set(newPath);
      saveDraft();
    }

    // 2) data.json 커밋
    setPublishStatus("data.json 반영 중…");
    const put = await putFile(
      "data.json",
      token,
      "content: 관리자 페이지에서 콘텐츠 업데이트",
      utf8ToBase64(JSON.stringify(data, null, 2)),
      true
    );
    if (!put.ok) {
      throw new Error(
        put.status === 409
          ? "data.json 반영 실패 — 저장소가 방금 다른 곳에서도 바뀐 것 같아요.\n" +
            "잠시 뒤 \"사이트에 반영\"을 다시 눌러주세요. (GitHub 응답 409)"
          : `data.json 반영 실패 (GitHub 응답 ${put.status})`
      );
    }

    setPublishStatus("✅ 배포 완료! 1~2분 뒤 실제 사이트에 반영돼요.");
    alert("배포 완료!\n\nGitHub Pages가 사이트를 다시 빌드하는 데 1~2분 걸려요.\n잠시 후 사이트를 새로고침해서 확인해주세요.");
    return true;
  } catch (e) {
    setPublishStatus("⚠️ 배포 실패: " + e.message);
    alert("배포에 실패했어요.\n\n" + e.message);
    return false;
  } finally {
    btns.forEach((b) => { b.disabled = false; });
  }
}

document.getElementById("publishBtn").addEventListener("click", publishToGithub);
document.getElementById("tokenBtn").addEventListener("click", async () => {
  const had = !!readStoredToken();
  if (await getGithubToken(true)) {
    setPublishStatus("토큰을 저장했어요. 이제 \"사이트에 반영\"을 누르면 배포됩니다.");
  } else if (had) {
    setPublishStatus("토큰 입력을 취소했어요. 기존 토큰은 그대로 남아 있어요.");
  }
});

document.getElementById("lockBtn").addEventListener("click", () => {
  if (confirm("이 브라우저의 잠금을 다시 걸까요? 다음에 열 때 비밀번호를 물어봐요.")) lockAdmin();
});

/* ---------------------------------- Init ---------------------------------- */

refreshTokenButton();

// 비밀번호를 통과하기 전에는 데이터를 읽지도, 화면을 그리지도 않는다
window.adminGateReady.then(loadInitial).then(({ data: initial, source, server }) => {
  if (source === "none") {
    data = null;
    showLoadFailure();
    return;
  }
  data = initial;
  renderAll();
  document.getElementById("autosaveStatus").textContent =
    source === "draft" ? "이전 임시저장 내용을 불러왔어요." : "data.json을 불러왔어요.";
  if (source === "draft") checkStaleDraft(server);
});
