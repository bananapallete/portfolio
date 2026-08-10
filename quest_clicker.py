#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
게임 퀘스트 자동 클릭 (글자인식 + 위치 섞기) · macOS
====================================================
맥북에 미러링된 아이폰 화면에서 반복 퀘스트를 자동으로 눌러줍니다.

두 가지 방식을 섞어 씁니다:
  · 글자 있는 버튼(예: "사용하기") → 맥 문자인식(OCR)으로 글자를 읽어 자동 클릭
  · 글자 없는 그림 버튼(예: 상자 아이콘, 닫기 X) → 처음 한 번 위치만 콕 찍어두면 그 자리 클릭

■ 준비 (처음 한 번만)
  1) 설치:       pip3 install pyautogui pyobjc pillow
  2) 접근성:     시스템 설정 → 개인정보 보호 및 보안 → 손쉬운 사용(접근성) → "터미널" 켜기
  3) 화면 기록:  시스템 설정 → 개인정보 보호 및 보안 → 화면 기록 → "터미널" 켜기   ← OCR에 꼭 필요
  (권한을 켠 뒤에는 터미널을 껐다 다시 켜세요.)

■ 실행:      python3 quest_clicker.py
■ 긴급 정지: 마우스를 화면 맨 왼쪽 위 모서리로 던지거나, Control + C

주의: 게임 자동화는 게임사 정책 위반이 될 수 있어요. 개인적으로, 본인 책임 하에 사용하세요.
"""

import json
import os
import sys
import tempfile
import time

try:
    import pyautogui
except ImportError:
    print("먼저 설치해 주세요:  pip3 install pyautogui pyobjc pillow")
    sys.exit(1)

pyautogui.FAILSAFE = True
HERE = os.path.dirname(os.path.abspath(__file__))
_SHOT = os.path.join(tempfile.gettempdir(), "_quest_shot.png")


# ---------------------------------------------------------------------------
# 퀘스트 정의
#   kind="text" → 그 글자를 화면에서 찾아 누름 (OCR)
#   kind="spot" → 미리 찍어둔 위치를 누름 (그림 버튼용). key 로 위치를 저장/불러옴
# ---------------------------------------------------------------------------
QUESTS = {
    "1": {
        "name": "가방에서 상자 1개 사용하기",
        "steps": [
            {"kind": "text", "text": "가방에서 상자", "label": "기본 화면에서 퀘스트 열기"},
            {"kind": "spot", "key": "box",           "label": "가장 왼쪽 상자"},
            {"kind": "text", "text": "사용하기",      "label": "사용하기 버튼"},
            {"kind": "spot", "key": "close",          "label": "닫기(X) 버튼"},
        ],
    },
}


def spots_file(qkey):
    return os.path.join(HERE, f"spots_{qkey}.json")


# ===========================================================================
# 글자 인식 (Apple Vision)
# ===========================================================================
def read_screen_text():
    """지금 화면에서 읽힌 글자들: [(글자, 중심x, 중심y), ...]  (좌표 단위=포인트)"""
    try:
        import Quartz
        import Vision
        from Foundation import NSURL
    except ImportError:
        print("문자인식 모듈이 없어요:  pip3 install pyobjc")
        return []

    shot = pyautogui.screenshot()
    shot.save(_SHOT)
    sw, sh = pyautogui.size()

    url = NSURL.fileURLWithPath_(_SHOT)
    ci = Quartz.CIImage.imageWithContentsOfURL_(url)
    if ci is None:
        return []
    handler = Vision.VNImageRequestHandler.alloc().initWithCIImage_options_(ci, {})
    req = Vision.VNRecognizeTextRequest.alloc().init()
    req.setRecognitionLevel_(0)  # 정확 모드
    req.setRecognitionLanguages_(["ko-KR", "en-US"])
    req.setUsesLanguageCorrection_(True)
    ok, _ = handler.performRequests_error_([req], None)
    if not ok:
        return []

    out = []
    for obs in (req.results() or []):
        cands = obs.topCandidates_(1)
        if not cands:
            continue
        b = obs.boundingBox()  # 정규화(0~1), 원점=왼쪽 아래
        cx = b.origin.x + b.size.width / 2.0
        cy = b.origin.y + b.size.height / 2.0
        out.append((cands[0].string(), cx * sw, (1.0 - cy) * sh))
    return out


def _norm(s):
    return "".join(s.split()).lower()


def find_text(target, texts=None):
    if texts is None:
        texts = read_screen_text()
    t = _norm(target)
    exact, partial = [], []
    for s, x, y in texts:
        ns = _norm(s)
        if ns == t:
            exact.append((x, y, s))
        elif t in ns:
            partial.append((x, y, s))
    if exact:
        return exact[0]
    if partial:
        return min(partial, key=lambda p: len(p[2]))
    return None


def find_and_click(target, timeout=10.0, poll=0.6):
    end = time.time() + timeout
    while time.time() < end:
        hit = find_text(target)
        if hit:
            x, y, s = hit
            print(f"      ✓ '{s}' 발견 → 클릭")
            pyautogui.moveTo(x, y, duration=0.15)
            pyautogui.click()
            return True
        time.sleep(poll)
    print(f"      ✗ '{target}' 를 못 찾았어요 (시간 초과)")
    return False


# ===========================================================================
# 그림 버튼 위치 알려주기 (setup)
# ===========================================================================
def setup(qkey, quest):
    steps = quest["steps"]
    print(f"\n[그림 버튼 위치 알려주기] '{quest['name']}'")
    print("게임을 '기본 화면'에 두고 시작하세요.")
    print("퀘스트를 한 바퀴 도는데, 글자 버튼은 제가 자동으로 누르고,")
    print("그림 버튼이 나오면 '마우스를 그 위에 올리고 Enter' 만 해주시면 돼요.\n")
    input("준비되면 Enter... ")

    spots = {}
    try:
        for i, s in enumerate(steps, 1):
            if s["kind"] == "text":
                print(f"{i}/{len(steps)} · '{s['text']}' 자동으로 찾는 중...")
                if not find_and_click(s["text"]):
                    print("   글자를 못 찾았어요. 화면/권한을 확인하고 다시 시도해 주세요.")
                    return
                time.sleep(1.2)
            else:  # spot
                input(f"{i}/{len(steps)} · [{s['label']}] 위에 마우스를 올리고 Enter... ")
                x, y = pyautogui.position()
                spots[s["key"]] = [int(x), int(y)]
                print(f"   → 저장됨 ({int(x)}, {int(y)})")
                time.sleep(0.3)
                pyautogui.click(x, y)  # 눌러서 다음 화면으로
                time.sleep(1.2)
    except pyautogui.FailSafeException:
        print("\n⏹  안전장치 발동 — 취소했습니다."); return
    except KeyboardInterrupt:
        print("\n⏹  취소했습니다."); return

    with open(spots_file(qkey), "w", encoding="utf-8") as f:
        json.dump(spots, f, ensure_ascii=False, indent=2)
    print("\n✅ 위치 저장 완료! 이제 '2) 퀘스트 자동 실행' 하면 됩니다.")
    print("   (미러 창을 옮기면 위치가 달라지니 다시 알려주세요.)\n")


def load_spots(qkey):
    path = spots_file(qkey)
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


# ===========================================================================
# 자동 실행
# ===========================================================================
def run(qkey, quest, spots, repeat, step_gap, loop_gap):
    steps = quest["steps"]
    print(f"\n▶ '{quest['name']}' 시작 — {('무한' if repeat is None else str(repeat)+'회')} 반복")
    print("   (멈추려면: 마우스를 왼쪽 위 모서리로 던지거나 Control+C)")
    for n in (3, 2, 1):
        print(f"   {n}...", end=" ", flush=True); time.sleep(1)
    print("시작!\n")

    loop = 0
    try:
        while repeat is None or loop < repeat:
            loop += 1
            rep_txt = f"{loop}/{repeat}" if repeat else str(loop)
            for i, s in enumerate(steps, 1):
                print(f"[반복 {rep_txt}] {i}/{len(steps)} · {s['label']}")
                if s["kind"] == "text":
                    if not find_and_click(s["text"]):
                        print("   → 이번 바퀴는 건너뛰고 다시 시작할게요.")
                        break
                else:
                    x, y = spots[s["key"]]
                    print(f"      → 저장된 위치 ({x}, {y}) 클릭")
                    pyautogui.moveTo(x, y, duration=0.15)
                    pyautogui.click()
                time.sleep(step_gap)
            time.sleep(loop_gap)
    except KeyboardInterrupt:
        print("\n⏹  Control+C — 중단했습니다."); return
    except pyautogui.FailSafeException:
        print("\n⏹  안전장치 발동 — 중단했습니다."); return
    print("\n✅ 완료.")


# ===========================================================================
# 기타
# ===========================================================================
def test_ocr():
    print("\n[글자 테스트] 3초 뒤 지금 화면에서 읽히는 글자를 보여줄게요...")
    for n in (3, 2, 1):
        print(f"   {n}...", end=" ", flush=True); time.sleep(1)
    print()
    texts = read_screen_text()
    if not texts:
        print("⚠️  읽힌 글자가 없어요.")
        print("   → '화면 기록' 권한에 터미널이 켜져 있는지 확인 (켠 뒤 터미널 재시작).")
        return
    print(f"읽힌 글자 {len(texts)}개 (일부):")
    for s, x, y in texts[:50]:
        print(f"   · '{s}'  @ ({int(x)}, {int(y)})")


def choose_quest():
    print("\n[퀘스트 선택]")
    for key, q in QUESTS.items():
        mark = " (위치 저장됨 ✅)" if os.path.exists(spots_file(key)) else ""
        print(f"  {key}) {q['name']}{mark}")
    qkey = input("퀘스트 번호> ").strip()
    return qkey, QUESTS.get(qkey)


def ask_int(prompt, default):
    raw = input(prompt).strip()
    return default if raw == "" else (int(raw) if raw.lstrip("-").isdigit() else default)


def ask_float(prompt, default):
    raw = input(prompt).strip()
    try:
        return float(raw) if raw else default
    except ValueError:
        return default


def main():
    print("=" * 46)
    print(" 게임 퀘스트 자동 클릭 (글자인식 + 위치)")
    print("=" * 46)
    while True:
        print("\n  t) 글자 테스트 (권한/인식 확인)  ← 처음 한 번 확인용")
        print("  1) 그림 버튼 위치 알려주기 (처음 한 번 / 창 옮기면 다시)")
        print("  2) 퀘스트 자동 실행")
        print("  q) 종료")
        c = input("선택> ").strip().lower()

        if c == "t":
            test_ocr()

        elif c == "1":
            qkey, quest = choose_quest()
            if not quest:
                print("없는 번호예요."); continue
            setup(qkey, quest)

        elif c == "2":
            qkey, quest = choose_quest()
            if not quest:
                print("없는 번호예요."); continue
            needs_spot = any(s["kind"] == "spot" for s in quest["steps"])
            spots = load_spots(qkey)
            if needs_spot and not spots:
                print("먼저 '1) 그림 버튼 위치 알려주기'를 해주세요."); continue
            rep = ask_int("반복 횟수 (Enter=10, 0=무한): ", 10)
            repeat = None if rep == 0 else rep
            step_gap = ask_float("버튼 사이 간격 초 (Enter=1.2): ", 1.2)
            loop_gap = ask_float("한 바퀴 끝난 뒤 쉬는 초 (Enter=1.0): ", 1.0)
            run(qkey, quest, spots or {}, repeat, step_gap, loop_gap)

        elif c == "q":
            print("종료합니다."); break

        else:
            print("t, 1, 2, q 중에서 골라 주세요.")


if __name__ == "__main__":
    main()
