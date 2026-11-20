# ShortDramaCat iOS PWA

专为 **iPhone / iPad Safari & PWA** 打造的局域网竖屏短剧播放器，配合本地代理实现视频流解密、`+faststart` 重封装与 `206` 分片续传，在家庭 NAS / Mac / Linux 上一键部署即可流畅观看。

## 功能特性

- **iOS 原生级竖屏体验**：支持上下滑换剧/切集、双 `<video>` 与内存 Blob 预加载、锁屏、倍速、长按 2x 快进、画面比例切换、选集抽屉与观看历史。
- **服务端视频加速代理 (`v5-proxy`)**：
  - 自动过滤 iOS 不支持的 `bytevc2 / h266 / vvc` 编码；
  - 服务端异步预下载并用 `ffmpeg` 解密及 `+faststart` 重封装；
  - 支持标准 `HTTP 206` Byte-Range 拖拽与秒播，内置热点剧集/搜索/播放信息缓存。
- **纯局域网开箱即用**：无需公网服务器、无需配置域名或登录鉴权，适合家庭网络自部署。

---

## 一键本地启动

### 1. 环境要求
- Docker + Docker Compose（macOS / Windows 安装 Docker Desktop，Linux / NAS 安装 Docker Engine）

### 2. 准备上游 `ShortDramaCat` 二进制
由于本项目不直接打包第三方二进制文件，请先从上游项目获取对应平台（Linux `amd64` 或 `arm64`，与你的 Docker 容器架构一致）的 `ShortDramaCat` 可执行文件，放到本仓库根目录并命名为 `ShortDramaCat`：
- 上游项目参考：[kiroswu/hongguo-shortdramabox](https://github.com/kiroswu/hongguo-shortdramabox)

### 3. 一键启动
```bash
chmod +x start.sh
./start.sh
```
或直接执行：
```bash
docker compose up -d --build
```

启动完成后：
- 电脑访问：`http://127.0.0.1:9588`
- 手机访问：`http://<你的电脑或NAS局域网IP>:9588`
- iPhone 推荐用 **Safari** 打开后点击底部分享图标 -> **添加到主屏幕**，即可获得全屏 App 体验。

---

## 目录说明

- `index.html` / `sw.js` / `manifest.json`：iOS PWA 前端与 Service Worker
- `nginx.conf`：本地静态资源与 `/api/`、`/v5media/`、`/media/` 反向代理配置
- `v5-proxy/`：Node.js 视频缓存解密代理 + Java 并发签名器 (`V5Signer.java` / `HongguoV5.java`)
- `docker-compose.yml` / `Dockerfile` / `start.sh`：一键本地容器编排与启动脚本

---

## 致谢与合规声明 (Acknowledgments & Disclaimer)

1. **上游依赖与致谢**：
   - 推荐流、榜单、搜索、剧集详情基础服务依托于开源/社区项目 [kiroswu/hongguo-shortdramabox](https://github.com/kiroswu/hongguo-shortdramabox) (`ShortDramaCat`)。
   - `v5-proxy/com/veyra/gybeyond/HongguoV5.java` 协议签名实现参考并借鉴自开源短剧聚合项目 **Veyra (`gybeyond`)**（其派生自 `MrSsg/HuangguoAPP-for-Andriod`），本项目在此基础上重构了并发设备池与 iOS 播放代理适配层。
2. **使用声明**：
   - 本项目仅供个人技术学习、iOS PWA 播放器与 HTTP Range 流媒体代理研究使用，请勿用于任何商业用途或大规模分发；请在遵守当地法律法规及开源协议的前提下使用。
