#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
글자 인식으로 눌러주기 (macOS · Apple Vision)
=============================================
화면에서 '글자'를 읽어서, 그 글자가 적힌 버튼을 눌러줍니다.
(예: "사용하기" 버튼, 기본화면의 "가방에서 상자 1개 사용하기" 퀘스트)

맥에 내장된 문자인식(Vision)을 쓰기 때문에 한글도 잘 읽고, 추가 설치가 적어요.

■ 준비 (처음 한 번만)
  1) 라이브러리:   pip3 install pyautogui pyobjc pillow
  2) 마우스 제어:  시스템 설정 → 개인정보 보호 및 보안 → 손쉬운 사용(접근성) → "터미널" 켜기
  3) 화면 읽기:    시스템 설정 → 개인정보 보호 및 보안 → 화면 기록 → "터미널" 켜기   ← OCR엔 이게 꼭 필요!

■ 실행:      python3 ocr_click.py
■ 긴급 정지: 마우스를 화면 맨 왼쪽 위 모서리로 던지거나, Control + C

※ 글자가 없는 '그림 버튼'(예: 상자 아이콘, X 버튼)은 글자 인식으로 못 찾습니다.
   그런 버튼은 auto_clicker.py 의 '버튼 위치 녹화'로 처리하세요.
"""

import sys
import time
import tempfile
import os

try:
    import pyautogui
except ImportError:
    print("먼저 설치해 주세요:  pip3 install pyautogui pyobjc pillow")
    sys.exit(1)

pyautogui.FAILSAFE = True

_SHOT = os.path.join(tempfile.gettempdir(), "_ocr_click_shot.png")


def read_screen_text():
    """지금 화면을 캡처해서, 읽힌 글자들의 목록을 돌려줍니다.
    반환: [(문자열, 화면가로좌표, 화면세로좌표), ...]  (좌표는 그 글자의 중심, 단위=포인트)
    """
    try:
        import Quartz
        import Vision
        from Foundation import NSURL
    except ImportError:
        print("문자인식 모듈이 없어요:  pip3 install pyobjc")
        return []

    # 화면 캡처 (화면 기록 권한 필요)
    shot = pyautogui.screenshot()
    shot.save(_SHOT)
    sw, sh = pyautogui.size()  # 화면 크기(포인트) — 레티나여도 이 값 기준으로 클릭하면 맞습니다

    url = NSURL.fileURLWithPath_(_SHOT)
    ci = Quartz.CIImage.imageWithContentsOfURL_(url)
    if ci is None:
        return []

    handler = Vision.VNImageRequestHandler.alloc().initWithCIImage_options_(ci, {})
    req = Vision.VNRecognizeTextRequest.alloc().init()
    req.setRecognitionLevel_(0)              # 0 = 정확 모드
    req.setRecognitionLanguages_(["ko-KR", "en-US"])
    req.setUsesLanguageCorrection_(True)
    ok, _err = handler.performRequests_error_([req], None)
    if not ok:
        return []

    out = []
    for obs in (req.results() or []):
        cands = obs.topCandidates_(1)
        if not cands:
            continue
        text = cands[0].string()
        b = obs.boundingBox()  # 정규화(0~1), 원점=왼쪽 '아래'
        cx = b.origin.x + b.size.width / 2.0
        cy = b.origin.y + b.size.height / 2.0
        # 정규화 좌표 → 화면 포인트 좌표 (세로는 위아래 뒤집기)
        out.append((text, cx * sw, (1.0 - cy) * sh))
    return out


def _norm(s):
    return "".join(s.split()).lower()


def find_text(target, texts=None):
    """target 글자가 들어간 항목을 찾아 (중심 x, y, 원문) 을 돌려줍니다. 없으면 None.
    똑같은 글자를 우선하고, 그다음엔 가장 짧은(=가장 딱 맞는) 글자를 고릅니다.
    """
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
        return min(partial, key=lambda p: len(p[2]))  # 가장 짧은 것
    return None


def find_and_click(target, timeout=10.0, poll=0.6):
    """target 글자가 화면에 나타날 때까지 기다렸다가 그 버튼을 누릅니다."""
    end = time.time() + timeout
    while time.time() < end:
        hit = find_text(target)
        if hit:
            x, y, s = hit
            print(f"   ✓ '{s}' 발견 → ({int(x)}, {int(y)}) 클릭")
            pyautogui.moveTo(x, y, duration=0.15)
            pyautogui.click()
            return True
        time.sleep(poll)
    print(f"   ✗ '{target}' 를 화면에서 못 찾았어요 (시간 초과)")
    return False


# ---------------------------------------------------------------------------
# 메뉴
# ---------------------------------------------------------------------------
def test_ocr():
    print("\n[글자 테스트] 3초 뒤 지금 화면에서 읽히는 글자를 보여줄게요...")
    for n in (3, 2, 1):
        print(f"   {n}...", end=" ", flush=True); time.sleep(1)
    print()
    texts = read_screen_text()
    if not texts:
        print("⚠️  읽힌 글자가 없어요.")
        print("   → '시스템 설정 → 개인정보 보호 및 보안 → 화면 기록'에서 터미널을 켰는지 확인하세요.")
        print("   (켠 뒤에는 터미널을 껐다 다시 켜야 적용됩니다.)")
        return
    print(f"읽힌 글자 {len(texts)}개:")
    for s, x, y in texts[:60]:
        print(f"   · '{s}'  @ ({int(x)}, {int(y)})")


def run_sequence():
    print("\n[글자로 순서대로 누르기]")
    print("누를 버튼의 '글자'를 순서대로 콤마(,)로 적어주세요.")
    print("예)  가방에서 상자, 사용하기")
    raw = input("글자 순서> ").strip()
    if not raw:
        print("입력이 없어요.")
        return
    targets = [t.strip() for t in raw.split(",") if t.strip()]

    rep = input("반복 횟수 (Enter=5, 0=무한): ").strip()
    repeat = None if rep == "0" else (int(rep) if rep.isdigit() else 5)
    gap_raw = input("버튼 사이 간격 초 (Enter=1.5): ").strip()
    gap = float(gap_raw) if gap_raw else 1.5

    print(f"\n▶ 시작 — {('무한' if repeat is None else str(repeat)+'회')} 반복")
    print("   (멈추려면: 마우스를 왼쪽 위 모서리로 던지거나 Control+C)")
    for n in (3, 2, 1):
        print(f"   {n}...", end=" ", flush=True); time.sleep(1)
    print("시작!\n")

    loop = 0
    try:
        while repeat is None or loop < repeat:
            loop += 1
            rep_txt = f"{loop}/{repeat}" if repeat else str(loop)
            for i, tgt in enumerate(targets, 1):
                print(f"[반복 {rep_txt}] {i}/{len(targets)} · '{tgt}' 찾는 중...")
                find_and_click(tgt)
                time.sleep(gap)
    except KeyboardInterrupt:
        print("\n⏹  Control+C — 중단했습니다."); return
    except pyautogui.FailSafeException:
        print("\n⏹  안전장치 발동 — 중단했습니다."); return
    print("\n✅ 완료.")


def main():
    print("=" * 44)
    print(" 글자 인식으로 눌러주기 (macOS)")
    print("=" * 44)
    while True:
        print("\n  t) 글자 테스트 (지금 화면에서 읽히는 글자 보기)  ← 먼저 해보세요")
        print("  1) 글자로 순서대로 누르기")
        print("  q) 종료")
        c = input("선택> ").strip().lower()
        if c == "t":
            test_ocr()
        elif c == "1":
            run_sequence()
        elif c == "q":
            print("종료합니다."); break
        else:
            print("t, 1, q 중에서 골라 주세요.")


if __name__ == "__main__":
    main()
