import { readFile } from 'fs/promises';
import { createConnection } from 'mongoose';
import 'dotenv/config';
import { AirportSchema } from './schemas';
import { AirportsService } from './airports.service';

/** Explicit CLI only. Input is a JSON array mapped from the official university dataset. */
export async function importAirports(file: string) {
  if (!file || !process.env.MONGODB_URI)
    throw new Error('Input JSON path and MONGODB_URI are required');
  const rows = JSON.parse(await readFile(file, 'utf8'));
  const connection = createConnection(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  try {
    await connection.asPromise();
    const model = connection.model('Airport', AirportSchema);
    const result = await new AirportsService(model).importReference(rows);
    console.log(
      `Airport import completed: ${result.upsertedCount} inserted; ${result.matchedCount} matched`,
    );
  } finally {
    await connection.close();
  }
}
if (require.main === module) {
  importAirports(process.argv[2]).catch((error: unknown) => {
    const category =
      error instanceof Error &&
      ['MongoServerSelectionError', 'MongooseServerSelectionError'].includes(
        error.name,
      )
        ? 'Atlas connectivity/server selection'
        : 'reference data, indexes or database access';
    console.error(
      `Airport import failed (${category}). No connection details were printed.`,
    );
    process.exitCode = 1;
  });
}
