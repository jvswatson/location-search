import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './database.config.js';

// Standalone DataSource for the TypeORM CLI (`pnpm migration:run`) and the seed script.
export default new DataSource(dataSourceOptions());
