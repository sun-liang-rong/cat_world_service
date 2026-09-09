import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('cat_world_user')
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 32, unique: true })
  userId: string;

  @Column({ type: 'varchar', length: 16, unique: true })
  name: string;
}
