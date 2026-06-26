import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortalSetting } from '@database/entities';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [TypeOrmModule.forFeature([PortalSetting])],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
