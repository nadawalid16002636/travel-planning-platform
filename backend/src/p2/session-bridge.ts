import { Injectable, OnModuleInit } from '@nestjs/common';
import { P2Access } from './access.js';
import { Role } from '../common/roles.js';

/** Runs after P1 global authentication; never trusts client identity fields. */
@Injectable()
export class P2SessionBridge implements OnModuleInit {
  constructor(private readonly access: P2Access) {}
  onModuleInit() {
    this.access.register({
      authenticate: async (context) => {
        const user = context.switchToHttp().getRequest().user;
        if (!user?.sub || user.mustChangePassword) return null;
        return {
          id: user.sub,
          roles: [user.role === Role.AIRLINE_MOD ? 'airline-moderator' : user.role],
          airlineIds: user.role === Role.AIRLINE_MOD && user.providerId ? [user.providerId] : [],
        };
      },
    });
  }
}
