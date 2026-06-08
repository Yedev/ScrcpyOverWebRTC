# CloudPhone — Web 端 Android 远控平台 (NestJS + React)

通过浏览器镜像并控制 Android 设备的自托管平台。架构参考了 [scrcpy](https://github.com/Genymobile/scrcpy) /
[ws-scrcpy](https://github.com/NetrisTV/ws-scrcpy) 的 **WebSocket 中继**模型，并借鉴了云手机项目的账户/设备管理与
动态参数设计，使用 **NestJS** 重写后端、**React** 重写前端，全部源码开放、可审计。

> 本仓库是一个**可运行的完整骨架**：鉴权、用户/设备管理、WebSocket 网关、ADB 封装、前端登录/设备列表/控制页
> 全部就位且能 `npm run`。真实设备视频流需要接入 Android 真机 + adb（见 `MOCK_DEVICES`），骨架内置 mock 模式
> 可在无真机时跑通"登录 → 设备列表 → 进入控制页 → 渲染循环 → 回传控制指令"的完整链路。

## 架构总览

```
┌──────────────┐   HTTPS/WSS    ┌────────────────────────────┐   ADB    ┌──────────────┐
│   React 前端  │ ◀────────────▶ │        NestJS 后端          │ ◀──────▶ │  Android 设备 │
│ (浏览器)      │                │                            │          │              │
│ - 登录/列表   │  REST: 鉴权/   │ - AuthModule (JWT+bcrypt)  │  push    │ scrcpy-server│
│ - 控制页      │    设备/用户    │ - UsersModule              │  jar →   │   .jar       │
│ - H264 解码   │                │ - DevicesModule (ADB封装)  │  start   │ (H264 编码)  │
│ - 指令回传    │  WS: 视频流/    │ - StreamingGateway (中继)  │  forward │              │
└──────────────┘    控制通道     └────────────────────────────┘  socket  └──────────────┘
```

- **视频**：设备上的 `scrcpy-server.jar` 编码 H.264 → 经 adb socket 到后端 → 后端经 WebSocket 二进制帧中转给浏览器 → 浏览器用 **WebCodecs** 解码渲染。
- **控制**：浏览器把触摸/按键封装成 **JSON** 指令经 WebSocket 发给后端 → 后端翻译成 scrcpy 二进制控制协议写回设备。
- **中继模型**：媒体经过后端（非 P2P）。局域网/隧道场景延迟低、部署简单；若需真·P2P 直连穿 CGNAT，见 `docs/ARCHITECTURE.md` 的 WebRTC 升级路线。

## 目录结构

```
.
├── backend/            # NestJS 后端（核心）
│   ├── src/
│   │   ├── auth/       # JWT 鉴权、角色守卫
│   │   ├── users/      # 用户管理（bcrypt，JSON 存储，可换 DB）
│   │   ├── devices/    # 设备注册表 + ADB 封装
│   │   ├── streaming/  # WebSocket 网关：视频中继 + 控制翻译
│   │   └── config/
│   └── assets/         # 放置 scrcpy-server.jar（见下）
├── frontend/           # React + Vite + TS
│   └── src/
│       ├── pages/      # Login / DeviceList / DeviceControl
│       ├── lib/        # H264 解码、控制协议、WS 客户端
│       └── store/
├── docs/ARCHITECTURE.md
└── docker-compose.yml
```

## 快速开始

### 前置
- Node.js ≥ 18
- （接真机时）宿主机安装 `adb` 并在 PATH 中

### 后端
```bash
cd backend
cp .env.example .env        # 按需修改；务必设置 ADMIN_PASSWORD
npm install
npm run start:dev           # 默认 http://localhost:3000
```
首次启动会在 `backend/data/users.json` 创建管理员。**默认管理员密码取自 `ADMIN_PASSWORD`，未设置则随机生成并打印到控制台**（不再像原项目那样硬编码 admin123）。

### 前端
```bash
cd frontend
npm install
npm run dev                 # 默认 http://localhost:5173，已代理到后端
```

### 无真机体验（mock 模式）
后端 `.env` 设 `MOCK_DEVICES=true`，会注入几台虚拟设备，控制页能跑通渲染+控制回传链路。

### 接真机
1. 把 scrcpy 官方 release 的 `scrcpy-server` 放到 `backend/assets/scrcpy-server.jar`（版本需与控制协议对齐，见 `docs/ARCHITECTURE.md`）。
2. `adb` 连上设备（USB 或 `adb connect <ip:5555>`）。
3. 后端设 `MOCK_DEVICES=false`，刷新设备列表即可看到真机。

## 安全说明（吸取原项目教训）
- ✅ 管理员密码不硬编码，默认随机/可由 env 指定；bcrypt 加盐多轮哈希存储。
- ✅ JWT 鉴权，WebSocket 连接同样校验 token；非 admin 仅能访问被分配的设备。
- ⚠️ 默认明文 HTTP/WS：生产请在前面套 TLS 反代（见 docs），或仅经 Tailscale/VPN 暴露。
- ⚠️ 设备控制权限高：请勿在不可信网络直接暴露后端端口。

详见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## License
MIT
