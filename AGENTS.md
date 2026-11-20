# AGENTS.md

Project: **hongguo-pwa** (红果短剧全平台 Web / PWA 局域网自建竖屏播放器，支持 iOS / Android / Desktop)
Keywords: `红果短剧`, `hongguo`, `short-drama`, `pwa`, `ios`, `android`, `self-hosted`, `docker-compose`, `ffmpeg`, `http-206`

## Quick Deploy Workflow for AI Agents

1. Verify Docker & Compose are installed and running:
   ```bash
   docker --version && docker compose version && docker info >/dev/null
   ```
2. Run the one-click launcher (auto-detects `x86_64`/`arm64`, downloads matching `ShortDramaCat` binary with CN mirror fallback if absent, builds `v5-proxy` and `shortdramacat`, starts `ios-web` on port `9588`):
   ```bash
   bash start.sh
   ```
   *(On Windows, run `start.bat` instead.)*
3. Verify all 3 containers (`shortdramacat`, `shortdramacat-v5`, `shortdramacat-ios`) are running:
   ```bash
   docker compose ps
   ```
4. Verify end-to-end health before reporting success:
   - `GET http://127.0.0.1:9588/` -> `200`
   - `POST http://127.0.0.1:9588/api/call` with `{"method":"Search","args":["重生","0"]}` -> `"ok":true`
   - `PlayInfo` + `GET /v5media/...` with `Range: bytes=0-1023` -> `HTTP 206`
5. Report `http://127.0.0.1:9588` and `http://<LAN_IP>:9588` to the user for iPhone Safari "Add to Home Screen".

## Key Files
- `index.html`, `sw.js`, `manifest.json`, `nginx.conf`: iOS PWA frontend & reverse proxy
- `v5-proxy/v5-proxy.js`: Node.js caching media proxy + `ffmpeg` decrypt/faststart + `206` range server
- `v5-proxy/com/veyra/gybeyond/V5Signer.java`: Concurrent Java HTTP signer (`:9590`)
- `docker-compose.yml`, `Dockerfile`, `start.sh`: Local container orchestration
