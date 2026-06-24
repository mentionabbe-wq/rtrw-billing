import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

export interface OnuStatusEvent {
  deviceId: string;
  dBm: number | null;
  health: 'ok' | 'warning' | 'critical';
}

@WebSocketGateway({ namespace: '/monitoring', cors: { origin: '*' } })
export class MonitoringGateway {
  private readonly logger = new Logger(MonitoringGateway.name);

  @WebSocketServer()
  server: Server;

  emitOnuStatus(event: OnuStatusEvent) {
    this.server?.emit('onu:status', event);
  }
}
