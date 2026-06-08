# backend/assets

接真机时，把 **scrcpy 官方 release** 的 `scrcpy-server` 文件放到这里并命名为 `scrcpy-server.jar`：

```
backend/assets/scrcpy-server.jar
```

- 下载地址：https://github.com/Genymobile/scrcpy/releases （取 `scrcpy-server-vX.Y` 文件）
- ⚠️ **版本必须与 `src/streaming/scrcpy-control.ts` 中的控制协议布局对齐**。
  本骨架按 scrcpy 2.x 实现；换其它大版本需同步核对 ControlMessage 格式与
  `AdbService.startScrcpyServer()` 的启动参数。
- 该 jar 不纳入版本库（见 `.gitignore`），请自行放置。

mock 模式（`MOCK_DEVICES=true`）下不需要此文件。
