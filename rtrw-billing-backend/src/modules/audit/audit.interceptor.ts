import {
  CallHandler, ExecutionContext, Injectable, NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Records every successful mutating HTTP request to audit_logs.
 * Bodies are NOT stored (avoid leaking secrets) — only verb, route, actor, ip.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    if (ctx.getType() !== 'http' || !MUTATING.has(req.method)) {
      return next.handle();
    }

    const segments = (req.path || req.url || '').split('?')[0].split('/').filter(Boolean);
    // ['api', 'subscriptions', '12', 'suspend'] -> entity 'subscriptions'
    const entity = segments[1] ?? null;

    return next.handle().pipe(
      tap(() => {
        const res = ctx.switchToHttp().getResponse();
        this.audit.record({
          userId: req.user?.id ?? null,
          userEmail: req.user?.email ?? null,
          action: `${req.method} ${req.path || req.url}`,
          entity,
          entityId: req.params?.id ?? null,
          ip: req.ip ?? req.socket?.remoteAddress ?? null,
          statusCode: res?.statusCode ?? null,
        });
      }),
    );
  }
}
