import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { isObjectIdOrHexString } from 'mongoose';

/** Supplied ONLY by P1's verified authentication guard, never request headers/body. */
export interface P2Principal {
  id: string;
  roles: string[];
  airlineIds: string[];
}
export interface P2AuthAdapter {
  authenticate(context: ExecutionContext): Promise<P2Principal | null>;
}

@Injectable()
export class P2Identity {
  adapter?: P2AuthAdapter;
}
@Injectable()
export class P2Access implements CanActivate {
  constructor(private readonly identity: P2Identity = new P2Identity()) {}
  // P1 registers a trusted adapter at bootstrap; absent integration denies all private access.
  register(adapter: P2AuthAdapter) {
    this.identity.adapter = adapter;
  }
  async canActivate(context: ExecutionContext) {
    const principal = await this.identity.adapter?.authenticate(context);
    if (
      !principal?.id ||
      !Array.isArray(principal.roles) ||
      !Array.isArray(principal.airlineIds)
    ) {
      throw new UnauthorizedException('P1 verified authentication is required');
    }
    context.switchToHttp().getRequest().p2Principal = principal;
    return true;
  }
  manage(user: P2Principal, airlineId?: string) {
    if (user.roles.includes('admin')) return;
    if (
      airlineId &&
      user.roles.includes('airline-moderator') &&
      user.airlineIds.length === 1 &&
      user.airlineIds.includes(String(airlineId))
    )
      return;
    throw new ForbiddenException(
      'Assigned airline moderator or administrator required',
    );
  }
  customer(user: P2Principal) {
    if (!user.roles.includes('user'))
      throw new ForbiddenException('Registered user required');
  }
}

export function objectId(id: string) {
  if (!isObjectIdOrHexString(id))
    throw new BadRequestException('Invalid MongoDB identifier');
  return id;
}

@Module({ providers: [P2Identity, P2Access], exports: [P2Identity, P2Access] })
export class P2AccessModule {}
