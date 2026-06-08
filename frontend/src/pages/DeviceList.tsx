import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../store/auth';
import { DeviceInfo } from '../types';

interface P2pAgent {
  deviceId: string;
  name: string;
  connectedAt: string;
}

export default function DeviceList() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [agents, setAgents] = useState<P2pAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(refresh = false) {
    setLoading(true);
    setError('');
    try {
      const [list, p2p] = await Promise.all([
        api<DeviceInfo[]>(refresh ? '/devices/refresh' : '/devices', { method: refresh ? 'POST' : 'GET' }),
        api<P2pAgent[]>('/agents').catch(() => [] as P2pAgent[]),
      ]);
      setDevices(list);
      setAgents(p2p);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <div className="topbar">
        <h1>CloudPhone</h1>
        <div className="row">
          <span className="muted">
            {user?.username} ({user?.role})
          </span>
          <button onClick={() => load(true)} disabled={loading}>
            刷新
          </button>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            退出
          </button>
        </div>
      </div>

      <div className="container">
        {agents.length > 0 && (
          <>
            <h2>P2P 设备 · WebRTC 直连 ({agents.length})</h2>
            <div className="grid" style={{ marginBottom: 28 }}>
              {agents.map((a) => (
                <div className="device-card" key={a.deviceId}>
                  <div className="row">
                    <h3>{a.name}</h3>
                    <div className="spacer" />
                    <span className="badge mock">P2P</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>{a.deviceId}</div>
                  <div className="muted" style={{ fontSize: 12, margin: '8px 0' }}>
                    agent 在线 · {new Date(a.connectedAt).toLocaleTimeString()}
                  </div>
                  <div className="row">
                    <span className="badge online">online</span>
                    <div className="spacer" />
                    <button className="primary" onClick={() => navigate(`/p2p/${encodeURIComponent(a.deviceId)}`)}>
                      P2P 连接
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <h2>设备 · WS 中继 ({devices.length})</h2>
        {error && <div className="error">{error}</div>}
        {loading && <p className="muted">加载中…</p>}
        {!loading && devices.length === 0 && (
          <p className="muted">没有可用设备。开启后端 MOCK_DEVICES=true 可注入虚拟设备体验。</p>
        )}
        <div className="grid">
          {devices.map((d) => (
            <div className="device-card" key={d.serial}>
              <div className="row">
                <h3>{d.name}</h3>
                <div className="spacer" />
                {d.mock && <span className="badge mock">MOCK</span>}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {d.serial}
              </div>
              <div className="muted" style={{ fontSize: 12, margin: '8px 0' }}>
                {d.model ?? '—'} · Android {d.androidVersion ?? '?'}
                {d.resolution ? ` · ${d.resolution.width}×${d.resolution.height}` : ''}
              </div>
              <div className="row">
                <span className={`badge ${d.status}`}>{d.status}</span>
                <div className="spacer" />
                <button
                  className="primary"
                  disabled={d.status !== 'online'}
                  onClick={() => navigate(`/device/${encodeURIComponent(d.serial)}`)}
                >
                  连接
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
