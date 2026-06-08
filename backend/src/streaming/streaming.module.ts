import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DevicesModule } from '../devices/devices.module';
import { StreamingGateway } from './streaming.gateway';

@Module({
  imports: [AuthModule, DevicesModule],
  providers: [StreamingGateway],
})
export class StreamingModule {}
