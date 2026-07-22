export { User } from './user.entity';
export { ServicePackage } from './service-package.entity';
export { Router } from './router.entity';
export { Customer } from './customer.entity';
export { Subscription } from './subscription.entity';
export { Device } from './device.entity';
export { Invoice } from './invoice.entity';
export { Payment } from './payment.entity';
export { MikrotikSyncLog } from './sync-log.entity';
export { DeviceMetric } from './device-metric.entity';
export { Olt } from './olt.entity';
export { AuditLog } from './audit-log.entity';
export { PortalSetting } from './portal-setting.entity';
export { HotspotPackage } from './hotspot-package.entity';
export { HotspotVoucher } from './hotspot-voucher.entity';
export { IntegrationSetting } from './integration-setting.entity';
export { MapNode } from './map-node.entity';
export { MapCable } from './map-cable.entity';

import { User } from './user.entity';
import { ServicePackage } from './service-package.entity';
import { Router } from './router.entity';
import { Customer } from './customer.entity';
import { Subscription } from './subscription.entity';
import { Device } from './device.entity';
import { Invoice } from './invoice.entity';
import { Payment } from './payment.entity';
import { MikrotikSyncLog } from './sync-log.entity';
import { DeviceMetric } from './device-metric.entity';
import { Olt } from './olt.entity';
import { AuditLog } from './audit-log.entity';
import { PortalSetting } from './portal-setting.entity';
import { HotspotPackage } from './hotspot-package.entity';
import { HotspotVoucher } from './hotspot-voucher.entity';
import { IntegrationSetting } from './integration-setting.entity';
import { MapNode } from './map-node.entity';
import { MapCable } from './map-cable.entity';

export const ALL_ENTITIES = [
  User, ServicePackage, Router, Customer, Subscription,
  Device, Invoice, Payment, MikrotikSyncLog, DeviceMetric, Olt, AuditLog, PortalSetting,
  HotspotPackage, HotspotVoucher, IntegrationSetting, MapNode, MapCable,
];
