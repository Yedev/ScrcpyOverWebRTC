import { getToken } from '../api/client';
import { ControlMessage } from './control-protocol';

export interface VideoFrame {
  config: boolean;
  keyframe: boolean;
  seq: number;
  ptsMs: number;
  data: Uint8Array;
}

export interface StreamHandlers {
  onReady?: (info: { device: any; mock: boolean }) => void;
  onMockFrame?: (f: { seq: number; ts: number; w: number; h: number }) => void;
  onVideo?: (f: VideoFrame) => void;
  onError?: (msg: string) => void;
  onClose?: () => void;
}

/**
 * 与后端 /ws/stream 的连接封装。下行：文本 JSON(控制类) + 二进制(视频帧)。
 * 二进制帧头 12B: [type][keyframe][..2..][seq u32][ptsMs u32]，其后为 H264 数据。
 */
export class DeviceStream {
  private ws?: WebSocket;

  constructor(private readonly serial: string, private readonly handlers: StreamHandlers) {}

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws/stream?serial=${encodeURIComponent(
      this.serial,
    )}&token=${encodeURIComponent(getToken())}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (ev) => this.onMessage(ev);
    ws.onerror = () => this.handlers.onError?.('WebSocket 错误');
    ws.onclose = () => this.handlers.onClose?.();
    this.ws = ws;
  }

  private onMessage(ev: MessageEvent) {
    if (typeof ev.data === 'string') {
      const msg = JSON.parse(ev.data);
      switch (msg.type) {
        case 'ready':
          this.handlers.onReady?.({ device: msg.device, mock: msg.mock });
          break;
        case 'mock-frame':
          this.handlers.onMockFrame?.(msg);
          break;
        case 'error':
          this.handlers.onError?.(msg.message);
          break;
      }
      return;
    }
    // 二进制视频帧
    const buf = new Uint8Array(ev.data as ArrayBuffer);
    const view = new DataView(ev.data as ArrayBuffer);
    const config = view.getUint8(0) === 0;
    const keyframe = view.getUint8(1) === 1;
    const seq = view.getUint32(4);
    const ptsMs = view.getUint32(8);
    this.handlers.onVideo?.({ config, keyframe, seq, ptsMs, data: buf.subarray(12) });
  }

  send(msg: ControlMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.ws?.close();
    this.ws = undefined;
  }
}
