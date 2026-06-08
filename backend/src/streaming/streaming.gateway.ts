import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { Socket } from 'net';
import { AppConfig } from '../config/configuration';
import { AuthService } from '../auth/auth.service';
import { DevicesService } from '../devices/devices.service';
import { AdbService } from '../devices/adb.service';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { DeviceInfo } from '../devices/device.model';
import { DeviceSession, VideoFrame } from './device-session';
import { parseControlMessage } from './control-messages';

const WS_PATH = '/ws/stream';

/**
 * 原生 ws 服务器，挂在 HTTP server 的 /ws/stream 上。
 * 鉴权在 HTTP upgrade 阶段完成：token / 设备权限不通过则直接返回 401/403 并销毁
 * 套接字，根本不建立 WebSocket（未授权连接不会进入已连接状态）。
 *
 * 连接 URL: ws://host/ws/stream?token=<JWT>&serial=<deviceSerial>
 * 二进制下行帧格式: [12B 头 | H264 数据]
 *   [0] type(0=config,1=frame) [1] keyframe [2..3] 保留 [4..7] seq(u32) [8..11] ptsMs(u32)
 */
@Injectable()
export class StreamingGateway implements OnApplicationBootstrap {
  private readonly logger = new Logger(StreamingGateway.name);
  private wss?: WebSocketServer;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly auth: AuthService,
    private readonly devices: DevicesService,
    private readonly adb: AdbService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  onApplicationBootstrap() {
    const httpServer: Server = this.adapterHost.httpAdapter.getHttpServer();
    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const url = new URL(req.url ?? '', 'http://localhost');
      if (url.pathname !== WS_PATH) return; // 其它升级请求交给别的处理器

      void this.authorizeAndUpgrade(req, socket, head, url);
    });

    this.logger.log(`WebSocket stream gateway ready at ${WS_PATH}`);
  }

  private async authorizeAndUpgrade(req: IncomingMessage, socket: Socket, head: Buffer, url: URL) {
    const token = url.searchParams.get('token') ?? '';
    const serial = url.searchParams.get('serial') ?? '';

    const principal = await this.auth.verifyToken(token);
    if (!principal) return this.reject(socket, 401, 'Unauthorized');

    let device: DeviceInfo;
    try {
      device = this.devices.getForUser(principal, serial);
    } catch {
      return this.reject(socket, 403, 'Forbidden');
    }

    this.wss!.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, principal, device));
  }

  private reject(socket: Socket, code: number, message: string) {
    socket.write(`HTTP/1.1 ${code} ${message}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }

  private onConnection(ws: WebSocket, principal: AuthPrincipal, device: DeviceInfo) {
    this.logger.log(`stream open: user=${principal.username} device=${device.serial}`);

    const session = new DeviceSession(
      device,
      this.devices.isMock(device.serial),
      this.adb,
      {
        onVideo: (frame) => this.sendVideo(ws, frame),
        onText: (obj) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(obj)),
      },
      this.config.get('scrcpyServerRemote', { infer: true }),
      this.config.get('scrcpyServerLocal', { infer: true }),
    );

    ws.on('message', (data, isBinary) => {
      if (isBinary) return; // 上行控制只用文本 JSON
      const msg = parseControlMessage(data.toString());
      if (msg) session.sendControl(msg);
    });
    ws.on('close', () => session.stop());
    ws.on('error', () => session.stop());

    session.start().catch((e) => {
      this.logger.error(`session start failed: ${e.message}`);
      ws.close(1011, 'session error');
    });
  }

  private sendVideo(ws: WebSocket, frame: VideoFrame) {
    if (ws.readyState !== WebSocket.OPEN) return;
    const header = Buffer.alloc(12);
    header.writeUInt8(frame.config ? 0 : 1, 0);
    header.writeUInt8(frame.keyframe ? 1 : 0, 1);
    header.writeUInt32BE(frame.seq >>> 0, 4);
    header.writeUInt32BE(frame.ptsMs >>> 0, 8);
    ws.send(Buffer.concat([header, frame.data]), { binary: true });
  }
}
