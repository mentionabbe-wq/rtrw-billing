import { io, Socket } from 'socket.io-client';

export interface OnuStatusEvent {
  deviceId: string;
  dBm: number | null;
  health: 'ok' | 'warning' | 'critical';
}

let socket: Socket | null = null;

export function getMonitoringSocket(): Socket {
  if (!socket) {
    const base = import.meta.env.VITE_API_URL || '';
    socket = io(`${base}/monitoring`, {
      transports: ['websocket'],
      autoConnect: true,
    });
  }
  return socket;
}
