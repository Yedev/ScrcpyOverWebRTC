export interface AgentConfig {
  id: string;
  name: string;
  signalingUrl: string;
  agentKey: string;
  adbPath: string;
  serial: string;
  scrcpyLocalJar: string;
  scrcpyRemoteJar: string;
  scrcpyVersion: string;
  bitrate: number;
  maxFps: number;
  maxSize: number;
  stunUrl: string;
  turnUrl: string;
  turnUsername: string;
  turnCredential: string;
}

/** 解析配置：命令行 --key value 优先，其次环境变量，最后默认值 */
export function loadConfig(argv: string[]): AgentConfig {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = val;
    }
  }
  const pick = (cli: string, env: string, def: string) => args[cli] ?? process.env[env] ?? def;

  const id = pick('id', 'AGENT_ID', '');
  return {
    id,
    name: pick('name', 'AGENT_NAME', id),
    signalingUrl: pick('signaling', 'SIGNALING_URL', 'ws://127.0.0.1:3000/ws/agent'),
    agentKey: pick('key', 'AGENT_KEY', 'dev-agent-key'),
    adbPath: pick('adb', 'ADB_PATH', 'adb'),
    serial: pick('serial', 'ADB_SERIAL', ''),
    scrcpyLocalJar: pick('scrcpy-jar', 'SCRCPY_LOCAL_JAR', './scrcpy-server.jar'),
    scrcpyRemoteJar: pick('scrcpy-remote', 'SCRCPY_REMOTE_JAR', '/data/local/tmp/scrcpy-server.jar'),
    scrcpyVersion: pick('scrcpy-version', 'SCRCPY_VERSION', '2.4'),
    bitrate: parseInt(pick('bitrate', 'BITRATE', '4000000'), 10),
    maxFps: parseInt(pick('max-fps', 'MAX_FPS', '0'), 10),
    maxSize: parseInt(pick('max-size', 'MAX_SIZE', '0'), 10),
    stunUrl: pick('stun', 'STUN_URL', 'stun:stun.l.google.com:19302'),
    turnUrl: pick('turn', 'TURN_URL', ''),
    turnUsername: pick('turn-user', 'TURN_USERNAME', ''),
    turnCredential: pick('turn-pass', 'TURN_CREDENTIAL', ''),
  };
}
