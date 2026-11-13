import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type Connection } from 'mongoose';
import { paginate } from '../common/pagination.dto.js';
import { AuditService } from '../audit/audit.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';
import { ContentActionDto, CreateReportDto, ListReportsDto, ResolveReportDto } from './dto/report.dto.js';
import { ContentModeration, Report, type ReportTarget } from './schemas/report.schema.js';

const COLLECTIONS: Record<Exclude<ReportTarget, 'review'>, string[]> = {
  post: ['posts', 'blogposts'],
  comment: ['comments'],
  itinerary: ['itineraries'],
};

@Injectable()
export class ReportsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Report.name) private readonly reports: Model<Report>,
    @InjectModel(ContentModeration.name) private readonly moderation: Model<ContentModeration>,
    private readonly reviews: ReviewsService,
    private readonly audit: AuditService,
  ) {}

  async create(reporterId: string, dto: CreateReportDto) {
    await this.assertTarget(dto.targetType, dto.targetId);
    try {
      const report = await this.reports.create({
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason.trim(),
        status: 'open',
      });
      return report;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException('You have already reported this');
      }
      throw error;
    }
  }

  async list(query: ListReportsDto) {
    const filter = { status: query.status };
    const [data, total] = await Promise.all([
      this.reports
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      this.reports.countDocuments(filter),
    ]);
    return paginate(data, total, query);
  }

  async resolve(id: string, adminId: string, dto: ResolveReportDto) {
    const report = await this.reports.findById(id).exec();
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== 'open') throw new ConflictException('This report is already resolved');
    if (dto.action !== 'dismiss') await this.apply(report.targetType, report.targetId, dto.action, adminId);
    report.status = dto.action === 'dismiss' ? 'dismissed' : dto.action === 'hide' ? 'hidden' : 'deleted';
    report.resolvedBy = adminId;
    report.resolvedAt = new Date();
    await report.save();
    await this.audit.log(adminId, `REPORT_${dto.action.toUpperCase()}`, report.targetType, report.targetId, {
      reportId: String(report._id),
    });
    return report;
  }

  async moderate(type: ReportTarget, id: string, adminId: string, dto: ContentActionDto) {
    await this.assertTarget(type, id);
    await this.apply(type, id, dto.action, adminId);
    await this.reports.updateMany(
      { targetType: type, targetId: id, status: 'open' },
      { $set: { status: dto.action === 'hide' ? 'hidden' : 'deleted', resolvedBy: adminId, resolvedAt: new Date() } },
    );
    await this.audit.log(adminId, `CONTENT_${dto.action.toUpperCase()}`, type, id);
    return { targetType: type, targetId: id, action: dto.action };
  }

  /** P5 can ask whether a post, comment or itinerary is hidden or deleted. */
  async visibility(type: ReportTarget, id: string): Promise<'visible' | 'hidden' | 'deleted'> {
    const record = await this.moderation.findOne({ targetType: type, targetId: id }).lean();
    return record?.state ?? 'visible';
  }

  private async apply(type: ReportTarget, id: string, action: 'hide' | 'delete', actorId: string) {
    if (type === 'review') {
      await this.reviews.moderate(id, action);
    } else {
      const updated = await this.updateDocument(type, id, action);
      if (!updated) throw new NotFoundException('Content not found');
    }
    await this.moderation.findOneAndUpdate(
      { targetType: type, targetId: id },
      { $set: { state: action === 'hide' ? 'hidden' : 'deleted', actorId } },
      { upsert: true },
    );
  }

  private async assertTarget(type: ReportTarget, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Content not found');
    if (type === 'review') {
      const review = await this.reviews.findById(id);
      if (!review) throw new NotFoundException('Content not found');
      return;
    }
    for (const name of COLLECTIONS[type]) {
      const found = await this.connection.collection(name).findOne({ _id: new Types.ObjectId(id) });
      if (found) return;
    }
    throw new NotFoundException('Content not found');
  }

  private async updateDocument(type: Exclude<ReportTarget, 'review'>, id: string, action: 'hide' | 'delete') {
    const objectId = new Types.ObjectId(id);
    for (const name of COLLECTIONS[type]) {
      const collection = this.connection.collection(name);
      const exists = await collection.findOne({ _id: objectId });
      if (!exists) continue;
      if (action === 'delete') await collection.deleteOne({ _id: objectId });
      else await collection.updateOne({ _id: objectId }, { $set: { hidden: true } });
      return true;
    }
    return false;
  }
}
