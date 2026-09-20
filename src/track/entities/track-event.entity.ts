import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('cat_world_track_event')
@Index('uk_track_event_id', ['eventId'], { unique: true })
@Index('idx_track_name_time', ['name', 'eventTime'])
@Index('idx_track_user_time', ['userId', 'eventTime'])
export class TrackEvent {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'event_id', type: 'varchar', length: 64 })
  eventId: string;

  @Column({ name: 'user_id', type: 'varchar', length: 32, default: '' })
  userId: string;

  @Column({ name: 'session_id', type: 'varchar', length: 64, default: '' })
  sessionId: string;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ name: 'event_time', type: 'datetime' })
  eventTime: Date;

  @Column({ type: 'varchar', length: 16, default: '' })
  platform: string;

  @Column({ name: 'app_version', type: 'varchar', length: 32, default: '' })
  appVersion: string;

  @Column({ type: 'json', nullable: true })
  props: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
