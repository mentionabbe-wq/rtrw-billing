import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HotspotPackage, HotspotVoucher, Router } from '@database/entities';
import { MikrotikModule } from '@modules/mikrotik/mikrotik.module';
import { CryptoModule } from '@common/crypto/crypto.module';
import { PaymentGatewayService } from '@modules/billing/payment-gateway.service';
import { HotspotService } from './hotspot.service';
import { HotspotController } from './hotspot.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([HotspotPackage, HotspotVoucher, Router]),
    MikrotikModule,
    CryptoModule,
  ],
  providers: [HotspotService, PaymentGatewayService],
  controllers: [HotspotController],
  exports: [HotspotService],
})
export class HotspotModule {}
