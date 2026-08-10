#!/bin/bash
# 게임 매크로 설치 — 터미널에 딱 한 번만 붙여넣으면 됩니다.
# 바탕화면에 '게임매크로' 폴더를 만들고, 더블클릭용 아이콘을 넣어줍니다.

set -e

BASE="https://raw.githubusercontent.com/bananapallete/portfolio/claude/game-auto-clicker-dnlsko"
DIR="$HOME/Desktop/게임매크로"

echo "게임 매크로를 설치할게요..."
mkdir -p "$DIR"
cd "$DIR"

echo "  · 파일 내려받는 중..."
curl -fsSL -o quest_clicker.py     "$BASE/quest_clicker.py"
curl -fsSL -o quest_clicker_gui.py "$BASE/quest_clicker_gui.py"
curl -fsSL -o 게임매크로.command    "$BASE/launcher.command"
chmod +x 게임매크로.command

echo ""
echo "✅ 설치 끝!"
echo ""
echo "바탕화면에 '게임매크로' 폴더가 생겼어요."
echo "그 안의 '게임매크로' 아이콘을 더블클릭하면 창이 열립니다."
echo "(처음 한 번은 오른쪽 클릭 → '열기' 를 눌러주세요)"
echo ""

open "$DIR" 2>/dev/null || true
