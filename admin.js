/* ==========================================================================
   Unlimit_Cho Portfolio — Admin editor logic
   ========================================================================== */

const DRAFT_KEY = "portfolioDraftData";
const RECENT_COLORS_KEY = "portfolioRecentColors";
const DEFAULT_COLORS = ["#f5f4f0", "#ff4d6d", "#6c5ce7", "#00c2a8", "#ffc93c", "#14121a"];
let data = null;

// 미리보기·순서 조절 모드인 프로젝트 id 목록
const previewProjects = new Set();
// 현재 드래그 중인 항목 정보 { group, list, from }
let dragCtx = null;
// 편집 팝업이 열려 있는 대상. type: "project" | "profile" | "category"
// 편집은 복사본에서 이루어지고 "저장 · 사이트에 반영"을 눌러야 실제 데이터에 반영된다
let editingContext = null;
// 탭 내비게이션(activeCatId · scrollToCategory · updateActiveTab · makeTab)은 blocks.js 공용

// "간격 ___ px [기본값]" 형태의 조절 필드. 빈 값이면 기본값(CSS 지정) 사용.
// getVal/setVal로 데이터에 읽고 쓰고, onApply(gap|null)로 즉시 반영한다.
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
function checkStaleDraft(server) {
  const banner = document.getElementById("staleBanner");
  if (!banner || !server || !data) return;
  if (JSON.stringify(data) === JSON.stringify(server)) return;

  const count = (d) => (d.categories || []).reduce((n, c) => n + (c.projects || []).length, 0);
  document.getElementById("staleMsg").innerHTML =
    `⚠️ 지금 화면은 브라우저에 남아 있던 <strong>임시저장 내용</strong>이고, ` +
    `사이트에 올라간 내용과 달라요. ` +
    `(임시저장 프로젝트 ${count(data)}개 / 사이트 ${count(server)}개)<br/>` +
    `이대로 "사이트에 반영"을 누르면 사이트 쪽 내용이 임시저장 내용으로 덮어써집니다.`;
  banner.hidden = false;

  document.getElementById("staleUseServer").addEventListener("click", () => {
    localStorage.removeItem(DRAFT_KEY);
    data = server;
    renderAll();
    banner.hidden = true;
    document.getElementById("autosaveStatus").textContent = "사이트에 올라간 내용을 불러왔어요.";
  });
  document.getElementById("staleKeepDraft").addEventListener("click", () => {
    banner.hidden = true;
  });
}

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

function ensureShape() {
  if (!data) {
    data = { profile: {}, categories: [] };
  }
  data.profile = data.profile || {};
  data.profile.contact = data.profile.contact || {};
  data.profile.contact.emails = data.profile.contact.emails || [];
  if (data.profile.heroDim == null) data.profile.heroDim = 0.5;
  data.categories = data.categories || [];
  // 구버전: 프로젝트별 titleWeight가 있으면 전역 설정으로 승격 후 제거
  if (!data.profile.projectTitleWeight) {
    for (const c of data.categories) {
      const found = (c.projects || []).find((p) => p.titleWeight);
      if (found) { data.profile.projectTitleWeight = found.titleWeight; break; }
    }
  }
  (data.categories || []).forEach((c) => (c.projects || []).forEach((p) => { delete p.titleWeight; }));
  data.categories.forEach((cat) => {
    cat.projects = cat.projects || [];
    cat.accent = cat.accent || "#6c5ce7";
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
    // 놓아도 순서가 그대로인 자리(집어 든 카드의 양옆)에는 표시하지 않는다
    if (to === dragCtx.from || to === dragCtx.from + 1) return;
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
    const from = dragCtx.from;
    const { to } = dropTargetAt(itemEl, index, e);
    dragCtx = null;
    clearDropMarkers();
    // 원래 자리를 빼내면 뒤쪽 인덱스가 하나씩 당겨진다
    const target = to > from ? to - 1 : to;
    if (target === from) return;
    const [moved] = list.splice(from, 1);
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

  const row1 = document.createElement("div");
  row1.className = "field-row";

  row1.appendChild(makeTextField("이름", profile.name, (v) => { profile.name = v; saveDraft(); }));
  row1.appendChild(makeTextField("닉네임", profile.nickname, (v) => { profile.nickname = v; saveDraft(); }));
  row1.appendChild(makeTextField("역할/타이틀", profile.role, (v) => { profile.role = v; saveDraft(); }));
  wrap.appendChild(row1);

  const row2 = document.createElement("div");
  row2.className = "field-row";
  const taglineField = document.createElement("div");
  taglineField.className = "field";
  taglineField.style.gridColumn = "1 / -1";
  const label = document.createElement("label");
  label.textContent = "소개 문구(태그라인)";
  const ta = document.createElement("textarea");
  ta.value = profile.tagline || "";
  ta.rows = 2;
  ta.addEventListener("input", () => { profile.tagline = ta.value; saveDraft(); });
  taglineField.appendChild(label);
  taglineField.appendChild(ta);
  row2.appendChild(taglineField);
  wrap.appendChild(row2);

  const row3 = document.createElement("div");
  row3.className = "field-row";
  row3.appendChild(makeTextField("전화번호", profile.contact.phone, (v) => { profile.contact.phone = v; saveDraft(); }));

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
    saveDraft();
  });
  emailField.appendChild(emailLabel);
  emailField.appendChild(emailTa);
  row3.appendChild(emailField);

  wrap.appendChild(row3);

  // ---- 프로젝트명 폰트 두께 (모든 프로젝트 일괄 적용) ----
  const twLabel = document.createElement("label");
  twLabel.textContent = "프로젝트명 폰트 두께 (모든 프로젝트 상세 페이지에 일괄 적용)";
  twLabel.className = "mini-label";
  twLabel.style.marginTop = "18px";
  wrap.appendChild(twLabel);

  const twSeg = document.createElement("div");
  twSeg.className = "layout-seg";
  [["400", "Regular"], ["500", "Medium"], ["600", "SemiBold"], ["700", "Bold"], ["800", "ExtraBold"], ["900", "Black"]].forEach(([value, text]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (String(profile.projectTitleWeight || "900") === value) b.classList.add("active");
    b.addEventListener("click", () => {
      profile.projectTitleWeight = value;
      saveDraft();
      renderEditModalBody();
    });
    twSeg.appendChild(b);
  });
  wrap.appendChild(twSeg);

  // ---- 홈 화면 프로젝트 영역 배경색 ----
  const workBgLabel = document.createElement("label");
  workBgLabel.textContent = "홈 화면 프로젝트 영역 배경색";
  workBgLabel.className = "mini-label";
  workBgLabel.style.marginTop = "18px";
  wrap.appendChild(workBgLabel);

  const workBgRow = document.createElement("div");
  workBgRow.className = "block-controls-row";
  const workBgField = buildColorField(
    profile.workBg || "#0d0d0d",
    (v) => { profile.workBg = v; saveDraft(); },
    { swatches: true, rerender: renderEditModalBody }
  );
  workBgRow.appendChild(workBgField.field);

  const workBgClear = document.createElement("button");
  workBgClear.className = "btn btn-outline btn-small";
  workBgClear.textContent = "기본값";
  workBgClear.addEventListener("click", () => {
    delete profile.workBg;
    saveDraft();
    renderEditModalBody();
  });
  workBgRow.appendChild(workBgClear);
  wrap.appendChild(workBgRow);
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

function renderSiteHeader() {
  const p = data.profile || {};
  document.getElementById("brandName").textContent = p.nickname || p.name || "Portfolio";
  document.getElementById("brandRole").textContent = p.role || "";
  document.getElementById("footerName").textContent = p.name || p.nickname || "";

  const work = document.querySelector(".work");
  if (work) work.style.background = p.workBg || "";

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
      accent: "#6c5ce7",
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
// 관리자 전용으로 섹션 머리의 "✎ 설정" 버튼과 "+ 프로젝트 추가" 카드가 붙는다.
function renderSections() {
  const wrap = document.getElementById("workSections");
  wrap.innerHTML = "";

  (data.categories || []).forEach((cat) => {
    const section = document.createElement("section");
    section.className = "work-section";
    section.id = `cat-${cat.id}`;
    section.dataset.catId = cat.id;

    const head = document.createElement("div");
    head.className = "work-section-head";
    const headInner = document.createElement("div");
    headInner.className = "container";
    const h2 = document.createElement("h2");
    h2.textContent = cat.name || "(이름 없음)";
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-outline btn-small ws-edit";
    editBtn.textContent = "✎ 설정";
    editBtn.title = "카테고리 이름·색상·삭제";
    editBtn.addEventListener("click", () => openCategoryEditor(cat));
    headInner.appendChild(h2);
    headInner.appendChild(editBtn);
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
    grid.appendChild(addCard);

    section.appendChild(grid);
    wrap.appendChild(section);
  });

  if (!(data.categories || []).length) {
    wrap.innerHTML = `<div class="empty-state">아직 카테고리가 없어요. 탭의 ＋ 버튼으로 추가해보세요.</div>`;
  }
}

// 공개 사이트와 같은 카드 + 관리자용 삭제/드래그 핸들. 클릭하면 편집 팝업.
function renderAdminCard(cat, project, projIndex) {
  const card = document.createElement("div");
  card.className = "card admin-card";
  card.addEventListener("click", () => openProjectEditor(cat, project, projIndex));

  const media = document.createElement("div");
  media.className = "card-media";
  if (project.coverImage) {
    const img = document.createElement("img");
    img.src = project.coverImage;
    img.alt = project.title || "";
    setImgLoading(img, false);
    media.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className = "card-empty-title";
    ph.textContent = `${project.title || "(제목 없음)"} · 커버 없음`;
    media.appendChild(ph);
  }
  card.appendChild(media);

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
  const hint = document.createElement("div");
  hint.className = "card-edit-hint";
  hint.textContent = "✎ 클릭해서 편집";
  body.appendChild(hint);
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
  handle.title = "드래그해서 순서 변경";
  handle.textContent = "⠿";
  handle.addEventListener("click", (e) => {
    e.stopPropagation();
    card.draggable = false; // 드래그 없이 핸들만 클릭했다면 draggable 상태를 되돌린다
  });
  card.appendChild(handle);
  attachDrag(card, handle, `projects-${cat.id}`, cat.projects, projIndex, renderSections);

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

function openProfileEditor() {
  if (!data) return;
  editingContext = {
    type: "profile",
    profile: JSON.parse(JSON.stringify(data.profile || {})),
    dirty: false,
  };
  openEditModal();
}

function openCategoryEditor(cat) {
  editingContext = {
    type: "category",
    cat,
    copy: { name: cat.name || "", accent: cat.accent || "#6c5ce7" },
    dirty: false,
  };
  openEditModal();
}

function openEditModal() {
  updateModalSaveState();
  renderEditModalBody();
  document.getElementById("projectEditOverlay").classList.remove("hidden");
}

// force=true면 확인 없이 닫는다 (저장 완료 후, 삭제 후)
function closeProjectEditor(force = false) {
  if (!force && editingContext && editingContext.dirty) {
    if (!confirm("저장하지 않은 변경사항이 있어요.\n저장하지 않고 닫으면 이번에 수정한 내용은 사라져요. 그래도 닫을까요?")) {
      return;
    }
  }
  editingContext = null;
  document.getElementById("projectEditOverlay").classList.add("hidden");
  renderAll();
}

function updateModalSaveState() {
  const el = document.getElementById("modalSaveState");
  if (!el) return;
  const dirty = !!(editingContext && editingContext.dirty);
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
    ctx.cat.accent = ctx.copy.accent;
  }
  saveDraft();
  const ok = await publishToGithub();
  if (ok) closeProjectEditor(true);
  // 실패하면(토큰 없음/네트워크 오류) 팝업을 유지해 다시 시도할 수 있게 한다
}

function renderEditModalBody() {
  if (!editingContext) return;
  if (editingContext.type === "profile") return renderProfileModalBody();
  if (editingContext.type === "category") return renderCategoryModalBody();
  const { cat, project, projIndex } = editingContext;
  const card = document.getElementById("projectEditBody");
  card.innerHTML = "";

  const head = document.createElement("div");
  head.className = "project-card-head";

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.value = project.title || "";
  titleInput.style.flex = "1";
  titleInput.style.fontWeight = "700";
  titleInput.style.border = "1.5px solid var(--line)";
  titleInput.style.borderRadius = "8px";
  titleInput.style.padding = "8px 10px";
  titleInput.addEventListener("input", () => { project.title = titleInput.value; saveDraft(); });

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

  head.appendChild(titleInput);
  head.appendChild(deleteBtn);
  card.appendChild(head);

  // ---- 상세 페이지 상단 배경색 ----
  const bgLabel = document.createElement("label");
  bgLabel.textContent = "상세 페이지 상단 배경색 (제목 영역)";
  bgLabel.className = "mini-label";
  bgLabel.style.marginTop = "10px";
  card.appendChild(bgLabel);

  const bgRow = document.createElement("div");
  bgRow.className = "block-controls-row";

  const bgField = buildColorField(
    project.heroBg || "#0d0d0d",
    (v) => { project.heroBg = v; saveDraft(); },
    { swatches: true, rerender: renderEditModalBody }
  );
  bgRow.appendChild(bgField.field);

  const bgClearBtn = document.createElement("button");
  bgClearBtn.className = "btn btn-outline btn-small";
  bgClearBtn.textContent = "배경 없음";
  bgClearBtn.addEventListener("click", () => {
    delete project.heroBg;
    saveDraft();
    renderEditModalBody();
  });
  bgRow.appendChild(bgClearBtn);
  card.appendChild(bgRow);

  // ---- 페이지 전체 배경색 (이 프로젝트를 보는 동안 적용) ----
  const pageBgLabel = document.createElement("label");
  pageBgLabel.textContent = project.bgColor
    ? "페이지 전체 배경색 (이 프로젝트를 여는 동안 적용)"
    : "페이지 전체 배경색 (이 프로젝트를 여는 동안 적용) · 미설정";
  pageBgLabel.className = "mini-label";
  pageBgLabel.style.marginTop = "16px";
  card.appendChild(pageBgLabel);

  const pageBgRow = document.createElement("div");
  pageBgRow.className = "block-controls-row";

  const pageBgField = buildColorField(
    project.bgColor || "#0d0d0d",
    (v) => { project.bgColor = v; saveDraft(); },
    { swatches: true, rerender: renderEditModalBody }
  );
  pageBgRow.appendChild(pageBgField.field);

  const pageBgClearBtn = document.createElement("button");
  pageBgClearBtn.className = "btn btn-outline btn-small";
  pageBgClearBtn.textContent = "기본 배경";
  pageBgClearBtn.addEventListener("click", () => {
    delete project.bgColor;
    saveDraft();
    renderEditModalBody();
  });
  pageBgRow.appendChild(pageBgClearBtn);
  card.appendChild(pageBgRow);

  const summaryLabel = document.createElement("label");
  summaryLabel.textContent = "카드 설명 (목록 화면 제목 아래 표시, 1~2줄 권장)";
  summaryLabel.className = "mini-label";
  summaryLabel.style.marginTop = "16px";
  card.appendChild(summaryLabel);
  const summaryInput = document.createElement("input");
  summaryInput.type = "text";
  summaryInput.value = project.summary || "";
  summaryInput.placeholder = "예: Brand Concept & Strategy, Visual Identity Design";
  summaryInput.className = "summary-input";
  summaryInput.addEventListener("input", () => { project.summary = summaryInput.value; saveDraft(); });
  card.appendChild(summaryInput);

  // ---- 콘텐츠 간격 (블록 사이 + 그리드/이미지 사이에 함께 적용) ----
  const gapLabel = document.createElement("label");
  gapLabel.textContent = "콘텐츠 간격 (블록 사이와 그리드 이미지 사이에 함께 적용, 최소 0px · 기본 28px)";
  gapLabel.className = "mini-label";
  gapLabel.style.marginTop = "16px";
  card.appendChild(gapLabel);
  const gapRow = document.createElement("div");
  gapRow.className = "block-controls-row";
  gapRow.appendChild(buildGapField(
    "간격",
    () => project.blockGap,
    (g) => { if (g == null) delete project.blockGap; else project.blockGap = g; },
    "28"
  ));
  card.appendChild(gapRow);

  // ---- 모드 전환: 블록 편집 / 미리보기·순서 조절 ----
  const isPreview = previewProjects.has(project.id);
  const modeSeg = document.createElement("div");
  modeSeg.className = "layout-seg";
  modeSeg.style.marginTop = "14px";
  [["edit", "✎ 블록 편집"], ["preview", "👁 미리보기 · 순서 조절"]].forEach(([value, text]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if ((isPreview ? "preview" : "edit") === value) b.classList.add("active");
    b.addEventListener("click", () => {
      if (value === "preview") previewProjects.add(project.id);
      else previewProjects.delete(project.id);
      renderEditModalBody();
    });
    modeSeg.appendChild(b);
  });
  card.appendChild(modeSeg);

  if (isPreview) {
    const hint = document.createElement("div");
    hint.className = "block-hint";
    hint.textContent = "실제 사이트에 보이는 모습이에요. ⠿ 핸들을 잡고 드래그하면 블록과 이미지 순서를 바꿀 수 있어요.";
    card.appendChild(hint);
    card.appendChild(renderProjectPreview(project));
    return;
  }

  // ---- 커버 이미지 ----
  const coverLabel = document.createElement("label");
  coverLabel.textContent = "커버 이미지 (목록 카드에 표시)";
  coverLabel.className = "mini-label";
  card.appendChild(coverLabel);

  const coverRow = document.createElement("div");
  coverRow.className = "thumb-row";
  if (project.coverImage) {
    coverRow.appendChild(makeThumb(project.coverImage, "image", () => {
      project.coverImage = "";
      saveDraft();
      renderEditModalBody();
    }));
  }
  coverRow.appendChild(makeUploadTile(project.coverImage ? "교체" : "커버 업로드", {}, (files) => {
    if (!files.length) return;
    readFileAsDataURL(files[0]).then((dataUrl) => {
      project.coverImage = dataUrl;
      saveDraft();
      renderEditModalBody();
    });
  }));
  card.appendChild(coverRow);

  // ---- 콘텐츠 블록 ----
  const blocksLabel = document.createElement("label");
  blocksLabel.textContent = "상세 콘텐츠 (⠿ 핸들을 잡고 드래그하면 순서가 바뀌어요)";
  blocksLabel.className = "mini-label";
  blocksLabel.style.marginTop = "18px";
  card.appendChild(blocksLabel);

  card.appendChild(renderBlocksEditor(project));
}

// 프로필 편집 팝업 본문
function renderProfileModalBody() {
  const card = document.getElementById("projectEditBody");
  card.innerHTML = "";

  const head = document.createElement("div");
  head.className = "project-card-head";
  const title = document.createElement("strong");
  title.textContent = "프로필 & 연락처";
  head.appendChild(title);
  card.appendChild(head);

  renderProfileFields(card, editingContext.profile);
}

// 카테고리 설정 팝업 본문 (이름·색상·삭제)
function renderCategoryModalBody() {
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
  card.appendChild(row);

  const accentLabel = document.createElement("label");
  accentLabel.textContent = "포인트 색상";
  accentLabel.className = "mini-label";
  card.appendChild(accentLabel);

  const accentRow = document.createElement("div");
  accentRow.className = "block-controls-row";
  const accentField = buildColorField(
    copy.accent,
    (v) => { copy.accent = v; saveDraft(); },
    { swatches: true, rerender: renderEditModalBody }
  );
  accentRow.appendChild(accentField.field);
  card.appendChild(accentRow);
}

/* ---------------------------------- 블록 에디터 ---------------------------------- */

function renderBlocksEditor(project) {
  project.blocks = project.blocks || [];
  const wrap = document.createElement("div");
  wrap.className = "block-list";
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
    label.textContent =
      block.type === "text" ? "텍스트"
      : block.type === "images" ? ({ single: "이미지 · 단일", grid: "이미지 · 그리드", slider: "이미지 · 슬라이드" }[block.layout] || "이미지")
      : "비디오 임베드";

    const del = document.createElement("button");
    del.className = "btn btn-danger btn-xs";
    del.textContent = "블록 삭제";
    del.style.marginLeft = "auto";
    del.addEventListener("click", () => {
      if (confirm("이 블록을 삭제할까요?")) {
        project.blocks.splice(i, 1);
        saveDraft();
        renderEditModalBody();
      }
    });

    bh.appendChild(handle);
    bh.appendChild(label);
    bh.appendChild(del);
    item.appendChild(bh);
    item.appendChild(renderBlockBody(project, block, i));
    attachDrag(item, handle, group, project.blocks, i);
    wrap.appendChild(item);
  });

  const addRow = document.createElement("div");
  addRow.className = "add-block-row";
  const mkAdd = (text, makeBlock) => {
    const b = document.createElement("button");
    b.className = "btn btn-outline btn-small";
    b.textContent = text;
    b.addEventListener("click", () => {
      project.blocks.push(makeBlock());
      saveDraft();
      renderEditModalBody();
    });
    return b;
  };
  addRow.appendChild(mkAdd("+ 텍스트", () => ({ type: "text", content: "", size: 15, color: "#f5f4f0", align: "left" })));
  addRow.appendChild(mkAdd("+ 이미지", () => ({ type: "images", layout: "single", images: [] })));
  addRow.appendChild(mkAdd("+ 비디오 임베드", () => ({ type: "embed", src: "" })));
  wrap.appendChild(addRow);

  return wrap;
}

function renderBlockBody(project, block, blockIndex) {
  const body = document.createElement("div");

  if (block.type === "text") {
    const ta = document.createElement("textarea");
    ta.rows = 4;
    ta.value = block.content || "";
    ta.className = "block-textarea";
    ta.style.fontSize = (block.size || 15) + "px";
    // 색을 지정하지 않은 블록은 사이트 기본색(밝은 글자)을 따르므로 그대로 상속
    if (block.color) ta.style.color = block.color;
    ta.style.textAlign = block.align || "left";
    ta.placeholder = "내용을 입력하세요 (프리텐다드 폰트로 표시돼요)";
    ta.addEventListener("input", () => { block.content = ta.value; saveDraft(); });
    body.appendChild(ta);

    const controls = document.createElement("div");
    controls.className = "block-controls-row";

    const sizeLabel = document.createElement("span");
    sizeLabel.className = "control-label";
    sizeLabel.textContent = "크기";
    const sizeInput = document.createElement("input");
    sizeInput.type = "number";
    sizeInput.min = 10;
    sizeInput.max = 80;
    sizeInput.value = block.size || 15;
    sizeInput.className = "size-input";
    sizeInput.addEventListener("input", () => {
      const v = parseInt(sizeInput.value, 10);
      if (v >= 10 && v <= 80) {
        block.size = v;
        ta.style.fontSize = v + "px";
        saveDraft();
      }
    });
    const pxLabel = document.createElement("span");
    pxLabel.className = "control-label";
    pxLabel.textContent = "px";

    const colorLabel = document.createElement("span");
    colorLabel.className = "control-label";
    colorLabel.textContent = "색상";
    colorLabel.style.marginLeft = "12px";

    const colorField = buildColorField(
      block.color || "#f5f4f0",
      (v) => {
        block.color = v;
        ta.style.color = v;
        saveDraft();
      },
      { swatches: true, rerender: renderEditModalBody }
    );

    const alignLabel = document.createElement("span");
    alignLabel.className = "control-label";
    alignLabel.textContent = "정렬";
    alignLabel.style.marginLeft = "12px";

    const alignSeg = document.createElement("div");
    alignSeg.className = "layout-seg";
    [["left", "왼쪽"], ["center", "가운데"], ["right", "오른쪽"]].forEach(([value, text]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      if ((block.align || "left") === value) b.classList.add("active");
      b.addEventListener("click", () => {
        block.align = value;
        ta.style.textAlign = value;
        saveDraft();
        renderEditModalBody();
      });
      alignSeg.appendChild(b);
    });

    controls.appendChild(sizeLabel);
    controls.appendChild(sizeInput);
    controls.appendChild(pxLabel);
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

    const seg = document.createElement("div");
    seg.className = "layout-seg";
    [["single", "단일"], ["grid", "그리드"], ["slider", "자동 슬라이드"]].forEach(([value, text]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      if ((block.layout || "single") === value) b.classList.add("active");
      b.addEventListener("click", () => {
        block.layout = value;
        if (value === "grid" && !block.grid) block.grid = "3";
        saveDraft();
        renderEditModalBody();
      });
      seg.appendChild(b);
    });
    segRow.appendChild(seg);

    // 그리드 형태 선택
    if (block.layout === "grid") {
      const gseg = document.createElement("div");
      gseg.className = "layout-seg";
      [["2", "2열"], ["3", "3열"], ["4", "4열"], ["masonry", "모자이크"]].forEach(([value, text]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        if (String(block.grid || "3") === value) b.classList.add("active");
        b.addEventListener("click", () => {
          block.grid = value;
          saveDraft();
          renderEditModalBody();
        });
        gseg.appendChild(b);
      });
      segRow.appendChild(gseg);
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

    // 썸네일 (드래그로 순서 변경)
    const imgGroup = `imgs-${project.id}-${blockIndex}`;
    const row = document.createElement("div");
    row.className = "thumb-row";
    (block.images || []).forEach((src, j) => {
      const thumb = document.createElement("div");
      thumb.className = "thumb";
      const img = document.createElement("img");
      img.src = src;
      img.draggable = false;
      setImgLoading(img, false);
      thumb.appendChild(img);

      const miniHandle = document.createElement("button");
      miniHandle.type = "button";
      miniHandle.className = "drag-handle-mini";
      miniHandle.title = "드래그해서 순서 변경";
      miniHandle.textContent = "⠿";
      thumb.appendChild(miniHandle);

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => {
        block.images.splice(j, 1);
        saveDraft();
        renderEditModalBody();
      });
      thumb.appendChild(removeBtn);

      attachDrag(thumb, miniHandle, imgGroup, block.images, j);
      row.appendChild(thumb);
    });

    // 업로드 타일을 썸네일 옆에 붙여 한 줄로 정리
    row.appendChild(makeUploadTile("이미지 추가", { multiple: true }, async (files) => {
      for (const file of files) {
        const dataUrl = await readFileAsDataURL(file);
        block.images.push(dataUrl);
      }
      saveDraft();
      renderEditModalBody();
    }));
    body.appendChild(row);

    if (block.layout === "slider") {
      const hint = document.createElement("div");
      hint.className = "block-hint";
      hint.textContent = "사이트에서 3.5초 간격으로 자동으로 넘어가요. 점을 눌러 이동할 수도 있어요.";
      body.appendChild(hint);
    }
    return body;
  }

  if (block.type === "embed") {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "embed-input";
    input.placeholder = "유튜브/비메오 링크 또는 <iframe> 임베드 코드 붙여넣기";
    input.value = block.src && !block.src.startsWith("data:") && !block.src.startsWith("assets/") ? block.src : "";
    if (block.src && (block.src.startsWith("data:") || block.src.startsWith("assets/"))) {
      const note = document.createElement("div");
      note.className = "block-hint";
      note.textContent = "🎬 업로드된 영상 파일이 연결되어 있어요.";
      body.appendChild(note);
    }
    input.addEventListener("input", () => {
      block.src = normalizeEmbedSrc(input.value);
      saveDraft();
    });
    // 붙여넣기를 마치면 정리된 주소를 입력창에도 보여준다
    input.addEventListener("change", () => {
      const v = normalizeEmbedSrc(input.value);
      input.value = v;
      block.src = v;
      saveDraft();
      // 다시 그리면서 비율을 새 주소 기준으로 자동 확인한다
      // (어느 주소로 구한 비율인지는 block.ratioSrc가 기억한다)
      renderEditModalBody();
    });
    body.appendChild(input);
    body.appendChild(buildEmbedRatioField(block));
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

/* ------------------------- 미리보기 · 순서 조절 모드 ------------------------- */

function renderProjectPreview(project) {
  const pane = document.createElement("div");
  pane.className = "preview-pane";
  project.blocks = project.blocks || [];

  // 설정한 블록 사이 간격을 미리보기에도 반영
  const blockGap = normalizeGap(project.blockGap);
  if (blockGap != null) pane.style.gap = blockGap + "px";

  if (!project.blocks.length) {
    const empty = document.createElement("div");
    empty.className = "block-hint";
    empty.textContent = "아직 콘텐츠 블록이 없어요. \"블록 편집\" 탭에서 추가해주세요.";
    pane.appendChild(empty);
    return pane;
  }

  const group = `pvblocks-${project.id}`;
  project.blocks.forEach((block, i) => {
    const wrap = document.createElement("div");
    wrap.className = "pv-block";

    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "drag-handle pv-handle";
    handle.title = "드래그해서 블록 순서 변경";
    handle.textContent = "⠿";

    const chip = document.createElement("span");
    chip.className = "pv-chip";
    chip.textContent =
      block.type === "text" ? "텍스트"
      : block.type === "images" ? ({ single: "이미지 · 단일", grid: "이미지 · 그리드", slider: "이미지 · 자동 슬라이드" }[block.layout] || "이미지")
      : "비디오 임베드";

    wrap.appendChild(handle);
    wrap.appendChild(chip);
    wrap.appendChild(renderPreviewBlockContent(project, block, i));
    attachDrag(wrap, handle, group, project.blocks, i);
    pane.appendChild(wrap);
  });

  return pane;
}

function renderPreviewBlockContent(project, block, blockIndex) {
  if (block.type === "text") {
    const p = document.createElement("p");
    p.className = "blk-text";
    p.textContent = block.content || "(빈 텍스트 블록)";
    p.style.fontSize = (block.size || 15) + "px";
    if (block.color) p.style.color = block.color;
    if (block.align && block.align !== "left") p.style.textAlign = block.align;
    if (!block.content) p.style.opacity = "0.4";
    return p;
  }

  if (block.type === "images") {
    const images = block.images || [];
    const imgGroup = `pvimgs-${project.id}-${blockIndex}`;
    let div;
    if (!images.length) {
      div = document.createElement("div");
      div.className = "block-hint";
      div.textContent = "(이미지가 없는 블록)";
      return div;
    }
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

      attachDrag(w, h, imgGroup, block.images, j);
      div.appendChild(w);
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
    // 실제 사이트와 같은 판별·변환 로직을 공용 함수로 사용
    if (isVideoFile(block.src)) {
      const v = document.createElement("video");
      v.src = block.src;
      v.controls = false;
      v.muted = true;
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

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderAll() {
  if (!data) return;
  ensureShape();
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
  openProfileEditor();
});

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

/* 이 탭이 살아 있는 동안만 쓰는 예비 보관함.
   임시저장 초안이 커서 localStorage 용량(약 5MB)을 다 쓰면 토큰 쓰기까지
   함께 실패한다. 그때 토큰이 통째로 날아가 매번 다시 묻게 되는 걸 막는다. */
let memoryToken = null;

function readStoredToken() {
  try {
    return localStorage.getItem(GH_TOKEN_KEY) || memoryToken;
  } catch (e) {
    return memoryToken;
  }
}

function storeToken(token) {
  memoryToken = token;
  try {
    localStorage.setItem(GH_TOKEN_KEY, token);
    return true;
  } catch (e) {
    // 용량 초과 등으로 못 남긴 경우 — 이 탭에서는 계속 쓸 수 있게 두고 알려만 준다
    return false;
  }
}

function forgetToken() {
  memoryToken = null;
  try {
    localStorage.removeItem(GH_TOKEN_KEY);
  } catch (e) {}
}

function getGithubToken(forceAsk = false) {
  const saved = readStoredToken();
  if (saved && !forceAsk) return saved;
  let token = prompt(
    "GitHub 토큰(ghp_...)을 입력해주세요.\n\n" +
      "발급 방법: github.com/settings/tokens → Generate new token (classic) → 'repo' 권한 체크\n\n" +
      "토큰은 이 브라우저에만 저장되며, 토큰이 없는 사람은 이 페이지를 열어도 사이트를 수정할 수 없어요.",
    ""
  );
  if (!token) return null;
  token = token.trim();
  if (!storeToken(token)) {
    setPublishStatus(
      "토큰을 브라우저에 저장하지 못했어요(용량 초과). 이 탭에서는 계속 쓸 수 있지만, " +
        "탭을 닫으면 다시 입력해야 해요. \"사이트에 반영\"으로 이미지가 올라가면 용량이 줄어듭니다."
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
    // 토큰 자체가 잘못된 경우에만 지운다
    forgetToken();
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

  const put = await ghRequest(`contents/${path}`, token, {
    method: "PUT",
    body: JSON.stringify({
      message: `assets: ${path} 업로드 (관리자 페이지)`,
      content: parsed.base64,
      branch: GH_BRANCH,
    }),
  });
  if (!put.ok) throw new Error(`파일 업로드 실패 (GitHub 응답 ${put.status})`);
  return path;
}

// data 안에서 아직 업로드되지 않은(data:로 시작하는) 이미지/영상 목록을 모은다.
function collectPendingMedia() {
  const refs = [];
  if (data.profile && data.profile.heroVideo && data.profile.heroVideo.startsWith("data:")) {
    refs.push({ get: () => data.profile.heroVideo, set: (v) => { data.profile.heroVideo = v; } });
  }
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
  const token = getGithubToken();
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
    let sha = null;
    const cur = await ghRequest(`contents/data.json?ref=${GH_BRANCH}`, token);
    if (cur.status === 200) sha = (await cur.json()).sha;

    const body = {
      message: "content: 관리자 페이지에서 콘텐츠 업데이트",
      content: utf8ToBase64(JSON.stringify(data, null, 2)),
      branch: GH_BRANCH,
    };
    if (sha) body.sha = sha;

    const put = await ghRequest("contents/data.json", token, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (!put.ok) throw new Error(`data.json 반영 실패 (GitHub 응답 ${put.status})`);

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
document.getElementById("tokenBtn").addEventListener("click", () => {
  const had = !!readStoredToken();
  if (getGithubToken(true)) {
    setPublishStatus("토큰을 저장했어요. 이제 \"사이트에 반영\"을 누르면 배포됩니다.");
  } else if (had) {
    setPublishStatus("토큰 입력을 취소했어요. 기존 토큰은 그대로 남아 있어요.");
  }
});

document.getElementById("lockBtn").addEventListener("click", () => {
  if (confirm("이 브라우저의 잠금을 다시 걸까요? 다음에 열 때 비밀번호를 물어봐요.")) lockAdmin();
});

/* ---------------------------------- Init ---------------------------------- */

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
