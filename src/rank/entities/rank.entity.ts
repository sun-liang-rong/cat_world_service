import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { RankType } from '../rank-type';

@Entity('cat_world_rank')
@Unique('uk_rank_user_type_date', ['userId', 'type', 'rankDate'])
export class Rank {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 32 })
  userId: string;

  @Column({ type: 'tinyint', unsigned: true })
  type: RankType;

  @Column({ name: 'rank_date', type: 'date', default: '1970-01-01' })
  rankDate: string;

  @Column({ name: 'level_count', type: 'int', unsigned: true, default: 0 })
  levelCount: number;

  @Column({ name: 'star_count', type: 'int', unsigned: true, default: 0 })
  starCount: number;

  @Column({ name: 'clear_count', type: 'int', unsigned: true, default: 0 })
  clearCount: number;

  @Column({ name: 'duration_ms', type: 'int', unsigned: true, default: 0 })
  durationMs: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
