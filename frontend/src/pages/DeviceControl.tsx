import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DeviceScreen, DeviceScreenHandle } from '../components/DeviceScreen';
import { KEYCODE } from '../lib/control-protocol';

export default function DeviceControl() {
  const { serial = '' } = useParams();
  const navigate = useNavigate();
  const screenRef = useRef<DeviceScreenHandle>(null);
  const [status, setStatus] = useState('初始化…');
  const [log, setLog] = useState<string[]>([]);

  const pushLog = (line: string) =>
    setLog((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 50));

  return (
    <>
      <div className="topbar">
        <div className="row">
          <button onClick={() => navigate('/')}>← 返回</button>
          <h1 style={{ marginLeft: 12 }}>{decodeURIComponent(serial)}</h1>
        </div>
        <span className="muted">{status}</span>
      </div>

      <div className="control-layout">
        <div className="screen-wrap">
          <DeviceScreen ref={screenRef} serial={serial} onStatus={setStatus} onLog={pushLog} />
        </div>

        <div className="side">
          <h4>导航键</h4>
          <div className="btn-col">
            <button onClick={() => screenRef.current?.backOrScreenOn()}>返回 / 亮屏</button>
            <button onClick={() => screenRef.current?.sendKey(KEYCODE.HOME)}>主页 (HOME)</button>
            <button onClick={() => screenRef.current?.sendKey(KEYCODE.APP_SWITCH)}>多任务</button>
          </div>

          <h4>音量 / 电源</h4>
          <div className="btn-col">
            <button onClick={() => screenRef.current?.sendKey(KEYCODE.VOLUME_UP)}>音量 +</button>
            <button onClick={() => screenRef.current?.sendKey(KEYCODE.VOLUME_DOWN)}>音量 −</button>
            <button onClick={() => screenRef.current?.sendKey(KEYCODE.POWER)}>电源键</button>
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
