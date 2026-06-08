import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { Socket } from 'net';
import { randomUUID } from 'crypto';
import { AppConfig } from '../config/configuration';
import { AuthService } from '../auth/auth.service';
import { DevicesService } from '../devices/devices.service';
import { canAccessDevice } from '../users/user.model';
import { AgentRegistry } from './agent-registry.service';

const AGENT_PATH = '/ws/agent';
const SIGNAL_PATH = '/ws/signal';

/**
 * WebRTC 信令中转。两个端点：
 *  - /ws/agent?key=<AGENT_KEY>&id=<deviceId>&name=<name>  设备 agent 接入并注册
 *  - /ws/signal?token=<JWT>&serial=<deviceId>             浏览器接入，向某设备发起 P2P
 *
 * 后端只转发 offer/answer/ice，不碰媒体——媒体在浏览器和 agent 之间 P2P 直连。
 * 消息形如 { type:'offer'|'answer'|'ice'|'client-join'|'client-leave', clientId, ... }
 */
@Injectable()
export class SignalingGateway implements OnApplicationBootstrap {
  private readonly logger = new Logger(SignalingGateway.name);
  private wss!: WebSocketServer;
  /** clientId → { 浏览器 ws, 目标 deviceId } */
  private clients = new Map<string, { ws: WebSocket; deviceId: string }>();

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly auth: AuthService,
    private readonly devices: DevicesService,
    private readonly registry: AgentRegistry,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  onApplicationBootstrap() {
    const httpServer: Server = this.adapterHost.httpAdapter.getHttpServer();
    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const { pathname } = new URL(req.url ?? '', 'http://localhost');
      if (pathname === AGENT_PATH) void this.handleAgentUpgrade(req, socket, head);
      else if (pathname === SIGNAL_PATH) void this.handleBrowserUpgrade(req, socket, head);
      // 其它路径(如 /ws/stream)交给别的网关处理
    });

    this.logger.log(`Signaling ready at ${AGENT_PATH} (agents) and ${SIGNAL_PATH} (browsers)`);
  }

  private reject(socket: Socket, code: number, msg: string) {
    socket.write(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }

  // ---------- agent 端 ----------
  private handleAgentUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
    const url = new URL(req.url ?? '', 'http://localhost');
    const key = url.searchParams.get('key') ?? '';
    const deviceId = url.searchParams.get('id') ?? '';
    const name = url.searchParams.get('name') ?? '';
    if (key !== this.config.get('agentKey', { infer: true })) return this.reject(socket, 401, 'Unauthorized');
    if (!deviceId) return this.reject(socket, 400, 'Missing id');

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.registry.register(deviceId, name, ws);
      ws.on('message', (data) => this.onAgentMessage(deviceId, data.toString()));
      ws.on('close', () => this.registry.unregister(deviceId, ws));
      ws.on('error', () => this.registry.unregister(deviceId, ws));
    });
  }

  /** agent → 后端：按 clientId 转发给对应浏览器 */
  private onAgentMessage(deviceId: string, raw: string) {
    const msg = safeParse(raw);
    if (!msg || !msg.clientId) return;
    const client = this.clients.get(msg.clientId);
    if (client && client.deviceId === deviceId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(raw);
    }
  }

  // ---------- 浏览器端 ----------
  private async handleBrowserUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
    const url = new URL(req.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token') ?? '';
    const deviceId = url.searchParams.get('serial') ?? '';

    const principal = await this.auth.verifyToken(token);
    if (!principal) return this.reject(socket, 401, 'Unauthorized');
    if (!canAccessDevice(principal, deviceId)) return this.reject(socket, 403, 'Forbidden');

    const agent = this.registry.get(deviceId);
    if (!agent) return this.reject(socket, 404, 'Agent offline');

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      const clientId = randomUUID();
      this.clients.set(clientId, { ws, deviceId });
      this.logger.log(`browser ${principal.username} → device ${deviceId} (client ${clientId})`);

      // 通知 agent 有新客户端，agent 据此创建 offer
      this.sendToAgent(deviceId, { type: 'client-join', clientId });

      ws.on('message', (data) => this.onBrowserMessage(clientId, deviceId, data.toString()));
      ws.on('close', () => {
        this.clients.delete(clientId);
        this.sendToAgent(deviceId, { type: 'client-leave', clientId });
      });
      ws.on('error', () => ws.close());
    });
  }

  /** 浏览器 → 后端：附上 clientId 转发给 agent */
  private onBrowserMessage(clientId: string, deviceId: string, raw: string) {
    const msg = safeParse(raw);
    if (!msg) return;
    this.sendToAgent(deviceId, { ...msg, clientId });
  }

  private sendToAgent(deviceId: string, obj: Record<string, unknown>) {
    const agent = this.registry.get(deviceId);
    if (agent && agent.ws.readyState === WebSocket.OPEN) {
      agent.ws.send(JSON.stringify(obj));
    }
  }
}

function safeParse(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
