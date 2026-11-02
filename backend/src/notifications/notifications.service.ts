import { Injectable } from '@nestjs/common';

/** In-app notifications. Owner: P4. */
@Injectable()
export class NotificationsService {
  async notify(userId: string, type: string, payload: Record<string, unknown> = {}): Promise<void> {
    // TODO P4: save a Notification document (userId, type, payload, read: false)
  }
}
