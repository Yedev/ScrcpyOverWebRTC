import { Injectable, Logger } from '@nestjs/common';
import { WebSocket } from 'ws';

export interface RegisteredAgent {
  deviceId: string;
  name: string;
  ws: WebSocket;
  connectedAt: string;
}

/** 在线 P2P agent 注册表（deviceId → agent 连接） */
@Injectable()
export class AgentRegistry {
  private readonly logger = new Logger(AgentRegistry.name);
  private agents = new Map<string, RegisteredAgent>();

  register(deviceId: string, name: string, ws: WebSocket): RegisteredAgent {
    // 同 id 重连时踢掉旧连接
    const existing = this.agents.get(deviceId);
    if (existing && existing.ws !== ws) {
      try {
        existing.ws.close(4000, 'replaced by new agent');
      } catch {
        /* ignore */
      }
    }
    const agent: RegisteredAgent = { deviceId, name: name || deviceId, ws, connectedAt: new Date().toISOString() };
    this.agents.set(deviceId, agent);
    this.logger.log(`agent registered: ${deviceId} (${agent.name}) — total ${this.agents.size}`);
    return agent;
  }

  unregister(deviceId: string, ws: WebSocket) {
    const agent = this.agents.get(deviceId);
    if (agent && agent.ws === ws) {
      this.agents.delete(deviceId);
      this.logger.log(`agent unregistered: ${deviceId} — total ${this.agents.size}`);
    }
  }

  get(deviceId: string): RegisteredAgent | undefined {
    return this.agents.get(deviceId);
  }

  list(): Array<{ deviceId: string; name: string; connectedAt: string }> {
    return [...this.agents.values()].map(({ deviceId, name, connectedAt }) => ({ deviceId, name, connectedAt }));
  }
}
