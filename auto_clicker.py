#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
아이폰 미러링 자동 클릭 (macOS)
================================
맥북 화면에 미러링된 아이폰 화면 위를, 정해둔 순서대로 자동으로 클릭해 줍니다.
게임 안에서 반복되는 퀘스트(예: "가방에서 상자 1개 사용하기")를 대신 눌러줘요.

■ 준비 (처음 한 번만)
  1) 파이썬 3 설치 (맥에는 보통 python3 가 있습니다)
  2) 클릭 라이브러리 설치:
        pip3 install pyautogui pyobjc
  3) 마우스 제어 권한 허용:
        시스템 설정 → 개인정보 보호 및 보안 → 손쉬운 사용(접근성)
        에서 "터미널"(또는 사용하는 앱)을 켜기

■ 실행
        python3 auto_clicker.py

■ 긴급 정지
  - 마우스를 화면 맨 왼쪽 위 모서리로 휙 던지면 즉시 멈춥니다 (안전장치).
  - 또는 터미널에서 Control + C.

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

# 안전장치: 마우스를 왼쪽 위 모서리로 옮기면 즉시 중단
pyautogui.FAILSAFE = True

HERE = os.path.dirname(os.path.abspath(__file__))
CALIB_FILE = os.path.join(HERE, "clicker_calibration.json")

# ---------------------------------------------------------------------------
# 퀘스트 정의
#   각 단계의 (x, y)는 "아이폰 화면 크기 대비 위치(0~1 비율)"입니다.
#   - 0.0 = 화면 왼쪽/맨 위, 1.0 = 화면 오른쪽/맨 아래
#   - 값은 Figma에 표시한 분홍색 박스의 중심에서 계산했습니다.
#   새 퀘스트는 아래 형식대로 추가하면 됩니다.
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
# 화면 위치 보정 (미러링 창의 아이폰 화면 영역을 알려주기)
# ---------------------------------------------------------------------------
def capture_point(prompt):
    """사용자가 마우스를 원하는 위치에 올리고 Enter 를 누르면 그 좌표를 반환."""
    input(prompt)
    x, y = pyautogui.position()
    print(f"   → 저장됨: ({x}, {y})")
    return [x, y]


def calibrate():
    print("\n[화면 위치 맞추기]")
    print("미러링된 아이폰 '화면'의 두 모서리를 알려주세요. (창 제목 표시줄 말고 화면 안쪽)")
    print("마우스를 갖다 대고 그때마다 Enter 를 누르면 됩니다.\n")
    tl = capture_point("마우스를 [아이폰 화면의 '왼쪽 위' 모서리]에 올리고 Enter... ")
    br = capture_point("마우스를 [아이폰 화면의 '오른쪽 아래' 모서리]에 올리고 Enter... ")

    if br[0] <= tl[0] or br[1] <= tl[1]:
        print("⚠️  오른쪽 아래가 왼쪽 위보다 작습니다. 순서를 확인하고 다시 해주세요.")
        return None

    calib = {"left": tl[0], "top": tl[1], "right": br[0], "bottom": br[1]}
    with open(CALIB_FILE, "w", encoding="utf-8") as f:
        json.dump(calib, f, ensure_ascii=False, indent=2)
    print(f"✅ 저장 완료 (화면 크기 {calib['right']-calib['left']} x {calib['bottom']-calib['top']})")
    print("   창을 옮기거나 크기를 바꾸면 다시 맞춰 주세요.\n")
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
    """비율(0~1) → 실제 맥 화면 좌표"""
    w = calib["right"] - calib["left"]
    h = calib["bottom"] - calib["top"]
    return calib["left"] + fx * w, calib["top"] + fy * h


# ---------------------------------------------------------------------------
# 실행
# ---------------------------------------------------------------------------
def run_quest(quest, calib, repeat, step_gap, loop_gap):
    steps = quest["steps"]
    print(f"\n▶ '{quest['name']}' 시작 — {('무한' if repeat is None else str(repeat)+'회')} 반복")
    print("   (멈추려면: 마우스를 왼쪽 위 모서리로 던지거나 Control+C)\n")

    # 시작 전 카운트다운 (미러링 창으로 마우스 옮길 시간)
    for n in (3, 2, 1):
        print(f"   {n}...", end=" ", flush=True)
        time.sleep(1)
    print("시작!\n")

    loop = 0
    try:
        while repeat is None or loop < repeat:
            loop += 1
            rep_txt = f"{loop}/{repeat}" if repeat else f"{loop}"
            for i, s in enumerate(steps, 1):
                x, y = to_screen(calib, s["x"], s["y"])
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


def main():
    print("=" * 44)
    print(" 아이폰 미러링 자동 클릭 (macOS)")
    print("=" * 44)

    while True:
        calib = load_calibration()
        status = "맞춰짐 ✅" if calib else "아직 안 맞춤 ⚠️"
        print(f"\n화면 위치: {status}")
        print("  1) 화면 위치 맞추기 (처음 한 번 / 창을 옮겼을 때)")
        print("  2) 퀘스트 실행")
        print("  q) 종료")
        choice = input("선택> ").strip().lower()

        if choice == "1":
            calibrate()

        elif choice == "2":
            if not calib:
                print("먼저 1번으로 화면 위치를 맞춰 주세요.")
                continue

            print("\n[퀘스트 선택]")
            for key, q in QUESTS.items():
                print(f"  {key}) {q['name']}  ({len(q['steps'])}단계)")
            qkey = input("퀘스트 번호> ").strip()
            quest = QUESTS.get(qkey)
            if not quest:
                print("없는 번호예요.")
                continue

            rep = ask_int("반복 횟수 (Enter=10, 0=무한): ", 10)
            repeat = None if rep == 0 else rep
            step_gap = ask_float("버튼 사이 간격 초 (Enter=1.0): ", 1.0)
            loop_gap = ask_float("한 바퀴 끝난 뒤 쉬는 초 (Enter=1.0): ", 1.0)

            run_quest(quest, calib, repeat, step_gap, loop_gap)

        elif choice == "q":
            print("종료합니다.")
            break

        else:
            print("1, 2, q 중에서 골라 주세요.")


if __name__ == "__main__":
    main()
