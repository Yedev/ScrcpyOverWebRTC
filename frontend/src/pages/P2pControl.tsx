import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WebRtcClient } from '../lib/webrtc-client';
import { touch, TouchAction, KEYCODE, ControlMessage } from '../lib/control-protocol';

export default function P2pControl() {
  const { serial = '' } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const clientRef = useRef<WebRtcClient | null>(null);
  const [status, setStatus] = useState('初始化…');
  const [log, setLog] = useState<string[]>([]);

  const pushLog = (l: string) =>
    setLog((p) => [`${new Date().toLocaleTimeString()}  ${l}`, ...p].slice(0, 50));

  useEffect(() => {
    const client = new WebRtcClient(serial, {
      onStream: (stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
        setStatus('P2P 已连接，视频播放中');
      },
      onState: setStatus,
      onLog: pushLog,
    });
    client.connect().catch((e) => setStatus(`连接失败: ${e.message}`));
    clientRef.current = client;
    setStatus('连接中…');
    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [serial]);

  function send(msg: ControlMessage) {
    clientRef.current?.sendControl(msg);
  }

  function deviceSize() {
    const v = videoRef.current;
    return { w: v?.videoWidth || 1080, h: v?.videoHeight || 1920 };
  }

  function toDevice(clientX: number, clientY: number) {
    const v = videoRef.current!;
    const rect = v.getBoundingClientRect();
    const { w, h } = deviceSize();
    // 按 object-fit: contain 计算视频在元素内的实际显示区域
    const scale = Math.min(rect.width / w, rect.height / h);
    const dispW = w * scale;
    const dispH = h * scale;
    const offX = (rect.width - dispW) / 2;
    const offY = (rect.height - dispH) / 2;
    const x = ((clientX - rect.left - offX) / dispW) * w;
    const y = ((clientY - rect.top - offY) / dispH) * h;
    return { x: Math.max(0, Math.min(w, x)), y: Math.max(0, Math.min(h, y)), w, h };
  }

  function onPointer(action: TouchAction, e: React.PointerEvent) {
    const { x, y, w, h } = toDevice(e.clientX, e.clientY);
    send(touch(action, e.pointerId & 0xff, x, y, w, h));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const map: Record<string, number> = {
      Enter: 66, Backspace: 67, Tab: 61, ArrowUp: 19, ArrowDown: 20, ArrowLeft: 21, ArrowRight: 22,
    };
    if (map[e.key]) {
      e.preventDefault();
      send({ type: 'key', action: 0, keycode: map[e.key] });
      send({ type: 'key', action: 1, keycode: map[e.key] });
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      send({ type: 'text', text: e.key });
    }
  }

  const sendKey = (kc: number) => {
    send({ type: 'key', action: 0, keycode: kc });
    send({ type: 'key', action: 1, keycode: kc });
  };

  return (
    <>
      <div className="topbar">
        <div className="row">
          <button onClick={() => navigate('/')}>← 返回</button>
          <h1 style={{ marginLeft: 12 }}>P2P · {decodeURIComponent(serial)}</h1>
        </div>
        <span className="muted">{status}</span>
      </div>

      <div className="control-layout">
        <div className="screen-wrap">
          <video
            ref={videoRef}
            className="screen-canvas"
            style={{ objectFit: 'contain' }}
            autoPlay
            playsInline
            muted
            tabIndex={0}
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              videoRef.current?.focus();
              onPointer(0, e);
            }}
            onPointerMove={(e) => e.buttons > 0 && onPointer(2, e)}
            onPointerUp={(e) => onPointer(1, e)}
            onPointerCancel={(e) => onPointer(1, e)}
            onKeyDown={onKeyDown}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>

        <div className="side">
          <h4>导航键</h4>
          <div className="btn-col">
            <button onClick={() => send({ type: 'backOrScreenOn', action: 0 })}>返回 / 亮屏</button>
            <button onClick={() => sendKey(KEYCODE.HOME)}>主页 (HOME)</button>
            <button onClick={() => sendKey(KEYCODE.APP_SWITCH)}>多任务</button>
          </div>
          <h4>音量 / 电源</h4>
          <div className="btn-col">
            <button onClick={() => sendKey(KEYCODE.VOLUME_UP)}>音量 +</button>
            <button onClick={() => sendKey(KEYCODE.VOLUME_DOWN)}>音量 −</button>
            <button onClick={() => sendKey(KEYCODE.POWER)}>电源键</button>
          </div>
          <h4>状态</h4>
          <div className="status-line">{status}</div>
          <h4>事件日志</h4>
          <div className="log">{log.join('\n')}</div>
        </div>
      </div>
    </>
  );
}
