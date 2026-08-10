#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
게임 매크로 (버튼으로 조작하는 창) · macOS
==========================================
터미널에 명령어를 치지 않고, 창에서 버튼만 눌러서 매크로를 돌립니다.

보통은 바탕화면의 '게임매크로' 아이콘을 더블클릭하면 이 창이 열립니다.
직접 실행하려면:  python3 quest_clicker_gui.py
"""

import json
import os
import sys
import threading
import queue

# --- 실제 클릭/글자인식 기능은 quest_clicker.py 에 있습니다 -------------------
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

try:
    import quest_clicker as qc
except SystemExit:
    # quest_clicker 가 pyautogui 없다고 종료한 경우
    print("필요한 프로그램이 설치되지 않았어요. 아래를 터미널에 붙여넣어 주세요:")
    print("   pip3 install pyautogui pyobjc pillow")
    sys.exit(1)
except ImportError:
    print("quest_clicker.py 파일이 같은 폴더에 있어야 해요.")
    sys.exit(1)

try:
    import tkinter as tk
    from tkinter import ttk, messagebox
except ImportError:
    print("이 맥의 파이썬에 창(tkinter) 기능이 없어요.")
    print("터미널 버전을 대신 사용해 주세요:  python3 quest_clicker.py")
    sys.exit(1)

import pyautogui


BG = "#1b1b1d"
PANEL = "#2a2a2c"
TEXT = "#f4f4f6"
MUTED = "#9a9aa0"
PINK = "#e95aff"


class App:
    def __init__(self, root):
        self.root = root
        self.worker = None
        self.msgq = queue.Queue()

        root.title("게임 매크로")
        root.configure(bg=BG)
        root.geometry("520x620")
        root.minsize(460, 560)

        pad = {"padx": 16, "pady": 6}

        tk.Label(root, text="게임 매크로", bg=BG, fg=TEXT,
                 font=("Helvetica", 22, "bold")).pack(anchor="w", padx=16, pady=(16, 0))
        tk.Label(root, text="아이폰을 미러링해 두고, 아래 순서대로 누르세요.",
                 bg=BG, fg=MUTED).pack(anchor="w", padx=16, pady=(0, 10))

        # --- 퀘스트 선택 ---
        box = tk.Frame(root, bg=PANEL)
        box.pack(fill="x", **pad)
        tk.Label(box, text="퀘스트", bg=PANEL, fg=MUTED).pack(anchor="w", padx=12, pady=(10, 2))
        self.quest_keys = list(qc.QUESTS.keys())
        names = [qc.QUESTS[k]["name"] for k in self.quest_keys]
        self.quest_var = tk.StringVar(value=names[0])
        ttk.Combobox(box, textvariable=self.quest_var, values=names,
                     state="readonly").pack(fill="x", padx=12, pady=(0, 12))

        # --- 설정 ---
        opt = tk.Frame(root, bg=PANEL)
        opt.pack(fill="x", **pad)
        row = tk.Frame(opt, bg=PANEL); row.pack(fill="x", padx=12, pady=12)
        tk.Label(row, text="반복 횟수", bg=PANEL, fg=MUTED).pack(side="left")
        self.repeat_var = tk.StringVar(value="10")
        tk.Entry(row, textvariable=self.repeat_var, width=6).pack(side="left", padx=(8, 4))
        self.inf_var = tk.BooleanVar(value=False)
        tk.Checkbutton(row, text="무한", variable=self.inf_var, bg=PANEL, fg=TEXT,
                       selectcolor=PANEL, activebackground=PANEL,
                       activeforeground=TEXT).pack(side="left", padx=(0, 16))
        tk.Label(row, text="간격(초)", bg=PANEL, fg=MUTED).pack(side="left")
        self.gap_var = tk.StringVar(value="1.2")
        tk.Entry(row, textvariable=self.gap_var, width=6).pack(side="left", padx=8)

        # --- 버튼들 ---
        btns = tk.Frame(root, bg=BG)
        btns.pack(fill="x", padx=16, pady=(10, 4))

        self.btn_test = tk.Button(btns, text="① 글자 인식 확인", command=self.on_test,
                                  height=2, bg="#3a3a3d", fg="black",
                                  activebackground="#4a4a4d", highlightbackground=BG)
        self.btn_test.pack(fill="x", pady=3)

        self.btn_click = tk.Button(btns, text="①-2 클릭 테스트 (버튼이 눌리는지 확인)",
                                   command=self.on_clicktest,
                                   height=2, bg="#3a3a3d", fg="black",
                                   activebackground="#4a4a4d", highlightbackground=BG)
        self.btn_click.pack(fill="x", pady=3)

        self.btn_setup = tk.Button(btns, text="② 그림 버튼 위치 알려주기", command=self.on_setup,
                                   height=2, bg="#3a3a3d", fg="black",
                                   activebackground="#4a4a4d", highlightbackground=BG)
        self.btn_setup.pack(fill="x", pady=3)

        self.btn_run = tk.Button(btns, text="③  ▶  시작", command=self.on_run,
                                 height=2, bg=PINK, fg="black",
                                 font=("Helvetica", 15, "bold"),
                                 activebackground="#f07dff", highlightbackground=BG)
        self.btn_run.pack(fill="x", pady=(8, 3))

        self.btn_stop = tk.Button(btns, text="■  정지  (ESC 키도 가능)", command=self.on_stop,
                                  height=2, bg="#ff5a5a", fg="black",
                                  font=("Helvetica", 13, "bold"),
                                  activebackground="#ff7a7a", highlightbackground=BG,
                                  state="disabled")
        self.btn_stop.pack(fill="x", pady=3)

        # --- 진행 상황 ---
        tk.Label(root, text="진행 상황", bg=BG, fg=MUTED).pack(anchor="w", padx=16, pady=(10, 2))
        self.log = tk.Text(root, height=10, bg="#141416", fg="#d8d8dc",
                           insertbackground=TEXT, relief="flat", wrap="word")
        self.log.pack(fill="both", expand=True, padx=16, pady=(0, 16))
        self.say("준비됐어요. ①번부터 차례로 눌러보세요.")
        self.say("(②번은 처음 한 번만. 미러링 창을 옮기면 다시 해주세요.)")

        self.root.after(100, self._drain)
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    # ---------- 로그 ----------
    def say(self, msg):
        """어느 스레드에서 불러도 안전하게 로그 남기기"""
        self.msgq.put(str(msg))

    def _drain(self):
        try:
            while True:
                msg = self.msgq.get_nowait()
                self.log.insert("end", msg + "\n")
                self.log.see("end")
        except queue.Empty:
            pass
        self.root.after(100, self._drain)

    # ---------- 공통 ----------
    def current_quest(self):
        name = self.quest_var.get()
        for k in self.quest_keys:
            if qc.QUESTS[k]["name"] == name:
                return k, qc.QUESTS[k]
        return self.quest_keys[0], qc.QUESTS[self.quest_keys[0]]

    def busy(self, on):
        state = "disabled" if on else "normal"
        for b in (self.btn_test, self.btn_click, self.btn_setup, self.btn_run):
            b.config(state=state)
        self.btn_stop.config(state="normal" if on else "disabled")

    def start_worker(self, fn):
        if self.worker and self.worker.is_alive():
            return
        qc.clear_stop()
        self.busy(True)

        def wrapper():
            try:
                fn()
            except qc.Stopped:
                self.say("\n⏹  중단했습니다.")
            except pyautogui.FailSafeException:
                self.say("\n⏹  안전장치 발동 — 중단했습니다.")
            except Exception as e:
                self.say(f"\n⚠️  문제가 생겼어요: {e}")
            finally:
                self.root.after(0, lambda: self.busy(False))

        self.worker = threading.Thread(target=wrapper, daemon=True)
        self.worker.start()

    # ---------- ① 글자 인식 확인 ----------
    def on_test(self):
        def job():
            self.say("\n[글자 인식 확인] 3초 뒤 화면을 읽을게요...")
            for n in (3, 2, 1):
                self.say(f"   {n}...")
                qc.nap(1)
            texts = qc.read_screen_text()
            if not texts:
                self.say("⚠️  읽힌 글자가 없어요.")
                self.say("   시스템 설정 → 개인정보 보호 및 보안 → '화면 기록' 에서")
                self.say("   이 프로그램(터미널)을 켜고, 껐다 다시 실행해 주세요.")
                return
            self.say(f"✅ 글자 {len(texts)}개를 읽었어요. 인식은 잘 됩니다!")
            for s, x, y in texts[:25]:
                self.say(f"   · {s}")
        self.start_worker(job)

    # ---------- ①-2 클릭 테스트 ----------
    def on_clicktest(self):
        def job():
            self.say("\n[클릭 테스트] 게임에서 눌러도 괜찮은 곳에")
            self.say("마우스를 올려두세요. 5초 뒤 그 자리를 눌러볼게요.")
            for n in (5, 4, 3, 2, 1):
                self.say(f"   {n}초...")
                qc.nap(1)
            x, y = pyautogui.position()
            self.say(f"   맨 앞 창: {qc.frontmost_app() or '알 수 없음'}")
            qc.tap(x, y, log=self.say)
            self.say(f"   → ({int(x)}, {int(y)}) 눌렀어요.")
            self.say("게임이 반응했나요?")
            self.say("  · 반응했다 → ②번으로 진행하세요 ✅")
            self.say("  · 반응 없다 → 손쉬운 사용(접근성) 권한을 확인해 주세요.")
        self.start_worker(job)

    # ---------- ② 그림 버튼 위치 알려주기 ----------
    def on_setup(self):
        qkey, quest = self.current_quest()
        spot_steps = [s for s in quest["steps"] if s["kind"] == "spot"]
        if not spot_steps:
            self.say("이 퀘스트는 위치를 알려줄 필요가 없어요. 바로 ③ 시작하세요.")
            return
        ok = messagebox.askokcancel(
            "그림 버튼 위치 알려주기",
            "게임을 '기본 화면'에 두고 시작하세요.\n\n"
            "글자 버튼은 제가 자동으로 누르고,\n"
            "그림 버튼이 나오면 '그 버튼 위에 마우스를 5초간 올려두세요'\n"
            "라고 안내할게요. 마우스만 올려두면 됩니다.\n\n"
            "시작할까요?")
        if not ok:
            return

        def job():
            spots = {}
            steps = quest["steps"]
            self.say("\n[위치 알려주기] 시작합니다.")
            for i, s in enumerate(steps, 1):
                qc.check_stop()
                if s["kind"] == "text":
                    self.say(f"{i}/{len(steps)} · '{s['text']}' 자동으로 찾는 중...")
                    if not qc.find_and_click(s["text"], log=self.say):
                        self.say("   글자를 못 찾았어요. ①번으로 인식이 되는지 먼저 확인해 주세요.")
                        return
                    qc.nap(1.2)
                else:
                    self.say(f"\n👉 {i}/{len(steps)} · [{s['label']}] 위에 마우스를 올려두세요!")
                    for n in (5, 4, 3, 2, 1):
                        self.say(f"   {n}초...")
                        qc.nap(1)
                    x, y = pyautogui.position()
                    spots[s["key"]] = [int(x), int(y)]
                    self.say(f"   ✓ 저장됨 ({int(x)}, {int(y)})")
                    qc.nap(0.3)
                    qc.tap(x, y, log=self.say)
                    qc.nap(1.2)
            with open(qc.spots_file(qkey), "w", encoding="utf-8") as f:
                json.dump(spots, f, ensure_ascii=False, indent=2)
            self.say("\n✅ 위치 저장 완료! 이제 ③ 시작을 누르면 됩니다.")
        self.start_worker(job)

    # ---------- ③ 시작 ----------
    def on_run(self):
        qkey, quest = self.current_quest()
        needs_spot = any(s["kind"] == "spot" for s in quest["steps"])
        spots = qc.load_spots(qkey)
        if needs_spot and not spots:
            messagebox.showinfo("먼저 ②번을 해주세요",
                                "그림 버튼(상자, X)의 위치를 아직 몰라요.\n"
                                "②번 '그림 버튼 위치 알려주기'를 먼저 눌러주세요.")
            return
        try:
            gap = float(self.gap_var.get())
        except ValueError:
            gap = 1.2
        if self.inf_var.get():
            repeat = None
        else:
            try:
                repeat = max(1, int(self.repeat_var.get()))
            except ValueError:
                repeat = 10

        def job():
            self.say("\n3초 뒤 시작합니다. 마우스에서 손 떼고 기다려 주세요.")
            for n in (3, 2, 1):
                self.say(f"   {n}...")
                qc.nap(1)
            qc.run(qkey, quest, spots or {}, repeat, gap, 1.0,
                   log=self.say, do_countdown=False)
        self.start_worker(job)

    # ---------- 정지 ----------
    def on_stop(self):
        qc.request_stop()
        self.say("\n⏹  정지 요청 — 곧 멈춥니다...")

    def on_close(self):
        qc.request_stop()
        self.root.destroy()


def main():
    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
