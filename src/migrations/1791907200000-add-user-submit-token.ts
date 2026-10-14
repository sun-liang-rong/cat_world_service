import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** 旧身份没有可验证凭证，保留 NULL；客户端创建新匿名身份并重报本地成绩。 */
export class AddUserSubmitToken1791907200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('cat_world_user', 'submit_token_hash')) return;
    await queryRunner.addColumn('cat_world_user', new TableColumn({
      name: 'submit_token_hash',
      type: 'char',
      length: '64',
      isNullable: true,
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('cat_world_user', 'submit_token_hash')) {
      await queryRunner.dropColumn('cat_world_user', 'submit_token_hash');
    }
  }
}
