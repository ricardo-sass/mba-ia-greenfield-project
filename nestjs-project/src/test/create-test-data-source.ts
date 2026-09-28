import { DataSource, DataSourceOptions, MigrationInterface } from 'typeorm';

interface TestDataSourceOptions {
  synchronize?: boolean;
  migrations?: (new () => MigrationInterface)[];
}

export function createTestDataSource(
  entities: NonNullable<DataSourceOptions['entities']>,
  options: TestDataSourceOptions = {},
): DataSource {
  const { synchronize = true, migrations } = options;
  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'db',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'streamtube',
    password: process.env.DB_PASSWORD ?? 'streamtube',
    database: process.env.DB_DATABASE ?? 'streamtube',
    entities,
    synchronize,
    ...(migrations !== undefined && { migrations, migrationsRun: false }),
  });
}

export async function cleanAllTables(dataSource: DataSource): Promise<void> {
  const tables = [
    'video_processing_jobs',
    'video_upload_parts',
    'videos',
    'refresh_tokens',
    'verification_tokens',
    'channels',
    'users',
  ];

  for (const table of tables) {
    await dataSource.query(
      `DO $$
       BEGIN
         IF to_regclass('public.${table}') IS NOT NULL THEN
           EXECUTE 'DELETE FROM "${table}"';
         END IF;
       END $$;`,
    );
  }
}
