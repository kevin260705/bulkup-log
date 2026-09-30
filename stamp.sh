#!/bin/sh
# 배포 전에 BUILD 값을 현재 시각으로 교체 (줄 맨 앞의 선언 한 줄만)
cd "$(dirname "$0")" && sed -i -E "s/^const BUILD='[0-9]*';/const BUILD='$(date +%s)';/" index.html && grep -n "BUILD" index.html | head -5
