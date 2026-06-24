import { Module } from '@nestjs/common';
import { SnmpService } from './snmp.service';

@Module({
  providers: [SnmpService],
  exports: [SnmpService],
})
export class SnmpModule {}
