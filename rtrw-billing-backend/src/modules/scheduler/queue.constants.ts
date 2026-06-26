export const MIKROTIK_QUEUE = 'mikrotik';
export const MONITOR_QUEUE = 'monitor';

export type MikrotikJobName = 'suspend' | 'activate' | 'set_bandwidth' | 'provision';

export interface MikrotikJobData {
  subscriptionId: string;
  rateLimit?: string; // for set_bandwidth
}

export interface MonitorJobData {
  deviceId: string;
}

export const DEFAULT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};
