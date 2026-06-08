import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { toSafeUser } from '../users/user.model';
import { AppConfig } from '../config/configuration';
import { JwtPayload, AuthPrincipal } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async login(username: string, password: string) {
    const user = await this.users.validate(username, password);
    if (!user) throw new UnauthorizedException('用户名或密码错误');
    const payload: JwtPayload = { sub: user.username, role: user.role };
    return {
      access_token: await this.jwt.signAsync(payload),
      user: toSafeUser(user),
    };
  }

  async register(username: string, password: string) {
    if (!this.config.get('allowPublicRegister', { infer: true })) {
      throw new BadRequestException('公开注册已关闭，请联系管理员开通账户');
    }
    return this.users.create(username, password, 'user', []);
  }

  /** 供 WebSocket 网关复用：校验裸 token 字符串，返回鉴权主体 */
  async verifyToken(token: string): Promise<AuthPrincipal | null> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const user = await this.users.findByUsername(payload.sub);
      if (!user) return null;
      return { username: user.username, role: user.role, assignedDevices: user.assignedDevices };
    } catch {
      return null;
    }
  }
}
