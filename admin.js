/* ==========================================================================
   Unlimit_Cho Portfolio — Admin editor logic
   ========================================================================== */

const DRAFT_KEY = "portfolioDraftData";
const RECENT_COLORS_KEY = "portfolioRecentColors";
const DEFAULT_COLORS = ["#14121a", "#ff4d6d", "#6c5ce7", "#00c2a8", "#ffc93c", "#ffffff"];
let data = null;

// 미리보기·순서 조절 모드인 프로젝트 id 목록
const previewProjects = new Set();
// 현재 드래그 중인 항목 정보 { group, list, from }
let dragCtx = null;
// 편집 팝업이 열려 있는 대상 { cat, project, projIndex }
let editingContext = null;

// iframe 임베드 코드에서 src 추출, 프로토콜 없는 링크에 https:// 보완
function normalizeEmbedInput(raw) {
  let v = (raw || "").trim();
  const m = /<iframe[^>]*\ssrc=["']([^"']+)["']/i.exec(v);
  if (m) v = m[1];
  // iframe 코드를 그대로 붙여넣으면 속성 안의 &가 &amp;로 인코딩되어 있어 쿼리 파라미터가 깨짐
  v = v.replace(/&amp;/g, "&");
  if (!v) return "";
  if (v.startsWith("//")) return "https:" + v;
  if (v.startsWith("data:") || v.startsWith("assets/") || /^https?:\/\//i.test(v)) return v;
  if (/^[\w.-]+\.[a-z]{2,}([\/?#]|$)/i.test(v)) return "https://" + v;
  return v;
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

async function loadInitial() {
  const draft = localStorage.getItem(DRAFT_KEY);
  if (draft) {
    try {
      return { data: JSON.parse(draft), source: "draft" };
    } catch (e) {}
  }
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    if (!res.ok) throw new Error("fetch failed");
    const json = await res.json();
    return { data: json, source: "fetch" };
  } catch (e) {
    return { data: null, source: "none" };
  }
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
  document.getElementById("profileFields").innerHTML = msg;
  document.getElementById("categoriesContainer").innerHTML = "";
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
        if (b.type === "embed" && b.src) b.src = normalizeEmbedInput(b.src);
      });
    });
  });
}

/* ------------------------------ 드래그 정렬 공통 ------------------------------ */

// handle을 잡고 끌면 itemEl을 같은 group/list 안에서 순서를 바꿀 수 있다.
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
    document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    dragCtx = null;
  });
  itemEl.addEventListener("dragover", (e) => {
    if (!dragCtx || dragCtx.group !== group) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    itemEl.classList.add("drag-over");
  });
  itemEl.addEventListener("dragleave", () => itemEl.classList.remove("drag-over"));
  itemEl.addEventListener("drop", (e) => {
    if (!dragCtx || dragCtx.group !== group) return;
    e.preventDefault();
    e.stopPropagation();
    const from = dragCtx.from;
    dragCtx = null;
    if (from === index) return;
    const [moved] = list.splice(from, 1);
    list.splice(index, 0, moved);
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

/* ---------------------------------- Profile ---------------------------------- */

function renderProfile() {
  const wrap = document.getElementById("profileFields");
  wrap.innerHTML = "";

  const row1 = document.createElement("div");
  row1.className = "field-row";

  row1.appendChild(makeTextField("이름", data.profile.name, (v) => { data.profile.name = v; saveDraft(); }));
  row1.appendChild(makeTextField("닉네임", data.profile.nickname, (v) => { data.profile.nickname = v; saveDraft(); }));
  row1.appendChild(makeTextField("역할/타이틀", data.profile.role, (v) => { data.profile.role = v; saveDraft(); }));
  wrap.appendChild(row1);

  const heroTitleVisible = data.profile.showHeroTitle !== false;

  const heroTitleRow = document.createElement("div");
  heroTitleRow.className = "field-row";
  const heroTitleField = document.createElement("div");
  heroTitleField.className = "field";
  heroTitleField.style.gridColumn = "1 / -1";

  const heroTitleLabelRow = document.createElement("div");
  heroTitleLabelRow.className = "toggle-row";

  const heroTitleLabel = document.createElement("label");
  heroTitleLabel.textContent = "홈 화면 큰 제목";

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "toggle-switch";
  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.checked = heroTitleVisible;
  const toggleSlider = document.createElement("span");
  toggleSlider.className = "toggle-slider";
  const toggleText = document.createElement("span");
  toggleText.className = "toggle-text";
  toggleText.textContent = heroTitleVisible ? "표시함" : "숨김";
  toggleInput.addEventListener("change", () => {
    data.profile.showHeroTitle = toggleInput.checked;
    saveDraft();
    renderProfile();
  });
  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(toggleSlider);
  toggleLabel.appendChild(toggleText);

  heroTitleLabelRow.appendChild(heroTitleLabel);
  heroTitleLabelRow.appendChild(toggleLabel);

  const heroTitleHint = document.createElement("div");
  heroTitleHint.className = "block-hint";
  heroTitleHint.style.margin = "0 0 6px";
  heroTitleHint.textContent = `비워두면 "Hi, I'm ${data.profile.nickname || data.profile.name || ""}"로 자동 표시돼요.`;

  const heroTitleInput = document.createElement("input");
  heroTitleInput.type = "text";
  heroTitleInput.value = data.profile.heroTitle || "";
  heroTitleInput.placeholder = `Hi, I'm ${data.profile.nickname || data.profile.name || ""}`;
  heroTitleInput.disabled = !heroTitleVisible;
  heroTitleInput.addEventListener("input", () => { data.profile.heroTitle = heroTitleInput.value; saveDraft(); });

  heroTitleField.appendChild(heroTitleLabelRow);
  heroTitleField.appendChild(heroTitleHint);
  heroTitleField.appendChild(heroTitleInput);
  heroTitleRow.appendChild(heroTitleField);
  wrap.appendChild(heroTitleRow);

  const row2 = document.createElement("div");
  row2.className = "field-row";
  const taglineField = document.createElement("div");
  taglineField.className = "field";
  taglineField.style.gridColumn = "1 / -1";
  const label = document.createElement("label");
  label.textContent = "소개 문구(태그라인)";
  const ta = document.createElement("textarea");
  ta.value = data.profile.tagline || "";
  ta.rows = 2;
  ta.addEventListener("input", () => { data.profile.tagline = ta.value; saveDraft(); });
  taglineField.appendChild(label);
  taglineField.appendChild(ta);
  row2.appendChild(taglineField);
  wrap.appendChild(row2);

  const row3 = document.createElement("div");
  row3.className = "field-row";
  row3.appendChild(makeTextField("전화번호", data.profile.contact.phone, (v) => { data.profile.contact.phone = v; saveDraft(); }));

  const emailField = document.createElement("div");
  emailField.className = "field";
  const emailLabel = document.createElement("label");
  emailLabel.textContent = "이메일 (줄바꿈으로 여러 개 입력 가능)";
  const emailTa = document.createElement("textarea");
  emailTa.rows = 2;
  emailTa.value = (data.profile.contact.emails || []).join("\n");
  emailTa.addEventListener("input", () => {
    data.profile.contact.emails = emailTa.value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    saveDraft();
  });
  emailField.appendChild(emailLabel);
  emailField.appendChild(emailTa);
  row3.appendChild(emailField);

  wrap.appendChild(row3);

  // ---- 히어로 배경 영상 ----
  const heroLabel = document.createElement("label");
  heroLabel.textContent = "홈 화면 배경 영상 (선택, 어둡게 딤 처리되어 표시돼요)";
  heroLabel.className = "mini-label";
  heroLabel.style.marginTop = "18px";
  wrap.appendChild(heroLabel);

  const heroRow = document.createElement("div");
  heroRow.className = "hero-video-row";

  if (data.profile.heroVideo) {
    const preview = document.createElement("video");
    preview.src = data.profile.heroVideo;
    preview.muted = true;
    preview.className = "hero-video-preview";
    heroRow.appendChild(preview);

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-danger btn-small";
    removeBtn.textContent = "영상 제거";
    removeBtn.addEventListener("click", () => {
      data.profile.heroVideo = "";
      saveDraft();
      renderProfile();
    });
    heroRow.appendChild(removeBtn);
  } else {
    const uploadBtn = document.createElement("button");
    uploadBtn.className = "btn btn-outline btn-small file-btn";
    uploadBtn.textContent = "배경 영상 업로드";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*";
    input.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      readFileAsDataURL(file).then((dataUrl) => {
        data.profile.heroVideo = dataUrl;
        saveDraft();
        renderProfile();
      });
    });
    uploadBtn.appendChild(input);
    heroRow.appendChild(uploadBtn);
  }
  wrap.appendChild(heroRow);

  if (data.profile.heroVideo) {
    const dimRow = document.createElement("div");
    dimRow.className = "block-controls-row";
    const dimLabel = document.createElement("span");
    dimLabel.className = "control-label";
    dimLabel.textContent = "딤(어둡게) 강도";
    const dimInput = document.createElement("input");
    dimInput.type = "range";
    dimInput.min = "0";
    dimInput.max = "0.9";
    dimInput.step = "0.05";
    dimInput.value = data.profile.heroDim != null ? data.profile.heroDim : 0.5;
    dimInput.className = "dim-range";
    const dimValue = document.createElement("span");
    dimValue.className = "control-label";
    dimValue.textContent = Math.round(dimInput.value * 100) + "%";
    dimInput.addEventListener("input", () => {
      data.profile.heroDim = parseFloat(dimInput.value);
      dimValue.textContent = Math.round(dimInput.value * 100) + "%";
      saveDraft();
    });
    dimRow.appendChild(dimLabel);
    dimRow.appendChild(dimInput);
    dimRow.appendChild(dimValue);
    wrap.appendChild(dimRow);
  }
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

/* ---------------------------------- Categories ---------------------------------- */

function renderCategories() {
  const container = document.getElementById("categoriesContainer");
  container.innerHTML = "";

  data.categories.forEach((cat, catIndex) => {
    const block = document.createElement("div");
    block.className = "category-block";

    const head = document.createElement("div");
    head.className = "category-block-head";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = cat.accent || "#6c5ce7";
    colorInput.style.width = "34px";
    colorInput.style.height = "34px";
    colorInput.style.border = "none";
    colorInput.style.borderRadius = "8px";
    colorInput.addEventListener("input", () => { cat.accent = colorInput.value; saveDraft(); });

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = cat.name || "";
    nameInput.style.fontWeight = "800";
    nameInput.style.fontSize = "15px";
    nameInput.style.border = "1.5px solid var(--line)";
    nameInput.style.borderRadius = "10px";
    nameInput.style.padding = "8px 12px";
    nameInput.addEventListener("input", () => { cat.name = nameInput.value; saveDraft(); });

    const deleteCatBtn = document.createElement("button");
    deleteCatBtn.className = "btn btn-danger btn-small";
    deleteCatBtn.textContent = "카테고리 삭제";
    deleteCatBtn.style.marginLeft = "auto";
    deleteCatBtn.addEventListener("click", () => {
      if (confirm(`"${cat.name}" 카테고리와 그 안의 모든 프로젝트를 삭제할까요?`)) {
        data.categories.splice(catIndex, 1);
        saveDraft();
        renderCategories();
      }
    });

    head.appendChild(colorInput);
    head.appendChild(nameInput);
    head.appendChild(deleteCatBtn);
    block.appendChild(head);

    const projectsGrid = document.createElement("div");
    projectsGrid.className = "project-thumb-grid";
    (cat.projects || []).forEach((project, projIndex) => {
      projectsGrid.appendChild(renderProjectThumbCard(cat, project, projIndex));
    });
    block.appendChild(projectsGrid);

    const addProjectBtn = document.createElement("button");
    addProjectBtn.className = "btn btn-outline btn-small";
    addProjectBtn.textContent = "+ 프로젝트 추가";
    addProjectBtn.addEventListener("click", () => {
      const project = {
        id: slugify("new-project"),
        title: "새 프로젝트",
        coverImage: "",
        blocks: [],
        summary: "",
      };
      cat.projects.push(project);
      saveDraft();
      renderCategories();
      openProjectEditor(cat, project, cat.projects.length - 1);
    });
    block.appendChild(addProjectBtn);

    container.appendChild(block);
  });
}

function renderProjectThumbCard(cat, project, projIndex) {
  const card = document.createElement("div");
  card.className = "project-thumb-card";
  card.addEventListener("click", () => openProjectEditor(cat, project, projIndex));

  const media = document.createElement("div");
  media.className = "project-thumb-media";
  if (project.coverImage) {
    const img = document.createElement("img");
    img.src = project.coverImage;
    media.appendChild(img);
  } else {
    media.textContent = "커버 없음";
  }
  card.appendChild(media);

  const body = document.createElement("div");
  body.className = "project-thumb-body";
  const title = document.createElement("div");
  title.className = "project-thumb-title";
  title.textContent = project.title || "(제목 없음)";
  const meta = document.createElement("div");
  meta.className = "project-thumb-meta";
  meta.textContent = `블록 ${(project.blocks || []).length}개`;
  body.appendChild(title);
  body.appendChild(meta);
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
      renderCategories();
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
  attachDrag(card, handle, `projects-${cat.id}`, cat.projects, projIndex, renderCategories);

  return card;
}

/* ---------------------------------- 프로젝트 편집 팝업 ---------------------------------- */

function openProjectEditor(cat, project, projIndex) {
  editingContext = { cat, project, projIndex };
  renderEditModalBody();
  document.getElementById("projectEditOverlay").classList.remove("hidden");
}

function closeProjectEditor() {
  editingContext = null;
  document.getElementById("projectEditOverlay").classList.add("hidden");
  renderCategories();
}

function renderEditModalBody() {
  if (!editingContext) return;
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
      closeProjectEditor();
    }
  });

  head.appendChild(titleInput);
  head.appendChild(deleteBtn);
  card.appendChild(head);

  // ---- 프로젝트명 폰트 두께 ----
  const weightLabel = document.createElement("label");
  weightLabel.textContent = "프로젝트명 폰트 두께";
  weightLabel.className = "mini-label";
  weightLabel.style.marginTop = "10px";
  card.appendChild(weightLabel);

  const weightSeg = document.createElement("div");
  weightSeg.className = "layout-seg";
  [["400", "Regular"], ["500", "Medium"], ["600", "SemiBold"], ["700", "Bold"], ["800", "ExtraBold"], ["900", "Black"]].forEach(([value, text]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (String(project.titleWeight || "900") === value) b.classList.add("active");
    b.addEventListener("click", () => {
      project.titleWeight = value;
      saveDraft();
      renderEditModalBody();
    });
    weightSeg.appendChild(b);
  });
  card.appendChild(weightSeg);

  // ---- 상세 페이지 상단 배경색 ----
  const bgLabel = document.createElement("label");
  bgLabel.textContent = "상세 페이지 상단 배경색 (제목 영역)";
  bgLabel.className = "mini-label";
  bgLabel.style.marginTop = "16px";
  card.appendChild(bgLabel);

  const bgRow = document.createElement("div");
  bgRow.className = "block-controls-row";

  const bgColorInput = document.createElement("input");
  bgColorInput.type = "color";
  bgColorInput.value = project.heroBg || "#faf9f6";
  bgColorInput.className = "color-input";
  bgColorInput.addEventListener("input", () => {
    project.heroBg = bgColorInput.value;
    saveDraft();
  });

  const bgSwatches = document.createElement("div");
  bgSwatches.className = "color-swatches";
  getRecentColors().forEach((c) => {
    const s = document.createElement("button");
    s.type = "button";
    s.className = "swatch";
    s.style.background = c;
    s.title = c;
    s.addEventListener("click", () => {
      project.heroBg = c;
      pushRecentColor(c);
      saveDraft();
      renderEditModalBody();
    });
    bgSwatches.appendChild(s);
  });

  const bgClearBtn = document.createElement("button");
  bgClearBtn.className = "btn btn-outline btn-small";
  bgClearBtn.textContent = "배경 없음";
  bgClearBtn.addEventListener("click", () => {
    delete project.heroBg;
    saveDraft();
    renderEditModalBody();
  });

  bgRow.appendChild(bgColorInput);
  bgRow.appendChild(bgSwatches);
  bgRow.appendChild(bgClearBtn);
  card.appendChild(bgRow);

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
  const coverUploadBtn = document.createElement("button");
  coverUploadBtn.className = "btn btn-outline btn-small file-btn";
  coverUploadBtn.textContent = "커버 이미지 업로드";
  const coverInput = document.createElement("input");
  coverInput.type = "file";
  coverInput.accept = "image/*";
  coverInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    readFileAsDataURL(file).then((dataUrl) => {
      project.coverImage = dataUrl;
      saveDraft();
      renderEditModalBody();
    });
  });
  coverUploadBtn.appendChild(coverInput);
  card.appendChild(coverRow);
  card.appendChild(coverUploadBtn);

  // ---- 콘텐츠 블록 ----
  const blocksLabel = document.createElement("label");
  blocksLabel.textContent = "상세 콘텐츠 (⠿ 핸들을 잡고 드래그하면 순서가 바뀌어요)";
  blocksLabel.className = "mini-label";
  blocksLabel.style.marginTop = "18px";
  card.appendChild(blocksLabel);

  card.appendChild(renderBlocksEditor(project));
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
    del.className = "btn btn-danger btn-small";
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
  addRow.appendChild(mkAdd("+ 텍스트", () => ({ type: "text", content: "", size: 15, color: "#14121a" })));
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
    ta.style.color = block.color || "#14121a";
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
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = block.color || "#14121a";
    colorInput.className = "color-input";
    colorInput.addEventListener("input", () => {
      block.color = colorInput.value;
      ta.style.color = colorInput.value;
      saveDraft();
    });
    // 색상 선택을 마쳤을 때 자주 쓰는 색상에 기록
    colorInput.addEventListener("change", () => {
      pushRecentColor(colorInput.value);
      renderEditModalBody();
    });

    const swatches = document.createElement("div");
    swatches.className = "color-swatches";
    getRecentColors().forEach((c) => {
      const s = document.createElement("button");
      s.type = "button";
      s.className = "swatch";
      s.style.background = c;
      s.title = c;
      s.addEventListener("click", () => {
        block.color = c;
        pushRecentColor(c);
        saveDraft();
        renderEditModalBody();
      });
      swatches.appendChild(s);
    });

    controls.appendChild(sizeLabel);
    controls.appendChild(sizeInput);
    controls.appendChild(pxLabel);
    controls.appendChild(colorLabel);
    controls.appendChild(colorInput);
    controls.appendChild(swatches);
    body.appendChild(controls);
    return body;
  }

  if (block.type === "images") {
    // 레이아웃 선택
    const segRow = document.createElement("div");
    segRow.className = "seg-row";

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
    body.appendChild(row);

    const uploadBtn = document.createElement("button");
    uploadBtn.className = "btn btn-outline btn-small file-btn";
    uploadBtn.style.marginTop = "8px";
    uploadBtn.textContent = "이미지 업로드 (여러 장 가능)";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        const dataUrl = await readFileAsDataURL(file);
        block.images.push(dataUrl);
      }
      saveDraft();
      renderEditModalBody();
    });
    uploadBtn.appendChild(input);
    body.appendChild(uploadBtn);

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
      block.src = normalizeEmbedInput(input.value);
      saveDraft();
    });
    // 붙여넣기를 마치면 정리된 주소를 입력창에도 보여준다
    input.addEventListener("change", () => {
      const v = normalizeEmbedInput(input.value);
      input.value = v;
      block.src = v;
      saveDraft();
    });
    body.appendChild(input);
    return body;
  }

  return body;
}

/* ------------------------- 미리보기 · 순서 조절 모드 ------------------------- */

function gridClassName(block) {
  if (block.grid === "masonry") return "blk-images-masonry";
  const cols = ["2", "3", "4"].includes(String(block.grid)) ? block.grid : "3";
  return `blk-images-grid blk-grid-${cols}`;
}

function renderProjectPreview(project) {
  const pane = document.createElement("div");
  pane.className = "preview-pane";
  project.blocks = project.blocks || [];

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
    if (block.layout === "slider") {
      div = document.createElement("div");
      div.className = "pv-slider-strip";
    } else if (block.layout === "grid") {
      div = document.createElement("div");
      div.className = gridClassName(block);
    } else {
      div = document.createElement("div");
      div.className = "blk-images-single";
    }

    images.forEach((src, j) => {
      const w = document.createElement("div");
      w.className = "pv-img-wrap";
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.draggable = false;
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
    const isFile = block.src.startsWith("data:") || /\.(mp4|webm|mov|m4v)$/i.test(block.src);
    if (isFile) {
      const v = document.createElement("video");
      v.src = block.src;
      v.controls = false;
      v.muted = true;
      v.style.pointerEvents = "none";
      div.appendChild(v);
    } else {
      const iframe = document.createElement("iframe");
      let embedSrc = block.src;
      try {
        const u = new URL(block.src);
        const parts = u.pathname.split("/").filter(Boolean);
        if (u.hostname.includes("youtu.be") && parts[0]) embedSrc = `https://www.youtube.com/embed/${parts[0]}`;
        else if (u.hostname.includes("youtube.com") && u.searchParams.get("v")) embedSrc = `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
        else if (u.hostname.includes("youtube.com") && ["shorts", "live", "embed"].includes(parts[0]) && parts[1]) embedSrc = `https://www.youtube.com/embed/${parts[1]}`;
        else if (u.hostname.includes("vimeo.com") && !u.hostname.includes("player.")) embedSrc = `https://player.vimeo.com/video/${parts.pop()}`;
      } catch (e) {}
      iframe.src = embedSrc;
      iframe.style.pointerEvents = "none"; // 드래그 방해 방지
      div.appendChild(iframe);
    }
    return div;
  }

  return document.createElement("div");
}

function makeThumb(src, kind, onRemove) {
  const thumb = document.createElement("div");
  thumb.className = "thumb";
  const media = kind === "image" ? document.createElement("img") : document.createElement("video");
  media.src = src;
  media.draggable = false;
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
  ensureShape();
  renderProfile();
  renderCategories();
}

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

document.getElementById("addCategoryBtn").addEventListener("click", () => {
  if (!data) {
    alert("먼저 상단 \"불러오기(json)\" 버튼으로 data.json을 불러온 뒤 카테고리를 추가해주세요.");
    return;
  }
  data.categories.push({
    id: slugify("new-category"),
    name: "새 카테고리",
    accent: "#6c5ce7",
    projects: [],
  });
  saveDraft();
  renderCategories();
});

document.getElementById("projectEditClose").addEventListener("click", closeProjectEditor);
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
}

function getGithubToken(forceAsk = false) {
  let token = localStorage.getItem(GH_TOKEN_KEY);
  if (token && !forceAsk) return token;
  token = prompt(
    "GitHub 토큰(ghp_...)을 입력해주세요.\n\n" +
      "발급 방법: github.com/settings/tokens → Generate new token (classic) → 'repo' 권한 체크\n\n" +
      "토큰은 이 브라우저에만 저장되며, 토큰이 없는 사람은 이 페이지를 열어도 사이트를 수정할 수 없어요.",
    ""
  );
  if (token) {
    token = token.trim();
    localStorage.setItem(GH_TOKEN_KEY, token);
    return token;
  }
  return null;
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
    localStorage.removeItem(GH_TOKEN_KEY);
    throw new Error("토큰이 만료되었거나 잘못됐어요. \"사이트에 반영\"을 다시 눌러 새 토큰을 입력해주세요.");
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

async function publishToGithub() {
  if (!data) {
    alert("먼저 상단 \"불러오기(json)\" 버튼으로 data.json을 불러온 뒤 반영해주세요.");
    return;
  }
  const token = getGithubToken();
  if (!token) return;

  const btn = document.getElementById("publishBtn");
  btn.disabled = true;
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
  } catch (e) {
    setPublishStatus("⚠️ 배포 실패: " + e.message);
    alert("배포에 실패했어요.\n\n" + e.message);
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("publishBtn").addEventListener("click", publishToGithub);
document.getElementById("tokenBtn").addEventListener("click", () => {
  if (getGithubToken(true)) {
    setPublishStatus("토큰을 저장했어요. 이제 \"사이트에 반영\"을 누르면 배포됩니다.");
  }
});

/* ---------------------------------- Init ---------------------------------- */

loadInitial().then(({ data: initial, source }) => {
  if (source === "none") {
    data = null;
    showLoadFailure();
    return;
  }
  data = initial;
  renderAll();
  document.getElementById("autosaveStatus").textContent =
    source === "draft" ? "이전 임시저장 내용을 불러왔어요." : "data.json을 불러왔어요.";
});
