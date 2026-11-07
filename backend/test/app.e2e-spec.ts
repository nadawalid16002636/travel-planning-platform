import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

// The starter health test must not connect to the real Atlas database.
describe('AppController (isolated e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('GET /api', () =>
    request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!'));
});
