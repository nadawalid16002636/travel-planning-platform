/**
 * npm run seed: loads reference data (GEN-12) and the admin account (ACC-18), then exits.
 * The API also does this automatically on start; use this after replacing the CSV files.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ReferenceSeeder } from './reference/reference.seeder.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
try {
  const report = await app.get(ReferenceSeeder).run();
  console.log('Seed finished:', JSON.stringify({ ...report, warnings: report.warnings.length }));
  if (report.warnings.length) process.exitCode = 1;
} finally {
  await app.close();
}
