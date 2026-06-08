import { RTCPeerConnection, MediaStreamTrack, RTCRtpCodecParameters, RTCIceCandidate } from 'werift';
import { Scrcpy, Frame } from './scrcpy';
import { H264Packetizer, PT_H264 } from './h264';

export interface Sender {
  send(obj: any): void;
}

export interface IceServer {
  urls: string;
  username?: string;
  credential?: string;
}

interface Peer {
  clientId: string;
  pc: RTCPeerConnection;
  track: MediaStreamTrack;
  pkt: H264Packetizer;
}

/**
 * 管理与浏览器的 P2P 连接。单观看者模式：一台设备同时服务一个浏览器
 * （远控的常见场景），新连接到来会替换旧连接，逻辑简单且稳健。
 */
export class WebRTCHub {
  private current?: Peer;
  private sender!: Sender;

  constructor(private readonly scrcpy: Scrcpy, private readonly iceServers: IceServer[]) {}

  setSender(s: Sender) {
    this.sender = s;
  }

  /** 帧泵调用：把一帧 H264 打成 RTP 写进当前 peer 的 track（werift 自动改写 ssrc/pt）。*/
  writeFrame(frame: Frame) {
    const p = this.current;
    if (!p) return;
    for (const buf of p.pkt.packetize(frame)) {
      try {
        p.track.writeRtp(buf);
      } catch {
        /* peer 尚未连通时忽略 */
      }
    }
  }

  async onClientJoin(clientId: string) {
    this.closeCurrent();

    const h264 = new RTCRtpCodecParameters({
      mimeType: 'video/H264',
      clockRate: 90000,
      payloadType: PT_H264,
      rtcpFeedback: [{ type: 'nack' }, { type: 'nack', parameter: 'pli' }, { type: 'goog-remb' }],
      parameters: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
    });
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, codecs: { video: [h264] } });

    const track = new MediaStreamTrack({ kind: 'video' });
    pc.addTransceiver(track, { direction: 'sendonly' });

    const dc = pc.createDataChannel('control');
    dc.onMessage.subscribe((data) => {
      this.scrcpy.sendControl(typeof data === 'string' ? Buffer.from(data) : data);
    });

    pc.onIceCandidate.subscribe((c) => {
      if (c) this.sender.send({ type: 'ice', clientId, candidate: c.toJSON() });
    });
    pc.connectionStateChange.subscribe((s) => {
      console.log(`[webrtc] client ${short(clientId)} -> ${s}`);
      if (s === 'failed' || s === 'closed') this.onClientLeave(clientId);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.sender.send({ type: 'offer', clientId, sdp: pc.localDescription!.sdp });

    this.current = {
      clientId,
      pc,
      track,
      pkt: new H264Packetizer(Math.floor(Math.random() * 0xffffffff)),
    };
    console.log(`[webrtc] client ${short(clientId)} joined, offer sent`);
  }

  async onAnswer(clientId: string, sdp: string) {
    if (this.current?.clientId !== clientId) return;
    await this.current.pc.setRemoteDescription({ type: 'answer', sdp });
    console.log(`[webrtc] client ${short(clientId)} answer applied`);
  }

  async onRemoteIce(clientId: string, cand: { candidate: string; sdpMid?: string; sdpMLineIndex?: number }) {
    if (this.current?.clientId !== clientId) return;
    try {
      await this.current.pc.addIceCandidate(new RTCIceCandidate(cand));
    } catch (e) {
      console.warn('[webrtc] addIceCandidate failed:', (e as Error).message);
    }
  }

  onClientLeave(clientId: string) {
    if (this.current?.clientId === clientId) this.closeCurrent();
  }

  private closeCurrent() {
    if (this.current) {
      try {
        this.current.pc.close();
      } catch {
        /* ignore */
      }
      this.current = undefined;
    }
  }
}

function short(id: string): string {
  return id.slice(0, 8);
}
