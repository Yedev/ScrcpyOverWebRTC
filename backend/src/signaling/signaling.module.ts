import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DevicesModule } from '../devices/devices.module';
import { AgentRegistry } from './agent-registry.service';
import { SignalingGateway } from './signaling.gateway';
import { SignalingController } from './signaling.controller';

@Module({
  imports: [AuthModule, DevicesModule],
  providers: [AgentRegistry, SignalingGateway],
  controllers: [SignalingController],
})
export class SignalingModule {}
