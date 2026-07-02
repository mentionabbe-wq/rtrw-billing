import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationSetting } from '@database/entities';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([IntegrationSetting])],
  providers: [IntegrationsService],
  controllers: [IntegrationsController],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
