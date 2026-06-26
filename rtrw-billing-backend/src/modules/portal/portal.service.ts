import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PortalSetting } from '@database/entities';

@Injectable()
export class PortalService {
  constructor(
    @InjectRepository(PortalSetting) private readonly repo: Repository<PortalSetting>,
  ) {}

  async get(): Promise<PortalSetting> {
    let row = await this.repo.findOne({ where: { id: 1 } });
    if (!row) {
      row = await this.repo.save(this.repo.create({ id: 1 }));
    }
    return row;
  }

  async update(dto: Partial<Omit<PortalSetting, 'id'>>): Promise<PortalSetting> {
    await this.repo.upsert({ id: 1, ...dto }, ['id']);
    return this.get();
  }
}
