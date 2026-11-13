import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewsModule } from '../reviews/reviews.module.js';
import { AdminReportsController, ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import {
  ContentModeration,
  ContentModerationSchema,
  Report,
  ReportSchema,
} from './schemas/report.schema.js';

@Module({
  imports: [
    ReviewsModule,
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      { name: ContentModeration.name, schema: ContentModerationSchema },
    ]),
  ],
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
