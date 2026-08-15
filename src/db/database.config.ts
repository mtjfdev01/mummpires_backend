import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function databaseConfig(): TypeOrmModuleOptions {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is required. On Railway, link the Postgres service so this is injected automatically.',
    );
  }

  const isPrivate =
    url.includes('.railway.internal') ||
    url.includes('localhost') ||
    url.includes('127.0.0.1');

  return {
    type: 'postgres',
    url,
    ssl: isPrivate ? false : { rejectUnauthorized: false },
    autoLoadEntities: true,
    synchronize: true,
  };
}
