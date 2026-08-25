/* ==========================================================================
   Unlimit_Cho Portfolio — 관리자 페이지 잠금

   중요한 한계: GitHub Pages는 정적 호스팅이라 서버에서 비밀번호를 검사할
   방법이 없다. 여기서 막을 수 있는 건 "주소를 아는 사람이 그냥 열어보는 것"
   까지고, 개발자도구를 쓸 줄 아는 사람은 우회할 수 있다.

   다만 잠금이 뚫려도 사이트를 바꾸지는 못한다. 실제 발행에는 GitHub 토큰이
   필요하고 그 토큰은 각자 브라우저에만 있기 때문이다. 이 잠금은 자물쇠가
   아니라 문 앞 커튼에 가깝다.
   ========================================================================== */

/* 비밀번호의 SHA-256 해시(소금 포함). 비워두면 첫 화면에서 새로 정할 수 있다.
   해시는 공개돼도 되지만, 짧거나 흔한 비밀번호는 역산되니 길게 잡을 것. */
const ADMIN_PW_HASH = "";

const GATE_SALT = "unlimitcho-portfolio-admin";
const GATE_UNLOCK_KEY = "portfolioAdminUnlockedUntil";
const GATE_REMEMBER_DAYS = 30;

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hashPassword(pw) {
  return sha256Hex(GATE_SALT + "|" + pw);
}

function gateIsUnlocked() {
  try {
    return Number(localStorage.getItem(GATE_UNLOCK_KEY) || 0) > Date.now();
  } catch (e) {
    return false;
  }
}

function gateRemember() {
  try {
    localStorage.setItem(GATE_UNLOCK_KEY, String(Date.now() + GATE_REMEMBER_DAYS * 864e5));
  } catch (e) {}
}

function lockAdmin() {
  try {
    localStorage.removeItem(GATE_UNLOCK_KEY);
  } catch (e) {}
  location.reload();
}

/* admin.js는 이 약속이 풀린 뒤에야 데이터를 읽고 화면을 그린다 */
window.adminGateReady = new Promise((resolve) => {
  const gate = document.getElementById("adminGate");
  const form = document.getElementById("adminGateForm");
  const pw = document.getElementById("adminGatePw");
  const pw2 = document.getElementById("adminGatePw2");
  const msg = document.getElementById("adminGateMsg");
  const setup = document.getElementById("adminGateSetup");
  const hashOut = document.getElementById("adminGateHash");
  const submit = document.getElementById("adminGateSubmit");

  const open = () => {
    gate.hidden = true;
    document.body.classList.remove("gate-locked");
    resolve();
  };

  // 잠금 자체를 못 돌리는 환경(file:// 등)에서는 막지 않는다 — 어차피 내 컴퓨터다
  if (!window.crypto || !crypto.subtle) {
    open();
    return;
  }

  if (gateIsUnlocked()) {
    open();
    return;
  }

  const settingUp = !ADMIN_PW_HASH;
  document.body.classList.add("gate-locked");
  gate.hidden = false;
  if (settingUp) {
    setup.hidden = false;
    pw2.hidden = false;
    submit.textContent = "비밀번호 정하기";
  }
  pw.focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = pw.value;
    if (!value) return;

    if (settingUp) {
      if (value.length < 8) {
        msg.textContent = "8자 이상으로 정해주세요.";
        return;
      }
      if (value !== pw2.value) {
        msg.textContent = "두 번 입력한 비밀번호가 서로 달라요.";
        return;
      }
      hashOut.value = await hashPassword(value);
      hashOut.parentElement.hidden = false;
      msg.textContent = "";
      gateRemember();
      submit.textContent = "이 브라우저에서 계속하기";
      submit.addEventListener("click", open, { once: true });
      return;
    }

    if ((await hashPassword(value)) !== ADMIN_PW_HASH) {
      msg.textContent = "비밀번호가 맞지 않아요.";
      pw.select();
      return;
    }
    gateRemember();
    open();
  });

  hashOut.addEventListener("focus", () => hashOut.select());
});
