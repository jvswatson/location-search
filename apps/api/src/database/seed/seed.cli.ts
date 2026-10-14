import dataSource from '../data-source.js';
import { seedAirports } from './seeder.js';

/**
 * `node dist/database/seed/seed.cli.js [--if-empty]`
 * Runs pending migrations, then seeds airports. The container entrypoint uses --if-empty.
 */
async function main(): Promise<void> {
  const ifEmpty = process.argv.includes('--if-empty');
  await dataSource.initialize();
  try {
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    console.log(`migrations applied: ${applied.length}`);
    const outcome = await seedAirports(dataSource, { ifEmpty });
    console.log(
      outcome.seeded
        ? `seeded ${outcome.written} airports (${outcome.dropped} source rows dropped)`
        : 'airports table already populated; seed skipped',
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
