import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RankService } from './rank.service';
import { RankType } from './rank-type';

interface RankRecordLike {
  userId: string;
  type: RankType;
  rankDate: string;
  levelCount: number;
  starCount: number;
  clearCount: number;
  durationMs: number;
  updatedAt: Date;
  id: string;
}

interface CapturedCalls {
  take?: number;
  sql: string[];
  params: unknown[][];
}

/** 模拟 orderedQuery() 用到的 QueryBuilder 链与 ranks.query()。 */
function createRepos(options: {
  topRows?: Record<string, unknown>[];
  record?: RankRecordLike | null;
  user?: { userId: string; name: string } | null;
  upsertAffectedRows?: number;
  ahead?: number;
}) {
  const captured: CapturedCalls = { sql: [], params: [] };
  let takeLimit: number | null = null;
  const builder = {
    innerJoin() {
      return builder;
    },
    select() {
      return builder;
    },
    where() {
      return builder;
    },
    andWhere() {
      return builder;
    },
    orderBy() {
      return builder;
    },
    addOrderBy() {
      return builder;
    },
    take(limit: number) {
      captured.take = limit;
      takeLimit = limit;
      return builder;
    },
    async getRawMany() {
      // 与真实数据库的 LIMIT 行为一致：take(50) 后只返回前 50 行
      const rows = options.topRows ?? [];
      return takeLimit === null ? rows : rows.slice(0, takeLimit);
    },
  };
  const ranks = {
    createQueryBuilder: () => builder,
    findOneBy: async () => options.record ?? null,
    query: async (sql: string, params: unknown[]) => {
      captured.sql.push(sql);
      captured.params.push(params);
      if (sql.startsWith('SELECT COUNT(*)')) {
        return [{ ahead: options.ahead ?? 0 }];
      }
      return { affectedRows: options.upsertAffectedRows ?? 0 };
    },
  };
  const users = {
    findOneBy: async () => options.user ?? null,
  };
  return {
    service: new RankService(ranks as never, users as never),
    captured,
  };
}

function record(overrides: Partial<RankRecordLike> = {}): RankRecordLike {
  return {
    userId: 'u-out',
    type: RankType.Level,
    rankDate: '1970-01-01',
    levelCount: 7,
    starCount: 120,
    clearCount: 0,
    durationMs: 0,
    updatedAt: new Date('2026-09-20T08:00:00+08:00'),
    id: '42',
    ...overrides,
  };
}

const TOP_ROW = (index: number) => ({
  user_id: `u-${index}`,
  name: `玩家${index}`,
  type: 1,
  rank_date: '1970-01-01',
  level_count: index,
  star_count: 1000 - index,
  clear_count: 0,
  duration_ms: 0,
});

describe('RankService.list', () => {
  it('默认只返回前 50 名（LIMIT 有界查询），名次按行号 1..50', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => TOP_ROW(i + 1));
    const { service, captured } = createRepos({ topRows: rows });

    const entries = await service.list({ type: RankType.Level });

    expect(captured.take).toBe(50);
    expect(entries).toHaveLength(50);
    expect(entries[0]).toMatchObject({ rank: 1, user_id: 'u-1' });
    expect(entries[49].rank).toBe(50);
  });

  it('本人不在前 50 且有成绩 → 追加本人记录与真实名次（前面记录数 + 1）', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => TOP_ROW(i + 1));
    const { service, captured } = createRepos({
      topRows: rows,
      record: record(),
      user: { userId: 'u-out', name: '榜外人' },
      ahead: 37,
    });

    const entries = await service.list({ type: RankType.Level, user_id: 'u-out' });

    expect(entries).toHaveLength(51);
    const self = entries[50];
    expect(self).toMatchObject({ rank: 38, user_id: 'u-out', name: '榜外人' });
    // 名次查询必须是有界计数，不是整榜扫描
    expect(captured.sql[0]).toContain('SELECT COUNT(*) AS ahead');
  });

  it('本人就在前 50 → 不追加重复记录', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => TOP_ROW(i + 1));
    const { service } = createRepos({
      topRows: rows,
      record: record({ userId: 'u-3' }),
      user: { userId: 'u-3', name: '玩家3' },
    });

    const entries = await service.list({ type: RankType.Level, user_id: 'u-3' });

    expect(entries).toHaveLength(50);
    expect(entries.filter((entry) => entry.user_id === 'u-3')).toHaveLength(1);
  });

  it('本人无成绩 → 只返回前 50', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => TOP_ROW(i + 1));
    const { service } = createRepos({ topRows: rows, record: null });

    const entries = await service.list({ type: RankType.Level, user_id: 'nobody' });

    expect(entries).toHaveLength(50);
  });

  it('挑战榜缺日期 → 400', async () => {
    const { service } = createRepos({});
    await expect(service.list({ type: RankType.Challenge })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('RankService.submit', () => {
  const dto = {
    user_id: 'u-1',
    type: RankType.Level,
    level_count: 8,
    star_count: 150,
  };

  it('新插入（affectedRows=1）→ updated=true，record 名次 = 前面记录数 + 1', async () => {
    const { service, captured } = createRepos({
      user: { userId: 'u-1', name: '玩家1' },
      upsertAffectedRows: 1,
      record: record({ userId: 'u-1', starCount: 150, levelCount: 8 }),
      ahead: 9,
    });

    const result = await service.submit(dto);

    expect(result.updated).toBe(true);
    expect(result.record.rank).toBe(10);
    expect(captured.sql[0]).toContain('ON DUPLICATE KEY UPDATE');
    expect(captured.sql[0]).toContain('VALUES(star_count) > star_count');
  });

  it('条件未命中（affectedRows=0，较差成绩）→ updated=false', async () => {
    const { service } = createRepos({
      user: { userId: 'u-1', name: '玩家1' },
      upsertAffectedRows: 0,
      record: record({ userId: 'u-1' }),
      ahead: 0,
    });

    const result = await service.submit({ ...dto, star_count: 1 });

    expect(result.updated).toBe(false);
  });

  it('条件命中更新（affectedRows=2）→ updated=true', async () => {
    const { service } = createRepos({
      user: { userId: 'u-1', name: '玩家1' },
      upsertAffectedRows: 2,
      record: record({ userId: 'u-1', starCount: 999, levelCount: 9 }),
      ahead: 0,
    });

    const result = await service.submit({ ...dto, star_count: 999 });

    expect(result.updated).toBe(true);
  });

  it('用户不存在 → 404', async () => {
    const { service } = createRepos({ user: null });
    await expect(service.submit(dto)).rejects.toThrow(NotFoundException);
  });

  it('无尽榜 upsert 条件按 clear_count/duration_ms 规则拼装', async () => {
    const { service, captured } = createRepos({
      user: { userId: 'u-1', name: '玩家1' },
      upsertAffectedRows: 2,
      record: record({ userId: 'u-1', type: RankType.Endless, clearCount: 30, durationMs: 90_000 }),
      ahead: 2,
    });

    const result = await service.submit({
      user_id: 'u-1',
      type: RankType.Endless,
      clear_count: 30,
      duration_ms: 90_000,
    });

    expect(result.updated).toBe(true);
    expect(captured.sql[0]).toContain('VALUES(clear_count) > clear_count');
    expect(captured.sql[0]).toContain('VALUES(duration_ms) < duration_ms');
  });
});
