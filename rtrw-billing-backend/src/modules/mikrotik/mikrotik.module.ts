import { Module } from '@nestjs/common';
import { MikrotikService } from './mikrotik.service';

@Module({
  providers: [MikrotikService],
  exports: [MikrotikService],
})
export class MikrotikModule {}
