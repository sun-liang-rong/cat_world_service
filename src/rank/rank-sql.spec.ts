import { DataSource } from 'typeorm';
import databaseConfig from '../config/database.config';
import migrationDataSource from '../data-source';
import { User } from '../user/entities/user.entity';
import { hashSubmitToken } from '../user/submit-token';
import { Rank } from './entities/rank.entity';
import { RankService } from './rank.service';
import { RankType } from './rank-type';
import { SubmitRankDto } from './dto/submit-rank.dto';

// Only unwrap Nest's config registration; test the actual returned database options.
jest.mock('@nestjs/config', () => ({
  registerAs: (_name: string, factory: () => unknown) => factory,
}));

class OfflineDataSource extends DataSource {
  async prepareMetadata(): Promise<void> { await this.buildMetadatas(); }
}

describe('real TypeORM leaderboard SQL', () => {
  const source = new OfflineDataSource({ type: 'mysql', database: 'offline_rank_test', entities: [User, Rank] });
  beforeAll(() => source.prepareMetadata());

  it.each([RankType.Level, RankType.Endless, RankType.Challenge])('type=%s joined raw query has a database LIMIT 50', async (type) => {
    const repository = source.getRepository(Rank);
    const builder = repository.createQueryBuilder('rank');
    jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(builder);
    let sql = '';
    jest.spyOn(builder, 'getRawMany').mockImplementation(async () => { sql = builder.getSql(); return []; });
    const service = new RankService(repository, source.getRepository(User));
    await service.list({ type, date: '2026-10-14' });
    expect(sql).toContain('INNER JOIN');
    expect(sql).toMatch(/ LIMIT 50$/);
    expect(sql).not.toContain('submit_token_hash');
    jest.restoreAllMocks();
  });

  it('keeps the credential hash hidden in ordinary user selects', () => {
    const column = source.getMetadata(User).findColumnWithPropertyName('submitTokenHash');
    expect(column?.isSelect).toBe(false);
    expect(column?.isNullable).toBe(true);
    expect(source.getRepository(User).createQueryBuilder('user').getSql()).not.toContain('submit_token_hash');
  });

  it('disables FOUND_ROWS for application and migration connections', () => {
    expect((databaseConfig() as { flags?: string[] }).flags).toEqual(['-FOUND_ROWS']);
    expect((migrationDataSource.options as { flags?: string[] }).flags).toEqual(['-FOUND_ROWS']);
  });
});

type Score = { level_count: number; star_count: number; clear_count: number; duration_ms: number };
const EMPTY_SCORE: Score = { level_count: 0, star_count: 0, clear_count: 0, duration_ms: 0 };
const TOKEN = 'a'.repeat(64);

/** Evaluate the captured SQL assignments in MySQL's left-to-right order, not a mock isBetter rule. */
function applyMysqlAssignments(sql: string, previous: Score, incoming: Score): Score {
  const clause = sql.split('ON DUPLICATE KEY UPDATE')[1].trim();
  const assignments: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < clause.length; i += 1) {
    if (clause[i] === '(') depth += 1;
    if (clause[i] === ')') depth -= 1;
    if (clause[i] === ',' && depth === 0) {
      assignments.push(clause.slice(start, i));
      start = i + 1;
    }
  }
  assignments.push(clause.slice(start));
  const row = { ...previous };
  for (const assignment of assignments) {
    const [, column, expression] = /^\s*(\w+)\s*=\s*(.+)$/s.exec(assignment)!;
    const js = expression
      .replace(/VALUES\((\w+)\)/g, 'incoming.$1')
      .replace(/\bIF\(/g, 'choose(')
      .replace(/\bGREATEST\(/g, 'Math.max(')
      .replace(/\bLEAST\(/g, 'Math.min(')
      .replace(/\bOR\b/g, '||').replace(/\bAND\b/g, '&&')
      .replace(/\s=\s/g, ' === ')
      .replace(/(?<![\w.])(level_count|star_count|clear_count|duration_ms)\b/g, 'row.$1');
    const evaluate = new Function('row', 'incoming', 'choose', `return (${js});`);
    row[column as keyof Score] = evaluate(row, incoming, (condition: boolean, yes: number, no: number) => condition ? yes : no) as number;
  }
  return row;
}

async function captureUpsert(type: RankType, incoming: Score): Promise<string> {
  let statement = '';
  const ranks = {
    query: async (sql: string) => {
      if (sql.startsWith('INSERT')) { statement = sql; return { affectedRows: 2 }; }
      return [{ ahead: 0 }];
    },
    findOneBy: async () => ({ id: '1', userId: 'u-test', type, rankDate: '2026-10-14', levelCount: incoming.level_count, starCount: incoming.star_count, clearCount: incoming.clear_count, durationMs: incoming.duration_ms, updatedAt: new Date() }),
  };
  const users = { findOne: async () => ({ userId: 'u-test', name: '测试玩家', submitTokenHash: hashSubmitToken(TOKEN) }) };
  const dto: SubmitRankDto = { user_id: 'u-test', type, date: '2026-10-14', ...incoming };
  await new RankService(ranks as never, users as never).submit(dto, TOKEN);
  return statement;
}

describe('atomic score pair replacement', () => {
  it.each([
    [RankType.Endless, { clear_count: 100, duration_ms: 60_000 }, { clear_count: 200, duration_ms: 120_000 }, { clear_count: 200, duration_ms: 120_000 }],
    [RankType.Endless, { clear_count: 200, duration_ms: 120_000 }, { clear_count: 100, duration_ms: 60_000 }, { clear_count: 200, duration_ms: 120_000 }],
    [RankType.Endless, { clear_count: 200, duration_ms: 120_000 }, { clear_count: 200, duration_ms: 90_000 }, { clear_count: 200, duration_ms: 90_000 }],
    [RankType.Endless, { clear_count: 200, duration_ms: 90_000 }, { clear_count: 200, duration_ms: 120_000 }, { clear_count: 200, duration_ms: 90_000 }],
    [RankType.Endless, { clear_count: 200, duration_ms: 90_000 }, { clear_count: 200, duration_ms: 90_000 }, { clear_count: 200, duration_ms: 90_000 }],
    [RankType.Level, { star_count: 120, level_count: 8 }, { star_count: 150, level_count: 7 }, { star_count: 150, level_count: 7 }],
    [RankType.Level, { star_count: 150, level_count: 7 }, { star_count: 120, level_count: 8 }, { star_count: 150, level_count: 7 }],
    [RankType.Level, { star_count: 150, level_count: 7 }, { star_count: 150, level_count: 8 }, { star_count: 150, level_count: 8 }],
    [RankType.Challenge, { duration_ms: 90_000 }, { duration_ms: 60_000 }, { duration_ms: 60_000 }],
    [RankType.Challenge, { duration_ms: 60_000 }, { duration_ms: 90_000 }, { duration_ms: 60_000 }],
  ])('mode=%s preserves a complete accepted score (%j -> %j)', async (type, previous, incoming, expected) => {
    const score = { ...EMPTY_SCORE, ...incoming };
    const sql = await captureUpsert(type, score);
    expect(applyMysqlAssignments(sql, { ...EMPTY_SCORE, ...previous }, score)).toEqual({ ...EMPTY_SCORE, ...expected });
  });
});
