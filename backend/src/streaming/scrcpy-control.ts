/**
 * scrcpy 控制报文编码（ControlMessage）子集。
 * ⚠️ 报文格式随 scrcpy 版本变动；以下按 scrcpy 2.x 布局实现，
 *    必须与 backend/assets/scrcpy-server.jar 的版本对齐。
 *
 * 参考: com.genymobile.scrcpy.ControlMessageReader
 */
import { TouchMessage, KeyMessage, ScrollMessage } from './control-messages';

const TYPE_INJECT_KEYCODE = 0;
const TYPE_INJECT_TEXT = 1;
const TYPE_INJECT_TOUCH_EVENT = 2;
const TYPE_INJECT_SCROLL_EVENT = 3;
const TYPE_BACK_OR_SCREEN_ON = 4;

const POINTER_ID_MOUSE = 0xffffffffffffffffn; // -1 as u64

/** 1.0 → 0xffff 的定点压力 */
function fixedPointPressure(pressure: number): number {
  const p = Math.max(0, Math.min(1, pressure));
  return Math.round(p * 0xffff);
}

/** scrcpy 滚动量为 i16 定点：[-1,1] → [-32768,32767] */
function fixedPointScroll(v: number): number {
  const c = Math.max(-1, Math.min(1, v));
  return Math.round(c * (c < 0 ? 32768 : 32767));
}

export class ScrcpyControlEncoder {
  static keycode(msg: KeyMessage): Buffer {
    const buf = Buffer.alloc(14);
    buf.writeUInt8(TYPE_INJECT_KEYCODE, 0);
    buf.writeUInt8(msg.action, 1);
    buf.writeUInt32BE(msg.keycode >>> 0, 2);
    buf.writeUInt32BE((msg.repeat ?? 0) >>> 0, 6);
    buf.writeUInt32BE((msg.metaState ?? 0) >>> 0, 10);
    return buf;
  }

  static text(text: string): Buffer {
    const payload = Buffer.from(text, 'utf-8');
    const buf = Buffer.alloc(5 + payload.length);
    buf.writeUInt8(TYPE_INJECT_TEXT, 0);
    buf.writeUInt32BE(payload.length, 1);
    payload.copy(buf, 5);
    return buf;
  }

  static touch(msg: TouchMessage): Buffer {
    // [type(1)][action(1)][pointerId(8)][x(4)][y(4)][w(2)][h(2)][pressure(2)][actionButton(4)][buttons(4)]
    const buf = Buffer.alloc(32);
    let o = 0;
    buf.writeUInt8(TYPE_INJECT_TOUCH_EVENT, o); o += 1;
    buf.writeUInt8(msg.action, o); o += 1;
    const pid = msg.pointerId < 0 ? POINTER_ID_MOUSE : BigInt(msg.pointerId);
    buf.writeBigUInt64BE(pid, o); o += 8;
    buf.writeInt32BE(Math.round(msg.x), o); o += 4;
    buf.writeInt32BE(Math.round(msg.y), o); o += 4;
    buf.writeUInt16BE(msg.w, o); o += 2;
    buf.writeUInt16BE(msg.h, o); o += 2;
    const pressure = msg.action === 1 ? 0 : fixedPointPressure(msg.pressure ?? 1);
    buf.writeUInt16BE(pressure, o); o += 2;
    buf.writeUInt32BE(0, o); o += 4; // actionButton
    buf.writeUInt32BE(msg.action === 0 || msg.action === 2 ? 1 : 0, o); o += 4; // buttons (primary)
    return buf;
  }

  static scroll(msg: ScrollMessage): Buffer {
    // [type(1)][x(4)][y(4)][w(2)][h(2)][hScroll(2)][vScroll(2)][buttons(4)]
    const buf = Buffer.alloc(21);
    let o = 0;
    buf.writeUInt8(TYPE_INJECT_SCROLL_EVENT, o); o += 1;
    buf.writeInt32BE(Math.round(msg.x), o); o += 4;
    buf.writeInt32BE(Math.round(msg.y), o); o += 4;
    buf.writeUInt16BE(msg.w, o); o += 2;
    buf.writeUInt16BE(msg.h, o); o += 2;
    buf.writeInt16BE(fixedPointScroll(msg.hScroll), o); o += 2;
    buf.writeInt16BE(fixedPointScroll(msg.vScroll), o); o += 2;
    buf.writeUInt32BE(0, o); o += 4;
    return buf;
  }

  static backOrScreenOn(action: number): Buffer {
    const buf = Buffer.alloc(2);
    buf.writeUInt8(TYPE_BACK_OR_SCREEN_ON, 0);
    buf.writeUInt8(action, 1);
    return buf;
  }
}
