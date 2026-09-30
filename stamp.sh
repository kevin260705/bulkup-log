#!/bin/sh
# 배포 전에 BUILD 값을 현재 시각으로 교체 (자동 업데이트 감지용)
cd "$(dirname "$0")" && sed -i -E "s/const BUILD='[^']*'/const BUILD='$(date +%s)'/" index.html && grep -o "const BUILD='[0-9]*'" index.html
