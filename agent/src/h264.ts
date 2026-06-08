import { Frame } from './scrcpy';

const MTU = 1200; // RTP 负载最大字节，超过则 FU-A 分片
const PT_H264 = 102; // 与 webrtc.ts 里协商的 H264 payloadType 一致

/**
 * 把 scrcpy 的 Annex-B H264 帧打包成 RTP 包（原始字节 Buffer）。
 * 单 NAL 直接发；大 NAL 用 FU-A 分片。timestamp 取 90kHz 时钟。
 * 直接产出 RTP 字节交给 werift 的 track.writeRtp(Buffer)，不依赖其内部类型。
 */
export class H264Packetizer {
  private seq = Math.floor(Math.random() * 0xffff);

  constructor(private readonly ssrc: number, private readonly pt: number = PT_H264) {}

  packetize(frame: Frame): Buffer[] {
    const ts = Math.floor((frame.ptsUs * 90) / 1000) % 0x100000000;
    const nals = splitNALUnits(frame.data);
    const packets: Buffer[] = [];

    nals.forEach((nal, i) => {
      const lastNal = i === nals.length - 1;
      // 配置帧(SPS/PPS)不是可显示帧，不置 marker
      const frameEnd = lastNal && !frame.config;
      if (nal.length <= MTU) {
        packets.push(this.rtp(nal, ts, frameEnd));
      } else {
        // FU-A 分片
        const nalHeader = nal[0];
        const fnri = nalHeader & 0xe0;
        const type = nalHeader & 0x1f;
        const body = nal.subarray(1);
        const chunk = MTU - 2;
        for (let off = 0; off < body.length; off += chunk) {
          const part = body.subarray(off, off + chunk);
          const start = off === 0 ? 0x80 : 0;
          const isLast = off + chunk >= body.length;
          const end = isLast ? 0x40 : 0;
          const fu = Buffer.concat([Buffer.from([fnri | 28, start | end | type]), part]);
          packets.push(this.rtp(fu, ts, frameEnd && isLast));
        }
      }
    });
    return packets;
  }

  private rtp(payload: Buffer, ts: number, marker: boolean): Buffer {
    const header = Buffer.alloc(12);
    header[0] = 0x80; // version=2
    header[1] = (marker ? 0x80 : 0) | (this.pt & 0x7f);
    header.writeUInt16BE(this.seq, 2);
    header.writeUInt32BE(ts >>> 0, 4);
    header.writeUInt32BE(this.ssrc >>> 0, 8);
    this.seq = (this.seq + 1) & 0xffff;
    return Buffer.concat([header, payload]);
  }
}

/** 按起始码 (00 00 01 / 00 00 00 01) 切分 Annex-B 为各 NAL 单元（不含起始码） */
function splitNALUnits(data: Buffer): Buffer[] {
  const nals: Buffer[] = [];
  let i = 0;
  const n = data.length;
  let start = -1;
  while (i + 2 < n) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
      if (start >= 0) nals.push(data.subarray(start, i));
      i += 3;
      start = i;
    } else if (i + 3 < n && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) {
      if (start >= 0) nals.push(data.subarray(start, i));
      i += 4;
      start = i;
    } else {
      i++;
    }
  }
  if (start >= 0) nals.push(data.subarray(start));
  else if (nals.length === 0) nals.push(data); // 没找到起始码，整块当一个 NAL
  return nals;
}

export { PT_H264 };
