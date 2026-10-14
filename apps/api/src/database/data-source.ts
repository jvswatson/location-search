import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation.js';
import { dataSourceOptions, dbEnvFrom } from './database.config.js';

// Standalone DataSource for the TypeORM CLI (`pnpm migration:run`) and the seed script. It goes
// through the same validation as the app, so the container's first step (migrate + seed) fails
// fast on a missing production password instead of trying a default.
export default new DataSource(dataSourceOptions(dbEnvFrom(validateEnv(process.env))));
