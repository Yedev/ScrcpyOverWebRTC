import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { UsersService } from '../users/users.service';

export interface JwtPayload {
  sub: string; // username
  role: string;
}

/** 经鉴权后挂到 req.user 上的主体 */
export interface AuthPrincipal {
  username: string;
  role: 'admin' | 'user';
  assignedDevices: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt', { infer: true }).secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthPrincipal> {
    const user = await this.users.findByUsername(payload.sub);
    if (!user) throw new UnauthorizedException('用户已不存在');
    return { username: user.username, role: user.role, assignedDevices: user.assignedDevices };
  }
}
