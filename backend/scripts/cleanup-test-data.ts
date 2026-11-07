/**
 * npm run cleanup:test             -> dry run: lists the test accounts that would be deleted
 * npm run cleanup:test -- --apply  -> deletes them and their sessions
 *
 * Only users whose email ends with "@test.local" are touched. Audit log entries are kept (GEN-07).
 * Reads MONGODB_URI from backend/.env (node --env-file); the URI is never printed.
 */
import mongoose from 'mongoose';

const TEST_EMAIL = /@test\.local$/i;
const apply = process.argv.includes('--apply');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set (run from backend/ with a .env file)');
  process.exit(1);
}

await mongoose.connect(uri);
try {
  const db = mongoose.connection.db!;
  const users = await db
    .collection('users')
    .find({ email: TEST_EMAIL }, { projection: { email: 1, role: 1, status: 1 } })
    .toArray();
  const ids = users.map((u) => u._id);
  const sessions = ids.length ? await db.collection('sessions').countDocuments({ userId: { $in: ids } }) : 0;

  console.log(`${apply ? 'Deleting' : 'Dry run, would delete'}: ${users.length} user(s), ${sessions} session(s)`);
  for (const u of users) console.log(`  ${u._id}  ${u.email}  (${u.role}, ${u.status})`);

  if (apply && ids.length) {
    const s = await db.collection('sessions').deleteMany({ userId: { $in: ids } });
    const r = await db.collection('users').deleteMany({ _id: { $in: ids }, email: TEST_EMAIL });
    console.log(`Deleted ${r.deletedCount} user(s) and ${s.deletedCount} session(s)`);
  } else if (!apply) {
    console.log('Nothing deleted. Re-run with "-- --apply" to delete.');
  }
} finally {
  await mongoose.disconnect();
}
