import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog } from './schemas/audit-log.schema.js';

/** GEN-07. Owner: P1. Call this for every important admin/moderator action. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLog>) {}

  async log(
    actorId: string,
    action: string, // e.g. 'ACCOUNT_SUSPENDED', 'POST_HIDDEN', 'FLIGHT_CANCELLED'
    targetType: string, // e.g. 'user', 'post', 'flight'
    targetId: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.model.create({ actorId: new Types.ObjectId(actorId), action, targetType, targetId, meta });
    } catch (err) {
      // auditing must never break the action itself
      this.logger.error(`Failed to write audit log ${action}`, err as Error);
    }
  }

  async list(page: number, limit: number, filter: Record<string, unknown> = {}) {
    const [data, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return { data, total };
  }
}
