import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  'postgresql://postgres:QuUERBaVzqFdrILmvQSaMbijEEylqgIi@postgres.railway.internal:5432/railway';

export function databaseConfig(): TypeOrmModuleOptions {
  const isPrivate =
    DATABASE_URL.includes('.railway.internal') ||
    DATABASE_URL.includes('localhost') ||
    DATABASE_URL.includes('127.0.0.1');

  return {
    type: 'postgres',
    url: DATABASE_URL,
    ssl: isPrivate ? false : { rejectUnauthorized: false },
    autoLoadEntities: true,
    synchronize: true,
  };
}
