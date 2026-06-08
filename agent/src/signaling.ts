import WebSocket from 'ws';
import { AgentConfig } from './config';
import { WebRTCHub, Sender } from './webrtc';

/** agent → 后端 /ws/agent 的信令客户端，转发 offer/answer/ice。 */
export class Signaling implements Sender {
  private ws?: WebSocket;
  private backoff = 1000;

  constructor(private readonly cfg: AgentConfig, private readonly hub: WebRTCHub) {}

  send(obj: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  run() {
    this.connect();
  }

  private url(): string {
    const u = new URL(this.cfg.signalingUrl);
    u.searchParams.set('key', this.cfg.agentKey);
    u.searchParams.set('id', this.cfg.id);
    u.searchParams.set('name', this.cfg.name);
    return u.toString();
  }

  private connect() {
    const target = this.url();
    console.log(`[signaling] connecting to ${target.replace(/key=[^&]+/, 'key=***')}`);
    const ws = new WebSocket(target);
    this.ws = ws;

    ws.on('open', () => {
      this.backoff = 1000;
      console.log(`[signaling] connected, registered as device '${this.cfg.id}'`);
    });
    ws.on('message', (data) => this.dispatch(data.toString()));
    ws.on('close', () => this.reconnect('closed'));
    ws.on('error', (e) => {
      console.warn(`[signaling] error: ${e.message}`);
      // 'close' 会随后触发重连
    });
  }

  private reconnect(reason: string) {
    this.ws = undefined;
    console.log(`[signaling] ${reason}; reconnecting in ${this.backoff}ms`);
    setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 16000);
  }

  private dispatch(raw: string) {
    let m: any;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    switch (m.type) {
      case 'client-join':
        this.hub.onClientJoin(m.clientId).catch((e) => console.error('[hub] join error:', e));
        break;
      case 'answer':
        this.hub.onAnswer(m.clientId, m.sdp).catch((e) => console.error('[hub] answer error:', e));
        break;
      case 'ice':
        if (m.candidate) this.hub.onRemoteIce(m.clientId, m.candidate);
        break;
      case 'client-leave':
        this.hub.onClientLeave(m.clientId);
        break;
    }
  }
}
