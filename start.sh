#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

UPSTREAM_VER="v0.9.0"
UPSTREAM_REPO="kiroswu/hongguo-shortdramabox/releases/download/${UPSTREAM_VER}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[错误] 未检测到 Docker，请先安装并启动 Docker Desktop（Mac/Win）或 Docker Engine（Linux/NAS）。"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[错误] Docker 未运行，请先打开 Docker Desktop 或启动 docker 服务后重试。"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[错误] 未检测到 docker compose 插件，请更新 Docker 到最新版本。"
  exit 1
fi

if [ ! -f "./ShortDramaCat" ] || [ ! -s "./ShortDramaCat" ]; then
  rm -f ./ShortDramaCat
  ARCH="$(docker info --format '{{.Architecture}}' 2>/dev/null || uname -m)"
  case "$ARCH" in
    aarch64|arm64)
      ASSET="ShortDramaCat-${UPSTREAM_VER}-aarch64-linux"
      ;;
    x86_64|amd64)
      ASSET="ShortDramaCat-${UPSTREAM_VER}-x86_64-linux"
      ;;
    *)
      echo "[错误] 不支持的 CPU 架构: $ARCH（仅支持 x86_64 / arm64）。"
      exit 1
      ;;
  esac

  if ! command -v curl >/dev/null 2>&1; then
    echo "[错误] 未安装 curl，请手动下载 ${ASSET} 并重命名为 ./ShortDramaCat 放到本目录。"
    exit 1
  fi

  URLS=(
    "https://github.com/${UPSTREAM_REPO}/${ASSET}"
    "https://ghfast.top/https://github.com/${UPSTREAM_REPO}/${ASSET}"
    "https://gh-proxy.com/https://github.com/${UPSTREAM_REPO}/${ASSET}"
  )

  echo "[1/3] 正在为架构 ($ARCH) 自动获取必要组件 (${ASSET})..."
  DOWNLOADED=0
  for U in "${URLS[@]}"; do
    echo "      尝试下载: $U"
    if curl -fSL --retry 1 --connect-timeout 8 --max-time 60 -o ./ShortDramaCat.tmp "$U"; then
      if [ -s ./ShortDramaCat.tmp ]; then
        mv ./ShortDramaCat.tmp ./ShortDramaCat
        DOWNLOADED=1
        break
      fi
    fi
    rm -f ./ShortDramaCat.tmp
  done

  if [ "$DOWNLOADED" -ne 1 ]; then
    echo "[错误] 自动下载失败，请检查网络连接（或开启代理后重试），也可手动下载并保存为 ./ShortDramaCat："
    echo "       https://github.com/${UPSTREAM_REPO}/${ASSET}"
    exit 1
  fi
fi

chmod +x ./ShortDramaCat
mkdir -p ./data

echo "[2/3] 正在一键构建并启动服务（首次构建约 1~2 分钟）..."
docker compose up -d --build

echo "[3/3] 正在检查服务是否就绪..."
READY=0
for _ in $(seq 1 20); do
  if command -v curl >/dev/null 2>&1; then
    CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:9588/ || true)"
    if [ "$CODE" = "200" ]; then
      READY=1
      break
    fi
  else
    READY=1
    break
  fi
  sleep 1
done

LAN_IP=""
if command -v ipconfig >/dev/null 2>&1; then
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
elif command -v hostname >/dev/null 2>&1; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi

echo ""
if [ "$READY" -eq 1 ]; then
  echo "✅ 部署成功！现在可以直接打开观看了："
else
  echo "⚠️ 容器已启动，服务可能仍在初始化，请稍等几秒再访问："
fi
echo "   电脑本地访问: http://127.0.0.1:9588"
if [ -n "$LAN_IP" ]; then
  echo "   iPhone / 局域网访问: http://${LAN_IP}:9588"
fi
echo ""
echo "📱 iPhone 推荐操作: 用 Safari 打开上方局域网地址 -> 点底部分享图标 ->「添加到主屏幕」，即可全屏 App 追剧！"
