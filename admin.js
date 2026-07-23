/* ==========================================================================
   Unlimit_Cho Portfolio — Admin editor logic
   ========================================================================== */

const DRAFT_KEY = "portfolioDraftData";
let data = null;

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
  data.categories = data.categories || [];
  data.categories.forEach((cat) => {
    cat.projects = cat.projects || [];
    cat.accent = cat.accent || "#6c5ce7";
    cat.projects.forEach((p) => {
      p.images = p.images || [];
      p.videos = p.videos || [];
    });
  });
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

    (cat.projects || []).forEach((project, projIndex) => {
      block.appendChild(renderProjectCard(cat, project, projIndex));
    });

    const addProjectBtn = document.createElement("button");
    addProjectBtn.className = "btn btn-outline btn-small";
    addProjectBtn.textContent = "+ 프로젝트 추가";
    addProjectBtn.addEventListener("click", () => {
      cat.projects.push({
        id: slugify("new-project"),
        title: "새 프로젝트",
        description: "",
        coverImage: "",
        images: [],
        videos: [],
      });
      saveDraft();
      renderCategories();
    });
    block.appendChild(addProjectBtn);

    container.appendChild(block);
  });
}

function renderProjectCard(cat, project, projIndex) {
  const card = document.createElement("div");
  card.className = "project-card";

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
      renderCategories();
    }
  });

  head.appendChild(titleInput);
  head.appendChild(deleteBtn);
  card.appendChild(head);

  // Description
  const descField = document.createElement("div");
  descField.className = "field";
  const descLabel = document.createElement("label");
  descLabel.textContent = "설명";
  const descTa = document.createElement("textarea");
  descTa.value = project.description || "";
  descTa.rows = 3;
  descTa.addEventListener("input", () => { project.description = descTa.value; saveDraft(); });
  descField.appendChild(descLabel);
  descField.appendChild(descTa);
  card.appendChild(descField);

  // Cover image
  const coverLabel = document.createElement("label");
  coverLabel.textContent = "커버 이미지";
  coverLabel.style.display = "block";
  coverLabel.style.fontSize = "12px";
  coverLabel.style.fontWeight = "700";
  coverLabel.style.color = "rgba(20,18,26,0.55)";
  coverLabel.style.margin = "12px 0 6px";
  card.appendChild(coverLabel);

  const coverRow = document.createElement("div");
  coverRow.className = "thumb-row";

  if (project.coverImage) {
    coverRow.appendChild(makeThumb(project.coverImage, "image", () => {
      project.coverImage = "";
      saveDraft();
      renderCategories();
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
      renderCategories();
    });
  });
  coverUploadBtn.appendChild(coverInput);
  card.appendChild(coverRow);
  card.appendChild(coverUploadBtn);

  // Additional images
  const imgLabel = document.createElement("label");
  imgLabel.textContent = "추가 이미지 (여러 장 가능)";
  imgLabel.style.display = "block";
  imgLabel.style.fontSize = "12px";
  imgLabel.style.fontWeight = "700";
  imgLabel.style.color = "rgba(20,18,26,0.55)";
  imgLabel.style.margin = "16px 0 6px";
  card.appendChild(imgLabel);

  const imgRow = document.createElement("div");
  imgRow.className = "thumb-row";
  (project.images || []).forEach((src, i) => {
    imgRow.appendChild(makeThumb(src, "image", () => {
      project.images.splice(i, 1);
      saveDraft();
      renderCategories();
    }));
  });
  card.appendChild(imgRow);

  const imgUploadBtn = document.createElement("button");
  imgUploadBtn.className = "btn btn-outline btn-small file-btn";
  imgUploadBtn.style.marginTop = "8px";
  imgUploadBtn.textContent = "이미지 추가 업로드";
  const imgInput = document.createElement("input");
  imgInput.type = "file";
  imgInput.accept = "image/*";
  imgInput.multiple = true;
  imgInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const dataUrl = await readFileAsDataURL(file);
      project.images.push(dataUrl);
    }
    saveDraft();
    renderCategories();
  });
  imgUploadBtn.appendChild(imgInput);
  card.appendChild(imgUploadBtn);

  // Videos
  const videoLabel = document.createElement("label");
  videoLabel.textContent = "영상 (유튜브/비메오 링크 또는 파일 업로드)";
  videoLabel.style.display = "block";
  videoLabel.style.fontSize = "12px";
  videoLabel.style.fontWeight = "700";
  videoLabel.style.color = "rgba(20,18,26,0.55)";
  videoLabel.style.margin = "16px 0 6px";
  card.appendChild(videoLabel);

  (project.videos || []).forEach((video, i) => {
    const row = document.createElement("div");
    row.className = "video-row";
    const badge = document.createElement("span");
    badge.textContent = video.type === "embed" ? "🔗 링크" : "🎬 파일";
    badge.style.fontWeight = "700";
    badge.style.flex = "none";
    const label = document.createElement("span");
    label.textContent = video.type === "embed" ? video.src : "업로드된 영상 파일";
    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-small btn-danger";
    removeBtn.textContent = "삭제";
    removeBtn.addEventListener("click", () => {
      project.videos.splice(i, 1);
      saveDraft();
      renderCategories();
    });
    row.appendChild(badge);
    row.appendChild(label);
    row.appendChild(removeBtn);
    card.appendChild(row);
  });

  const addVideoRow = document.createElement("div");
  addVideoRow.className = "add-video-row";

  const urlInput = document.createElement("input");
  urlInput.type = "url";
  urlInput.placeholder = "유튜브/비메오 링크 붙여넣기";

  const addUrlBtn = document.createElement("button");
  addUrlBtn.className = "btn btn-outline btn-small";
  addUrlBtn.textContent = "링크 추가";
  addUrlBtn.addEventListener("click", () => {
    if (!urlInput.value.trim()) return;
    project.videos.push({ type: "embed", src: urlInput.value.trim() });
    saveDraft();
    renderCategories();
  });

  const uploadVideoBtn = document.createElement("button");
  uploadVideoBtn.className = "btn btn-outline btn-small file-btn";
  uploadVideoBtn.textContent = "영상 파일 업로드";
  const videoFileInput = document.createElement("input");
  videoFileInput.type = "file";
  videoFileInput.accept = "video/*";
  videoFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    readFileAsDataURL(file).then((dataUrl) => {
      project.videos.push({ type: "file", src: dataUrl });
      saveDraft();
      renderCategories();
    });
  });
  uploadVideoBtn.appendChild(videoFileInput);

  addVideoRow.appendChild(urlInput);
  addVideoRow.appendChild(addUrlBtn);
  addVideoRow.appendChild(uploadVideoBtn);
  card.appendChild(addVideoRow);

  return card;
}

function makeThumb(src, kind, onRemove) {
  const thumb = document.createElement("div");
  thumb.className = "thumb";
  const media = kind === "image" ? document.createElement("img") : document.createElement("video");
  media.src = src;
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
  (data.categories || []).forEach((cat) => {
    (cat.projects || []).forEach((p) => {
      if (p.coverImage && p.coverImage.startsWith("data:")) {
        refs.push({ get: () => p.coverImage, set: (v) => { p.coverImage = v; } });
      }
      (p.images || []).forEach((src, i) => {
        if (src && src.startsWith("data:")) {
          refs.push({ get: () => p.images[i], set: (v) => { p.images[i] = v; } });
        }
      });
      (p.videos || []).forEach((video) => {
        if (video.type === "file" && video.src && video.src.startsWith("data:")) {
          refs.push({ get: () => video.src, set: (v) => { video.src = v; } });
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
