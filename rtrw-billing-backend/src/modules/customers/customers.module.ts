import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Customer, Subscription, ServicePackage, Router } from '@database/entities';
import { MikrotikModule } from '@modules/mikrotik/mikrotik.module';
import { MIKROTIK_QUEUE } from '@modules/scheduler/queue.constants';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Subscription, ServicePackage, Router]),
    MikrotikModule,
    BullModule.registerQueue({ name: MIKROTIK_QUEUE }),
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
