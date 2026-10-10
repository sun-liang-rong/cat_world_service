import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 排行榜三榜查询索引（需求 D-2）。
 *
 * 列顺序与三榜排序逐榜对齐：WHERE 前缀 (type, rank_date) + ORDER BY 分数列 +
 * updated_at + id（唯一键兜底）。前 50 查询（LIMIT 50）和「本人名次」计数查询
 * 都走这些索引做有界读取，不再触发全榜扫描/文件排序。
 *
 * 注意：MySQL 8.0 支持列级 DESC 索引；上线前须用真实 MySQL 版本 EXPLAIN
 * 确认优化器确实选择了这些索引（需求 D-2 / 7.1 的基线要求）。
 * 回滚方案：down() 按相反顺序删除三个索引，不影响任何数据行。
 */
export class CreateRankBoardIndexes1730000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX `idx_rank_board_level` ON `cat_world_rank` (`type`, `rank_date`, `star_count` DESC, `level_count` DESC, `updated_at`, `id`)',
    );
    await queryRunner.query(
      'CREATE INDEX `idx_rank_board_endless` ON `cat_world_rank` (`type`, `rank_date`, `clear_count` DESC, `duration_ms`, `updated_at`, `id`)',
    );
    await queryRunner.query(
      'CREATE INDEX `idx_rank_board_challenge` ON `cat_world_rank` (`type`, `rank_date`, `duration_ms`, `updated_at`, `id`)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX `idx_rank_board_challenge` ON `cat_world_rank`');
    await queryRunner.query('DROP INDEX `idx_rank_board_endless` ON `cat_world_rank`');
    await queryRunner.query('DROP INDEX `idx_rank_board_level` ON `cat_world_rank`');
  }
}
