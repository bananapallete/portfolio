/* ==========================================================================
   게임 매크로 만들기 (Game macro maker)
   퀘스트를 고르고 "시작"을 누르면, 정해둔 순서(분홍색 박스)를 반복해서 눌러줍니다.
   좌표/크기는 Figma(node 1:147) 프레임 값을 그대로 사용합니다.
   ⚠️ 실제 휴대폰을 제어하는 게 아니라, 매크로 동작을 미리 보여주는 시뮬레이터입니다.
   ========================================================================== */

// 폰 화면(뷰포트) 기준 크기 — Figma 프레임과 동일
const VIEWPORT = { w: 300.895, h: 649.87 };

/* 매크로 정의 --------------------------------------------------------------
   각 step:
     label : 이 단계에서 하는 일
     img   : 배경 스크린샷
     imgW/imgH : 화면 위 이미지 크기(Figma 값, object-cover)
     box   : 눌러야 하는 분홍 영역 {x,y,w,h} (뷰포트 좌표계)
   step 순서대로 계속 누른 뒤 반복합니다.
--------------------------------------------------------------------------- */
const MACROS = [
  {
    id: "use-box",
    name: "가방에서 상자 1개 사용하기",
    defaultRepeat: 10,
    steps: [
      {
        label: "기본 화면에서 퀘스트(사용하기) 영역 누르기",
        img: "assets/macro-step1.png", imgW: 393.512, imgH: 782.925,
        box: { x: 221.4, y: 379.748, w: 79.491, h: 33.321 },
      },
      {
        label: "가장 왼쪽 상자 누르기",
        img: "assets/macro-step2.png", imgW: 428, imgH: 808,
        box: { x: 20.04, y: 384.605, w: 54.798, h: 54.524 },
      },
      {
        label: "사용하기 버튼 누르기",
        img: "assets/macro-step3.png", imgW: 428, imgH: 808,
        box: { x: 69.48, y: 303.033, w: 160.523, h: 47.11 },
      },
      {
        label: "닫기 버튼 누르기",
        img: "assets/macro-step4.png", imgW: 428, imgH: 808,
        box: { x: 121.763, y: 574.269, w: 53.849, h: 75.601 },
      },
    ],
  },
];

/* ---- 유틸: 뷰포트 좌표 → % ---- */
const pw = (v) => (v / VIEWPORT.w) * 100 + "%";
const ph = (v) => (v / VIEWPORT.h) * 100 + "%";

/** 이미지 + 분홍 박스를 element 에 배치 */
function placeStep(imgEl, boxEl, step) {
  const iL = (VIEWPORT.w - step.imgW) / 2;
  const iT = (VIEWPORT.h - step.imgH) / 2;
  imgEl.src = step.img;
  imgEl.style.left = pw(iL);
  imgEl.style.top = ph(iT);
  imgEl.style.width = pw(step.imgW);
  imgEl.style.height = ph(step.imgH);
  if (boxEl) {
    boxEl.style.left = pw(step.box.x);
    boxEl.style.top = ph(step.box.y);
    boxEl.style.width = pw(step.box.w);
    boxEl.style.height = ph(step.box.h);
  }
}

/* ====================== 실행기(Runner) ====================== */
const el = {
  phone: document.getElementById("phone"),
  img: document.getElementById("phoneImg"),
  box: document.getElementById("phoneBox"),
  tap: document.getElementById("phoneTap"),
  caption: document.getElementById("stepCaption"),
  select: document.getElementById("macroSelect"),
  steplist: document.getElementById("stepList"),
  repeat: document.getElementById("repeatCount"),
  infinite: document.getElementById("infinite"),
  speed: document.getElementById("speed"),
  speedVal: document.getElementById("speedVal"),
  runBtn: document.getElementById("runBtn"),
  status: document.getElementById("status"),
};

const state = {
  macro: MACROS[0],
  running: false,
  stepIdx: 0,
  loop: 0,
  target: 10,
  interval: 900,
  timer: null,
  tapTimer: null,
};

/* ---- 매크로 선택 옵션 채우기 ---- */
MACROS.forEach((m, i) => {
  const opt = document.createElement("option");
  opt.value = m.id;
  opt.textContent = m.name;
  if (i === 0) opt.selected = true;
  el.select.appendChild(opt);
});

/* ---- 단계 목록 렌더 ---- */
function renderStepList() {
  el.steplist.innerHTML = "";
  state.macro.steps.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "st";
    row.dataset.i = i;
    row.innerHTML = `<span class="no">${i + 1}</span><span class="tx"></span>`;
    row.querySelector(".tx").textContent = s.label;
    el.steplist.appendChild(row);
  });
}

/* ---- 특정 단계 화면 표시 ---- */
function showStep(i, { active = true } = {}) {
  const step = state.macro.steps[i];
  placeStep(el.img, el.box, step);
  el.phone.classList.toggle("is-active", active);

  // 캡션
  if (active) {
    el.caption.innerHTML = `<b>${i + 1}단계</b> · ${step.label}`;
  }

  // 단계 목록 하이라이트
  [...el.steplist.children].forEach((row, idx) => {
    row.classList.toggle("current", active && idx === i);
    row.classList.toggle("done", active && idx < i);
  });
}

/* ---- 탭(클릭) 물결 효과 ---- */
function fireTap(step) {
  const cx = step.box.x + step.box.w / 2;
  const cy = step.box.y + step.box.h / 2;
  el.tap.style.left = pw(cx);
  el.tap.style.top = ph(cy);
  el.tap.classList.remove("fire");
  void el.tap.offsetWidth; // reflow → 애니메이션 재시작
  el.tap.classList.add("fire");
}

/* ---- 상태 표시 ---- */
function updateStatus() {
  if (!state.running) {
    el.status.innerHTML = "대기 중 — <b>시작</b>을 누르면 실행됩니다";
    return;
  }
  const total = state.macro.steps.length;
  const rep = state.target === Infinity ? "∞" : state.target;
  el.status.innerHTML =
    `<span class="live">● 실행 중</span> · 반복 <b>${state.loop + 1}/${rep}</b> · 단계 <b>${state.stepIdx + 1}/${total}</b>`;
}

/* ---- 한 단계 실행 후 다음으로 ---- */
function tick() {
  if (!state.running) return;
  const steps = state.macro.steps;
  showStep(state.stepIdx);
  updateStatus();

  // 단계 중간에 탭 애니메이션
  clearTimeout(state.tapTimer);
  state.tapTimer = setTimeout(() => {
    if (state.running) fireTap(steps[state.stepIdx]);
  }, Math.min(400, state.interval * 0.45));

  // 다음 단계 예약
  state.timer = setTimeout(() => {
    if (!state.running) return;
    state.stepIdx++;
    if (state.stepIdx >= steps.length) {
      state.stepIdx = 0;
      state.loop++;
      if (state.target !== Infinity && state.loop >= state.target) {
        finish();
        return;
      }
    }
    tick();
  }, state.interval);
}

function start() {
  if (state.running) return;
  // 입력값 읽기
  state.target = el.infinite.checked ? Infinity : Math.max(1, parseInt(el.repeat.value, 10) || 1);
  state.interval = parseInt(el.speed.value, 10);
  state.running = true;
  state.stepIdx = 0;
  state.loop = 0;
  setRunningUI(true);
  tick();
}

function stop() {
  state.running = false;
  clearTimeout(state.timer);
  clearTimeout(state.tapTimer);
  setRunningUI(false);
  el.phone.classList.remove("is-active");
  [...el.steplist.children].forEach((r) => r.classList.remove("current", "done"));
  el.caption.innerHTML = "정지됨 — 다시 <b>시작</b>을 눌러주세요";
  updateStatus();
}

function finish() {
  state.running = false;
  clearTimeout(state.timer);
  clearTimeout(state.tapTimer);
  setRunningUI(false);
  el.phone.classList.remove("is-active");
  [...el.steplist.children].forEach((r) => r.classList.add("done"));
  el.caption.innerHTML = "✅ 완료 — 정해둔 반복을 모두 끝냈습니다";
  el.status.innerHTML = `완료 · 총 <b>${state.target}</b>회 반복`;
}

/* ---- 실행 중 UI 잠금 ---- */
function setRunningUI(running) {
  el.runBtn.textContent = running ? "■ 정지" : "▶ 시작";
  el.runBtn.classList.toggle("is-running", running);
  el.select.disabled = running;
  el.repeat.disabled = running;
  el.infinite.disabled = running;
}

/* ====================== 이벤트 ====================== */
el.runBtn.addEventListener("click", () => (state.running ? stop() : start()));

el.select.addEventListener("change", () => {
  state.macro = MACROS.find((m) => m.id === el.select.value) || MACROS[0];
  el.repeat.value = state.macro.defaultRepeat;
  renderStepList();
  showStep(0, { active: false });
  el.caption.innerHTML = "시작을 누르면 매크로가 실행됩니다";
});

el.infinite.addEventListener("change", () => {
  el.repeat.disabled = el.infinite.checked;
});

el.speed.addEventListener("input", () => {
  el.speedVal.textContent = (parseInt(el.speed.value, 10) / 1000).toFixed(1) + "초";
});

/* ====================== 스토리보드(Figma 원본 재현) ====================== */
function renderBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  state.macro.steps.forEach((s, i) => {
    const frame = document.createElement("div");
    frame.className = "frame";
    frame.innerHTML =
      `<div class="cap"><span class="n">${i + 1}</span><span></span></div>` +
      `<div class="mini"><img alt=""><div class="mdim"></div><div class="mbox"></div></div>`;
    frame.querySelector(".cap span:last-child").textContent = s.label;
    placeStep(frame.querySelector("img"), frame.querySelector(".mbox"), s);
    board.appendChild(frame);
  });
}

/* ====================== 초기화 ====================== */
el.repeat.value = state.macro.defaultRepeat;
el.speedVal.textContent = (parseInt(el.speed.value, 10) / 1000).toFixed(1) + "초";
renderStepList();
showStep(0, { active: false });
renderBoard();
updateStatus();
