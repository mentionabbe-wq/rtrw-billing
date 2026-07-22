import {
  Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Device, MapCable, MapNode, Olt, Router } from '@database/entities';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';

@Injectable()
export class MapService {
  constructor(
    @InjectRepository(MapNode) private readonly nodes: Repository<MapNode>,
    @InjectRepository(MapCable) private readonly cables: Repository<MapCable>,
    @InjectRepository(Olt) private readonly olts: Repository<Olt>,
    @InjectRepository(Router) private readonly routers: Repository<Router>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
  ) {}

  async all() {
    const [nodes, cables] = await Promise.all([
      this.nodes.find({ order: { id: 'ASC' } }),
      this.cables.find({ order: { id: 'ASC' } }),
    ]);

    // Status OTOMATIS dari perangkat tertaut (bila node.refType diisi).
    const [olts, routers, devices] = await Promise.all([
      this.olts.find(),
      this.routers.find(),
      this.devices.find({ where: { type: 'onu' }, relations: { subscription: true } }),
    ]);
    const oltById = new Map(olts.map((o) => [String(o.id), o]));
    const routerById = new Map(routers.map((r) => [String(r.id), r]));
    const devBySub = new Map(devices.filter((d) => d.subscription).map((d) => [String(d.subscription.id), d]));

    const live = (n: MapNode): string => {
      if (n.refType === 'olt' && n.refId) {
        const o = oltById.get(n.refId);
        return o ? (o.status === 'online' ? 'up' : 'down') : n.status;
      }
      if (n.refType === 'router' && n.refId) {
        const r = routerById.get(n.refId);
        return r ? (r.status === 'online' ? 'up' : 'down') : n.status;
      }
      if (n.refType === 'subscription' && n.refId) {
        const d = devBySub.get(n.refId);
        if (!d) return n.status;
        return (d.lastStatus === 'los' || d.lastStatus === 'offline') ? 'down' : 'up';
      }
      return n.status;
    };

    return {
      nodes: nodes.map((n) => ({ ...n, liveStatus: live(n) })),
      cables,
    };
  }

  // ── Nodes ──
  createNode(dto: Partial<MapNode>) {
    return this.nodes.save(this.nodes.create({
      type: dto.type ?? 'odp',
      name: dto.name ?? 'Titik baru',
      lat: dto.lat,
      lng: dto.lng,
      description: dto.description ?? null,
      capacityTotal: dto.capacityTotal ?? null,
      capacityUsed: dto.capacityUsed ?? null,
      color: dto.color ?? null,
      status: dto.status ?? 'up',
      refType: dto.refType ?? null,
      refId: dto.refId ?? null,
    }));
  }

  async updateNode(id: string, dto: Partial<MapNode>) {
    const n = await this.nodes.findOne({ where: { id } });
    if (!n) throw new NotFoundException('Node not found');
    Object.assign(n, {
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.lat !== undefined && { lat: dto.lat }),
      ...(dto.lng !== undefined && { lng: dto.lng }),
      ...(dto.description !== undefined && { description: dto.description || null }),
      ...(dto.capacityTotal !== undefined && { capacityTotal: dto.capacityTotal }),
      ...(dto.capacityUsed !== undefined && { capacityUsed: dto.capacityUsed }),
      ...(dto.color !== undefined && { color: dto.color || null }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.refType !== undefined && { refType: dto.refType || null }),
      ...(dto.refId !== undefined && { refId: dto.refId || null }),
    });
    return this.nodes.save(n);
  }

  async removeNode(id: string) {
    await this.nodes.delete(id);
    return { id, deleted: true };
  }

  // ── Cables ──
  createCable(dto: Partial<MapCable>) {
    return this.cables.save(this.cables.create({
      name: dto.name ?? 'Kabel baru',
      type: dto.type ?? 'distribution',
      cores: dto.cores ?? 12,
      path: dto.path ?? [],
      color: dto.color ?? null,
      status: dto.status ?? 'up',
      description: dto.description ?? null,
    }));
  }

  async updateCable(id: string, dto: Partial<MapCable>) {
    const c = await this.cables.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Cable not found');
    Object.assign(c, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.cores !== undefined && { cores: dto.cores }),
      ...(dto.path !== undefined && { path: dto.path }),
      ...(dto.color !== undefined && { color: dto.color || null }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.description !== undefined && { description: dto.description || null }),
    });
    return this.cables.save(c);
  }

  async removeCable(id: string) {
    await this.cables.delete(id);
    return { id, deleted: true };
  }
}

@ApiTags('map')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('map')
export class MapController {
  constructor(private readonly svc: MapService) {}

  @Get() all() { return this.svc.all(); }

  @Post('nodes') @Roles('admin', 'operator') createNode(@Body() dto: any) { return this.svc.createNode(dto); }
  @Patch('nodes/:id') @Roles('admin', 'operator') updateNode(@Param('id') id: string, @Body() dto: any) { return this.svc.updateNode(id, dto); }
  @Delete('nodes/:id') @Roles('admin', 'operator') removeNode(@Param('id') id: string) { return this.svc.removeNode(id); }

  @Post('cables') @Roles('admin', 'operator') createCable(@Body() dto: any) { return this.svc.createCable(dto); }
  @Patch('cables/:id') @Roles('admin', 'operator') updateCable(@Param('id') id: string, @Body() dto: any) { return this.svc.updateCable(id, dto); }
  @Delete('cables/:id') @Roles('admin', 'operator') removeCable(@Param('id') id: string) { return this.svc.removeCable(id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([MapNode, MapCable, Olt, Router, Device])],
  controllers: [MapController],
  providers: [MapService],
})
export class MapModule {}
