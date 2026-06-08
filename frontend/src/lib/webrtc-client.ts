import { getToken, api } from '../api/client';
import { ControlMessage } from './control-protocol';

export interface WebRtcHandlers {
  onStream?: (stream: MediaStream) => void;
  onState?: (state: string) => void;
  onLog?: (line: string) => void;
}

/**
 * 浏览器侧 P2P 客户端。agent 是 offerer（它加视频 track + 建控制 data channel），
 * 浏览器是 answerer：收到 offer → 回 answer，交换 ICE，随后视频经 <video> 原生播放。
 */
export class WebRtcClient {
  private pc?: RTCPeerConnection;
  private ws?: WebSocket;
  private controlChannel?: RTCDataChannel;
  private remoteSet = false;
  private pendingIce: RTCIceCandidateInit[] = [];

  constructor(private readonly serial: string, private readonly handlers: WebRtcHandlers) {}

  async connect() {
    const { iceServers } = await api<{ iceServers: RTCIceServer[] }>('/ice-servers');
    const pc = new RTCPeerConnection({ iceServers });
    this.pc = pc;

    pc.ontrack = (e) => {
      this.handlers.onLog?.(`track: ${e.track.kind}`);
      if (e.streams[0]) this.handlers.onStream?.(e.streams[0]);
    };
    // agent 创建的控制通道经此到达
    pc.ondatachannel = (e) => {
      if (e.channel.label === 'control') {
        this.controlChannel = e.channel;
        this.handlers.onLog?.('control channel ready');
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signal({ type: 'ice', candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      this.handlers.onState?.(pc.connectionState);
      this.handlers.onLog?.(`pc: ${pc.connectionState}`);
    };

    this.openSignaling();
  }

  private openSignaling() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws/signal?serial=${encodeURIComponent(
      this.serial,
    )}&token=${encodeURIComponent(getToken())}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => this.handlers.onState?.('信令已连接，等待 agent offer…');
    ws.onclose = () => this.handlers.onState?.('信令已关闭');
    ws.onerror = () => this.handlers.onLog?.('信令错误（设备 agent 可能离线）');
    ws.onmessage = (ev) => this.onSignal(JSON.parse(ev.data));
  }

  private signal(obj: any) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  private async onSignal(msg: any) {
    const pc = this.pc!;
    switch (msg.type) {
      case 'offer': {
        await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
        this.remoteSet = true;
        for (const c of this.pendingIce) await pc.addIceCandidate(c);
        this.pendingIce = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.signal({ type: 'answer', sdp: answer.sdp });
        this.handlers.onLog?.('offer 收到，已回 answer');
        break;
      }
      case 'ice': {
        if (!msg.candidate) break;
        if (this.remoteSet) await pc.addIceCandidate(msg.candidate);
        else this.pendingIce.push(msg.candidate);
        break;
      }
    }
  }

  sendControl(msg: ControlMessage) {
    if (this.controlChannel?.readyState === 'open') {
      this.controlChannel.send(JSON.stringify(msg));
    }
  }

  close() {
    this.ws?.close();
    this.pc?.close();
    this.ws = undefined;
    this.pc = undefined;
  }
}
