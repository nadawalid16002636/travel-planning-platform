// Owner: P1. Global so the AuthGuard, users and admin modules can use sessions without circular imports.
import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SessionsService } from './sessions.service.js';
import { Session, SessionSchema } from './schemas/session.schema.js';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Session.name, schema: SessionSchema }])],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
