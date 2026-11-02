import { Injectable } from '@nestjs/common';

/** GEN-07. Owner: P1. Call this for every important admin/moderator action. */
@Injectable()
export class AuditService {
  async log(
    actorId: string,
    action: string, // e.g. 'ACCOUNT_SUSPENDED', 'POST_HIDDEN', 'FLIGHT_CANCELLED'
    targetType: string, // e.g. 'user', 'post', 'flight'
    targetId: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    // TODO P1: save to an AuditLog collection
  }
}
