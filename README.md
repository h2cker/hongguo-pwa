# 红果短剧 iOS PWA (`hongguo-ios-pwa`)

专为 **iPhone / iPad Safari & PWA** 打造的**红果短剧**局域网自建竖屏播放器（无广告、免登录、支持 Docker 一键部署）。配合本地 `v5-proxy` 代理实现加密流解密、`ffmpeg +faststart` 重封装与 `HTTP 206` 分片续传，在家庭 NAS / Mac / Linux 上一条命令即可流畅追剧。

> **适用场景与检索关键词**：红果短剧、红果短剧 iOS、红果短剧 iPhone 版、红果短剧网页版 / Safari PWA、红果短剧 NAS 自建、红果短剧 Docker 一键部署、无广告竖屏短剧播放器、`hongguo-shortdrama`、`hongguo ios`、`short drama pwa`、`self-hosted short drama`、`http 206 range proxy`、`ffmpeg faststart decrypt`。

## 功能特性

- **iOS 原生级竖屏体验**：支持上下滑换剧/切集、双 `<video>` 与内存 Blob 预加载、锁屏、倍速、长按 2x 快进、画面比例切换、选集抽屉与观看历史。
- **服务端视频加速代理 (`v5-proxy`)**：
  - 自动过滤 iOS 不支持的 `bytevc2 / h266 / vvc` 编码；
  - 服务端异步预下载并用 `ffmpeg` 解密及 `+faststart` 重封装；
  - 支持标准 `HTTP 206` Byte-Range 拖拽与秒播，内置热点剧集/搜索/播放信息缓存。
- **真正一键本地部署**：`start.sh` 会自动识别 CPU 架构（`x86_64` / `arm64`）并拉取上游 `ShortDramaCat` 二进制，无需公网服务器或登录鉴权，适合家庭局域网自部署。

---

## 系统架构与上游来源

```text
iPhone Safari / PWA
        │  HTTP :9588
        ▼
┌───────────────────┐
│  ios-web (Nginx)  │  静态页面 (index.html / sw.js) + 反向代理
└─────────┬─────────┘
          ├── /api/ & /v5media/ ──▶ ┌──────────────────────────────────┐
          │                         │  v5-proxy (Node.js :9589)        │
          │                         │   ├─ V5Signer (Java :9590)       │
          │                         │   └─ ffmpeg 解密 +faststart 缓存  │
          │                         └────────────────┬─────────────────┘
          │                                          │ /api/call (推荐/搜索/榜单/详情)
          └── /media/ ───────────────────────────────▼─────────────────┐
                                    │  shortdramacat (:9587)           │
                                    │  上游二进制 (amd64 / arm64)       │
                                    └──────────────────────────────────┘
```

### 上游架构与二进制说明
- `shortdramacat` 服务使用上游项目 [kiroswu/hongguo-shortdramabox](https://github.com/kiroswu/hongguo-shortdramabox) 发布的 Linux 独立二进制（`v0.9.0`）：
  - `x86_64 / amd64`：`ShortDramaCat-v0.9.0-x86_64-linux`
  - `aarch64 / arm64`（含 Apple Silicon Mac Docker、树莓派、ARM NAS）：`ShortDramaCat-v0.9.0-aarch64-linux`
- 本仓库不直接打包上游二进制文件，`start.sh` 会在首次运行时按宿主机 Docker 架构自动下载并重命名为 `./ShortDramaCat`。

---

## 一键本地启动（人类用户）

### 1. 环境要求
- Docker + Docker Compose（macOS / Windows 安装 Docker Desktop，Linux / NAS 安装 Docker Engine）

### 2. 克隆并启动
```bash
git clone https://github.com/h2cker/hongguo-ios-pwa.git
cd hongguo-ios-pwa
chmod +x start.sh
./start.sh
```

启动完成后：
- 电脑访问：`http://127.0.0.1:9588`
- 手机访问：`http://<你的电脑或NAS局域网IP>:9588`
- iPhone 推荐用 **Safari** 打开后点击底部分享图标 -> **添加到主屏幕**，即可全屏 PWA 观看。

---

## 🤖 AI 自动部署指南 (For AI Agents)

> 本节与根目录 [AGENTS.md](./AGENTS.md) 专为 AI Coding Agent（如 Antigravity、Claude Code、Cursor、Codex 等）编写。当你代表用户部署本项目时，请严格按以下步骤执行并验证。

### Step 1: 检查环境依赖
```bash
docker --version && docker compose version
```
- 若未安装 Docker，请提示用户先安装 Docker Desktop（macOS/Windows）或 Docker Engine + Compose 插件（Linux/NAS），然后停止。

### Step 2: 识别容器架构并准备 `ShortDramaCat` 二进制
检查当前目录下是否存在 `./ShortDramaCat`。若不存在，识别 Docker 运行架构并从上游 Release 下载对应二进制：
```bash
ARCH="$(docker info --format '{{.Architecture}}' 2>/dev/null || uname -m)"
# x86_64 / amd64 -> ShortDramaCat-v0.9.0-x86_64-linux
# aarch64 / arm64 -> ShortDramaCat-v0.9.0-aarch64-linux
```
可直接运行 `./start.sh` 自动完成下载与启动；若用户网络访问 GitHub 受限，可先确认代理环境变量（`HTTPS_PROXY`）或手动下载放入 `./ShortDramaCat` 并赋予执行权限 `chmod +x ./ShortDramaCat`。

### Step 3: 构建并启动全部服务
```bash
mkdir -p ./data
docker compose up -d --build
```
等待 3~5 秒后检查容器状态，确保 `shortdramacat`、`shortdramacat-v5`、`shortdramacat-ios` 三个容器均为 `Up`：
```bash
docker compose ps
```

### Step 4: 端到端健康检查（必做）
依次验证首页、搜索接口、播放地址签名接口和 `206` 视频流切片：
```bash
curl -sSf -o /dev/null -w "WEB:%{http_code}\n" http://127.0.0.1:9588/
curl -sSf -X POST http://127.0.0.1:9588/api/call \
  -H "Content-Type: application/json" \
  -d '{"method":"Search","args":["重生","0"]}' | head -c 200
```
如 `WEB:200` 且 `/api/call` 返回 `"ok":true`，再用 Python 或 `curl` 取一集的 `videoId` 调 `PlayInfo` 并对 `/v5media/...` 发 `Range: bytes=0-1023` 请求，确认返回 `HTTP 206`。

### Step 5: 返回访问地址给用户
获取宿主机局域网 IP（macOS 用 `ipconfig getifaddr en0 || ipconfig getifaddr en1`，Linux 用 `hostname -I | awk '{print $1}'`），向用户输出：
- 本机地址：`http://127.0.0.1:9588`
- 局域网/iPhone 访问地址：`http://<LAN_IP>:9588`（提示用 Safari 添加到主屏幕）

### 常见排错
- **端口 `9588` 或 `9587` 被占用**：修改 `docker-compose.yml` 中对应 `ports` 左侧宿主机端口后重新执行 `docker compose up -d`。
- **`ShortDramaCat` 报 `exec format error`**：说明下载的二进制架构与 Docker 容器架构不一致，删除 `./ShortDramaCat` 后重新运行 `./start.sh`。
- **更新代码后手机端仍是旧页面**：`sw.js` 缓存未刷新时，确认已重新构建/重启并刷新 Safari 页面，或在 `sw.js` 递增 `CACHE` 版本号。

---

## 致谢与合规声明 (Acknowledgments & Disclaimer)

1. **上游依赖与致谢**：
   - 推荐流、榜单、搜索、剧集详情基础服务依托于开源/社区项目 [kiroswu/hongguo-shortdramabox](https://github.com/kiroswu/hongguo-shortdramabox) (`ShortDramaCat`)，其仓库未声明开源许可证（`license: null`），本项目仅通过一键脚本引导用户从其官方 Release 获取并运行，未在本仓库重新分发其二进制。
   - `v5-proxy/com/veyra/gybeyond/HongguoV5.java` 协议签名实现参考并借鉴自开源短剧聚合项目 **Veyra (`gybeyond`)**（其派生自 `MrSsg/HuangguoAPP-for-Andriod`），本项目在此基础上重构了并发设备池与 iOS 播放代理适配层。
2. **使用声明**：
   - 本项目仅供个人技术学习、iOS PWA 播放器与 HTTP Range 流媒体代理研究使用，请勿用于任何商业用途或大规模分发；请在遵守当地法律法规及上游项目条款的前提下使用。
