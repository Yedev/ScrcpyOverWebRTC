import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { canAccessDevice } from '../users/user.model';
import { AppConfig } from '../config/configuration';
import { AgentRegistry } from './agent-registry.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class SignalingController {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** 浏览器拉取 ICE 服务器配置（STUN/TURN） */
  @Get('ice-servers')
  iceServers() {
    return { iceServers: this.config.get('iceServers', { infer: true }) };
  }

  /** 在线 P2P 设备（已注册的 agent），按用户权限过滤 */
  @Get('agents')
  agents(@CurrentUser() user: AuthPrincipal) {
    return this.registry.list().filter((a) => canAccessDevice(user, a.deviceId));
  }
}
