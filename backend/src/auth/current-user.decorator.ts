import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthPrincipal } from './jwt.strategy';

/** 在 controller 里用 @CurrentUser() 直接拿到鉴权主体 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    return ctx.switchToHttp().getRequest().user;
  },
);
