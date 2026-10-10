import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Rank } from './rank/entities/rank.entity';
import { TrackEvent } from './track/entities/track-event.entity';
import { User } from './user/entities/user.entity';

/**
 * 迁移专用 DataSource（typeorm CLI 用）。
 * 运行：npm run migration:run / npm run migration:revert
 * 生产禁止依赖 DB_SYNC=true 自动改表（需求 D-2），表结构变更一律走这里的显式迁移。
 */
export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  timezone: '+08:00',
  charset: 'utf8mb4',
  entities: [User, Rank, TrackEvent],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  logging: false,
  synchronize: false,
});
