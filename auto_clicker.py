#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
아이폰 미러링 자동 클릭 (macOS)
================================
맥북 화면에 미러링된 아이폰 화면 위를, 정해둔 순서대로 자동으로 클릭해 줍니다.
게임 안에서 반복되는 퀘스트(예: "가방에서 상자 1개 사용하기")를 대신 눌러줘요.

■ 가장 정확한 방법 = "3) 버튼 위치 녹화"
  각 버튼에 마우스를 올리고 Enter만 누르면, 그 자리를 그대로 기억했다가
  똑같이 눌러줍니다. (모서리 맞추기·계산 필요 없음 → 안 어긋나요)

■ 준비 (처음 한 번만)
  1) 라이브러리 설치:   pip3 install pyautogui pyobjc
  2) 마우스 제어 권한:  시스템 설정 → 개인정보 보호 및 보안 →
                        손쉬운 사용(접근성) 에서 "터미널" 켜기

■ 실행:      python3 auto_clicker.py
■ 긴급 정지: 마우스를 화면 맨 왼쪽 위 모서리로 던지거나, Control + C

주의: 게임 자동화는 게임사 정책 위반이 될 수 있어요. 개인적으로, 본인 책임 하에 사용하세요.
"""

import json
import os
import sys
import time

try:
    import pyautogui
except ImportError:
    print("먼저 라이브러리를 설치해 주세요:  pip3 install pyautogui pyobjc")
    sys.exit(1)

pyautogui.FAILSAFE = True  # 마우스를 왼쪽 위 모서리로 옮기면 즉시 중단

HERE = os.path.dirname(os.path.abspath(__file__))
CALIB_FILE = os.path.join(HERE, "clicker_calibration.json")


def recorded_file(qkey):
    return os.path.join(HERE, f"recorded_{qkey}.json")


# ---------------------------------------------------------------------------
# 퀘스트 정의
#   각 단계의 (x, y)는 "아이폰 화면 대비 위치(0~1 비율)" — '화면 위치 맞추기'용 예비값입니다.
#   실제로는 "버튼 위치 녹화"로 저장한 값이 있으면 그걸 우선 사용합니다(더 정확).
# ---------------------------------------------------------------------------
QUESTS = {
    "1": {
        "name": "가방에서 상자 1개 사용하기",
        "steps": [
            {"label": "기본 화면에서 퀘스트(사용하기) 영역 누르기", "x": 0.7813, "y": 0.5913},
            {"label": "가장 왼쪽 상자 누르기",                       "x": 0.2593, "y": 0.6076},
            {"label": "사용하기 버튼 누르기",                        "x": 0.4984, "y": 0.5021},
            {"label": "닫기 버튼 누르기",                            "x": 0.4959, "y": 0.8554},
        ],
    },
}


# ---------------------------------------------------------------------------
# 버튼 위치 녹화 (가장 정확 / 추천)
# ---------------------------------------------------------------------------
def record_quest(qkey, quest):
    steps = quest["steps"]
    print(f"\n[버튼 위치 녹화] '{quest['name']}'")
    print("게임을 '기본 화면'에 두고 시작하세요.")
    print("각 버튼에 마우스를 올리고 Enter 만 누르면 됩니다.")
    print("제가 그 자리를 저장한 뒤, 직접 눌러서 다음 화면으로 넘어갈게요.\n")
    input("준비되면 Enter... ")

    points = []
    try:
        for i, s in enumerate(steps, 1):
            input(f"{i}/{len(steps)} · [{s['label']}] 위에 마우스를 올리고 Enter... ")
            x, y = pyautogui.position()
            points.append([int(x), int(y)])
            print(f"   → 저장됨 ({int(x)}, {int(y)})")
            # 저장한 자리를 실제로 눌러서 다음 화면으로 이동
            if i < len(steps):
                time.sleep(0.3)
                pyautogui.click(x, y)
                print("   (눌러서 다음 화면으로 이동 중...)")
                time.sleep(1.0)
    except pyautogui.FailSafeException:
        print("\n⏹  안전장치 발동 — 녹화를 취소했습니다.")
        return
    except KeyboardInterrupt:
        print("\n⏹  취소했습니다.")
        return

    with open(recorded_file(qkey), "w", encoding="utf-8") as f:
        json.dump(points, f, ensure_ascii=False, indent=2)
    print(f"\n✅ 녹화 완료! 이제 '2) 퀘스트 실행'으로 자동 반복하면 됩니다.")
    print("   (버튼 위치가 바뀌거나 미러 창을 옮기면 다시 녹화해 주세요.)\n")


def load_recorded(qkey, steps):
    path = recorded_file(qkey)
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            pts = json.load(f)
        if len(pts) == len(steps):
            return pts
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# 화면 위치 맞추기 (예비 방법: 두 모서리로 비율 매핑)
# ---------------------------------------------------------------------------
def capture_point(prompt):
    input(prompt)
    x, y = pyautogui.position()
    print(f"   → 저장됨: ({int(x)}, {int(y)})")
    return [int(x), int(y)]


def calibrate():
    print("\n[화면 위치 맞추기]")
    print("미러링된 아이폰 '화면'의 두 모서리를 알려주세요. (제목 표시줄 말고 화면 안쪽)\n")
    tl = capture_point("마우스를 [아이폰 화면의 '왼쪽 위' 모서리]에 올리고 Enter... ")
    br = capture_point("마우스를 [아이폰 화면의 '오른쪽 아래' 모서리]에 올리고 Enter... ")
    if br[0] <= tl[0] or br[1] <= tl[1]:
        print("⚠️  순서가 뒤바뀐 것 같아요. 다시 해주세요.")
        return None
    calib = {"left": tl[0], "top": tl[1], "right": br[0], "bottom": br[1]}
    with open(CALIB_FILE, "w", encoding="utf-8") as f:
        json.dump(calib, f, ensure_ascii=False, indent=2)
    print(f"✅ 저장 완료 (화면 크기 {calib['right']-calib['left']} x {calib['bottom']-calib['top']})\n")
    return calib


def load_calibration():
    if not os.path.exists(CALIB_FILE):
        return None
    try:
        with open(CALIB_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def to_screen(calib, fx, fy):
    w = calib["right"] - calib["left"]
    h = calib["bottom"] - calib["top"]
    return calib["left"] + fx * w, calib["top"] + fy * h


def get_targets(qkey, quest, calib):
    """이 퀘스트의 각 단계 클릭 좌표(리스트)를 돌려줌. 녹화값이 있으면 그걸 우선 사용."""
    rec = load_recorded(qkey, quest["steps"])
    if rec:
        return rec, "녹화된 위치"
    if calib:
        pts = [list(to_screen(calib, s["x"], s["y"])) for s in quest["steps"]]
        return pts, "화면 맞춤(비율)"
    return None, None


# ---------------------------------------------------------------------------
# 실행
# ---------------------------------------------------------------------------
def run_quest(quest, targets, source, repeat, step_gap, loop_gap):
    steps = quest["steps"]
    print(f"\n▶ '{quest['name']}' 시작 — {('무한' if repeat is None else str(repeat)+'회')} 반복  [{source}]")
    print("   (멈추려면: 마우스를 왼쪽 위 모서리로 던지거나 Control+C)\n")
    for n in (3, 2, 1):
        print(f"   {n}...", end=" ", flush=True)
        time.sleep(1)
    print("시작!\n")

    loop = 0
    try:
        while repeat is None or loop < repeat:
            loop += 1
            rep_txt = f"{loop}/{repeat}" if repeat else f"{loop}"
            for i, (s, (x, y)) in enumerate(zip(steps, targets), 1):
                print(f"   [반복 {rep_txt}] {i}/{len(steps)} · {s['label']}  → ({int(x)}, {int(y)})")
                pyautogui.moveTo(x, y, duration=0.15)
                pyautogui.click()
                time.sleep(step_gap)
            time.sleep(loop_gap)
    except KeyboardInterrupt:
        print("\n⏹  Control+C — 중단했습니다.")
        return
    except pyautogui.FailSafeException:
        print("\n⏹  안전장치 발동(왼쪽 위 모서리) — 중단했습니다.")
        return
    print("\n✅ 완료 — 정해둔 반복을 모두 끝냈습니다.")


def ask_int(prompt, default):
    raw = input(prompt).strip()
    if raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def ask_float(prompt, default):
    raw = input(prompt).strip()
    if raw == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def choose_quest():
    print("\n[퀘스트 선택]")
    for key, q in QUESTS.items():
        mark = " (녹화됨 ✅)" if os.path.exists(recorded_file(key)) else ""
        print(f"  {key}) {q['name']}  ({len(q['steps'])}단계){mark}")
    qkey = input("퀘스트 번호> ").strip()
    return qkey, QUESTS.get(qkey)


def main():
    print("=" * 44)
    print(" 아이폰 미러링 자동 클릭 (macOS)")
    print("=" * 44)

    while True:
        print("\n  3) 버튼 위치 녹화   ← 가장 정확 / 추천 ✅")
        print("  2) 퀘스트 실행")
        print("  1) 화면 위치 맞추기 (예비 방법)")
        print("  q) 종료")
        choice = input("선택> ").strip().lower()

        if choice == "3":
            qkey, quest = choose_quest()
            if not quest:
                print("없는 번호예요.")
                continue
            record_quest(qkey, quest)

        elif choice == "2":
            qkey, quest = choose_quest()
            if not quest:
                print("없는 번호예요.")
                continue
            calib = load_calibration()
            targets, source = get_targets(qkey, quest, calib)
            if not targets:
                print("먼저 '3) 버튼 위치 녹화'(추천) 또는 '1) 화면 위치 맞추기'를 해주세요.")
                continue
            rep = ask_int("반복 횟수 (Enter=10, 0=무한): ", 10)
            repeat = None if rep == 0 else rep
            step_gap = ask_float("버튼 사이 간격 초 (Enter=1.0): ", 1.0)
            loop_gap = ask_float("한 바퀴 끝난 뒤 쉬는 초 (Enter=1.0): ", 1.0)
            run_quest(quest, targets, source, repeat, step_gap, loop_gap)

        elif choice == "1":
            calibrate()

        elif choice == "q":
            print("종료합니다.")
            break

        else:
            print("3, 2, 1, q 중에서 골라 주세요.")


if __name__ == "__main__":
    main()
