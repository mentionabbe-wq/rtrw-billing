import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import configuration from '@config/configuration';
import { ALL_ENTITIES } from '@database/entities';
import { CryptoModule } from '@common/crypto/crypto.module';
import { MonitoringModule } from '@modules/monitoring/monitoring.module';
import { AuthModule } from '@modules/auth/auth.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { MikrotikModule } from '@modules/mikrotik/mikrotik.module';
import { SnmpModule } from '@modules/snmp/snmp.module';
import { BillingModule } from '@modules/billing/billing.module';
import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module';
import { PackagesModule } from '@modules/packages/packages.module';
import { DashboardModule } from '@modules/dashboard/dashboard.module';
import { WhatsappModule } from '@modules/whatsapp/whatsapp.module';
import { AuditModule } from '@modules/audit/audit.module';
import { RoutersModule } from '@modules/routers/routers.module';
import { OltsModule } from '@modules/olts/olts.module';
import { UsersModule } from '@modules/users/users.module';
import { GenieacsModule } from '@modules/genieacs/genieacs.module';
import { SchedulerModule } from '@modules/scheduler/scheduler.module';
import { PortalModule } from '@modules/portal/portal.module';
import { HotspotModule } from '@modules/hotspot/hotspot.module';
import { PaymentWebhookModule } from '@modules/billing/payment-webhook.module';
import { IntegrationsModule } from '@modules/integrations/integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),

    // Serve built React SPA from ./client (production single-app mode).
    // API (/api) & WebSocket (/monitoring) are excluded so they aren't shadowed.
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'client'),
      // Jangan layani sebagai statis: REST API (/api) & transport Socket.IO (/socket.io).
      exclude: ['/api*', '/socket.io*'],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get('db.host'),
        port: cfg.get('db.port'),
        username: cfg.get('db.user'),
        password: cfg.get('db.pass'),
        database: cfg.get('db.name'),
        entities: ALL_ENTITIES,
        synchronize: false, // use migrations
      }),
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        connection: { host: cfg.get('redis.host'), port: cfg.get('redis.port') },
      }),
    }),

    CryptoModule,
    IntegrationsModule,
    MonitoringModule,
    AuthModule,
    CustomersModule,
    MikrotikModule,
    SnmpModule,
    WhatsappModule,
    BillingModule,
    SubscriptionsModule,
    PackagesModule,
    DashboardModule,
    AuditModule,
    RoutersModule,
    OltsModule,
    UsersModule,
    GenieacsModule,
    SchedulerModule,
    PortalModule,
    HotspotModule,
    PaymentWebhookModule,
  ],
})
export class AppModule {}
