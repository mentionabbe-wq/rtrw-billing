import { Injectable, Logger } from '@nestjs/common';
import { RouterOSAPI } from 'node-routeros';
import { CryptoService } from '@common/crypto/crypto.service';
import { Router } from '@database/entities';
import { Subscription } from '@database/entities';

/**
 * All actions are idempotent so the BullMQ worker can safely retry them.
 * Connections always use API-SSL (port 8729) with TLS.
 */
@Injectable()
export class MikrotikService {
  private readonly logger = new Logger(MikrotikService.name);

  constructor(private readonly crypto: CryptoService) {}

  private async connect(router: Router): Promise<RouterOSAPI> {
    const conn = new RouterOSAPI({
      host: router.host,
      user: router.apiUsername,
      password: this.crypto.decrypt(router.apiSecretEnc),
      port: router.apiPort || 8729,
      tls: { rejectUnauthorized: true },
      timeout: 8,
    });
    await conn.connect();
    return conn;
  }

  /** Disable PPPoE secret, drop active session, add to "isolir" address-list. */
  async suspend(router: Router, sub: Subscription): Promise<void> {
    const conn = await this.connect(router);
    try {
      await this.setSecretDisabled(conn, sub.pppoeUser, true);
      await this.dropActiveSession(conn, sub.pppoeUser);
      if (sub.ipStatic) {
        await conn
          .write('/ip/firewall/address-list/add', [
            '=list=isolir',
            `=address=${sub.ipStatic}`,
            `=comment=auto-suspend ${sub.pppoeUser}`,
          ])
          .catch(() => undefined); // already present
      }
    } finally {
      conn.close();
    }
  }

  /** Re-enable PPPoE secret and remove from "isolir" address-list. */
  async activate(router: Router, sub: Subscription): Promise<void> {
    const conn = await this.connect(router);
    try {
      await this.setSecretDisabled(conn, sub.pppoeUser, false);
      if (sub.ipStatic) {
        const items = await conn.write('/ip/firewall/address-list/print', [
          '?list=isolir',
          `?address=${sub.ipStatic}`,
        ]);
        for (const it of items) {
          await conn.write('/ip/firewall/address-list/remove', [`=.id=${it['.id']}`]);
        }
      }
    } finally {
      conn.close();
    }
  }

  /** Update Simple Queue bandwidth, e.g. when customer changes package. */
  async setBandwidth(router: Router, sub: Subscription, rateLimit: string): Promise<void> {
    const conn = await this.connect(router);
    try {
      const queues = await conn.write('/queue/simple/print', [`?name=${sub.pppoeUser}`]);
      if (queues.length) {
        await conn.write('/queue/simple/set', [
          `=.id=${queues[0]['.id']}`,
          `=max-limit=${rateLimit}`,
        ]);
      }
    } finally {
      conn.close();
    }
  }

  /** Liveness check used by the scheduler to update router.status. */
  async ping(router: Router): Promise<boolean> {
    try {
      const conn = await this.connect(router);
      await conn.write('/system/identity/print');
      conn.close();
      return true;
    } catch {
      return false;
    }
  }

  private async setSecretDisabled(conn: RouterOSAPI, user: string, disabled: boolean) {
    const secrets = await conn.write('/ppp/secret/print', [`?name=${user}`]);
    if (secrets.length) {
      await conn.write('/ppp/secret/set', [
        `=.id=${secrets[0]['.id']}`,
        `=disabled=${disabled ? 'yes' : 'no'}`,
      ]);
    }
  }

  private async dropActiveSession(conn: RouterOSAPI, user: string) {
    const active = await conn.write('/ppp/active/print', [`?name=${user}`]);
    for (const s of active) {
      await conn.write('/ppp/active/remove', [`=.id=${s['.id']}`]);
    }
  }
}
