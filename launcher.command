#!/bin/bash
# 게임 매크로 실행기 — 이 파일을 더블클릭하면 매크로 창이 열립니다.
cd "$(dirname "$0")" || exit 1

echo "게임 매크로를 준비하는 중..."

# 필요한 프로그램이 없으면 자동으로 설치 (처음 한 번만 시간이 걸려요)
if ! python3 -c "import pyautogui, Quartz" >/dev/null 2>&1; then
  echo "처음 실행이라 필요한 프로그램을 설치할게요. 1~2분 걸립니다..."
  pip3 install --quiet --user pyautogui pyobjc pillow \
    || pip3 install --quiet pyautogui pyobjc pillow
fi

# 창(GUI) 버전 실행, 안 되면 터미널 버전으로
if python3 -c "import tkinter" >/dev/null 2>&1; then
  python3 quest_clicker_gui.py
else
  echo "창 기능이 없어서 터미널 버전으로 실행합니다."
  python3 quest_clicker.py
fi

echo ""
echo "종료되었습니다. 이 창은 닫으셔도 됩니다."
