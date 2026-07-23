import type { PrismaClient } from '@paper-trading/db';
import type { FastifyRequest } from 'fastify';

export class AuditService {
  constructor(private db: PrismaClient) {}

  async log(
    userId: string,
    action: string,
    resource: string,
    resourceId: string | null,
    details?: Record<string, unknown>,
    request?: FastifyRequest,
  ): Promise<void> {
    await this.db.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId: resourceId ?? undefined,
        details: (details as object) ?? undefined,
        ipAddress: request?.ip,
      },
    });
  }
}
