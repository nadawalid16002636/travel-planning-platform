import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PaymentsService } from './payments.service.js';

@Injectable()
export class P4Worker {
  private readonly logger = new Logger(P4Worker.name);
  private running = false;

  constructor(private readonly payments: PaymentsService) {}

  @Interval(15_000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.payments.maintain();
    } catch (error) {
      this.logger.error('P4 payment maintenance failed', error as Error);
    } finally {
      this.running = false;
    }
  }
}
