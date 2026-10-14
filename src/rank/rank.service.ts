import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { verifySubmitToken } from '../user/submit-token';
import { QueryRankDto } from './dto/query-rank.dto';
import { SubmitRankDto } from './dto/submit-rank.dto';
import { Rank } from './entities/rank.entity';
import { RankType } from './rank-type';

const LIST_LIMIT = 50;
const TIMELESS_DATE = '1970-01-01';

export interface RankEntry {
  rank: number;
  user_id: string;
  name: string;
  type: RankType;
  date: string | null;
  level_count: number;
  star_count: number;
  clear_count: number;
  duration_ms: number;
}

export interface SubmitRankResult {
  updated: boolean;
  record: RankEntry;
}

interface RankRow {
  user_id: string;
  name: string;
  type: string | number;
  rank_date: string | Date | null;
  level_count: string | number;
  star_count: string | number;
  clear_count: string | number;
  duration_ms: string | number;
}

interface UpsertResult {
  affectedRows?: number;
}

interface AheadCountRow {
  ahead: string | number;
}

/**
 * 排行榜（需求 D-1/D-2）：
 * - 对外结果兼容：GET /rank/list 返回前 50 名，本人不在前 50 且有成绩时追加本人
 *   记录与真实名次；POST /rank/submit 的 updated/record 语义不变。
 * - 有界查询：前 50 直接 LIMIT 50，本人名次用「排在本人之前的记录数 + 1」
 *   （与排序完全一致的同构条件），不再把整榜拉进应用内存。
 * - 并发安全：提交走数据库原子条件 upsert（MySQL ON DUPLICATE KEY UPDATE），
 *   按三榜 isBetter 规则条件更新，较差成绩不会覆盖最好成绩，
 *   updated=false 时不触碰 updated_at（不改变名次序）。
 * - 排序在「分数 → updated_at ASC」之后追加唯一键 id ASC 兜底，
 *   保证分页截断与本人名次在完全同分的记录之间也稳定一致。
 */
@Injectable()
export class RankService {
  constructor(
    @InjectRepository(Rank)
    private readonly ranks: Repository<Rank>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async submit(dto: SubmitRankDto, submitToken = ''): Promise<SubmitRankResult> {
    if (!submitToken) {
      throw new UnauthorizedException('排行榜提交凭证缺失');
    }
    const user = await this.users.findOne({
      where: { userId: dto.user_id },
      select: { userId: true, name: true, submitTokenHash: true },
    });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    if (!verifySubmitToken(submitToken, user.submitTokenHash)) {
      throw new UnauthorizedException('排行榜提交凭证无效');
    }

    const rankDate = this.resolveSubmitDate(dto);
    const payload = this.normalizeScore(dto);

    // 原子 upsert：affectedRows 1 = 新插入，2 = 条件命中更新，0 = 未变化。
    // 连接禁用 FOUND_ROWS，避免无变化时 affectedRows=1 冒充插入。
    // 按模式先判断旧主分数更新配对字段，最后单调更新主分数，避免跨局拼接成绩。
    // 未命中时列值保持不变，updated_at 上的 ON UPDATE 不会触发。
    const affected = await this.ranks.query(
      `INSERT INTO cat_world_rank
        (user_id, type, rank_date, level_count, star_count, clear_count, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        ${this.scoreUpdateAssignments(dto.type)}`,
      [
        dto.user_id,
        dto.type,
        rankDate,
        payload.levelCount,
        payload.starCount,
        payload.clearCount,
        payload.durationMs,
      ],
    );
    const updated = (Number((affected as UpsertResult)?.affectedRows ?? 0)) > 0;

    const record = await this.ranks.findOneBy({
      userId: dto.user_id,
      type: dto.type,
      rankDate,
    });
    if (!record) {
      // upsert 之后行必须存在；缺行说明数据库状态异常，按错误返回而不是伪造成功。
      throw new NotFoundException('排行记录不存在');
    }
    const entry = await this.buildEntry(record, user.name);
    return { updated, record: entry };
  }

  async list(query: QueryRankDto): Promise<RankEntry[]> {
    const rankDate = this.resolveQueryDate(query);
    const top = await this.topEntries(query.type, rankDate);

    if (!query.user_id) {
      return top;
    }

    const self = top.find((item) => item.user_id === query.user_id);
    if (self) {
      return top;
    }

    // 榜外本人：只取本人记录 + 计数查询名次，不加载整榜
    const record = await this.ranks.findOneBy({
      userId: query.user_id,
      type: query.type,
      rankDate,
    });
    if (!record) {
      return top;
    }
    const user = await this.users.findOneBy({ userId: query.user_id });
    if (!user) {
      return top;
    }
    const entry = await this.buildEntry(record, user.name);
    return [...top, entry];
  }

  /** 前 50 名：LIMIT 50 的有界查询，禁止 getRawMany() 拉取整榜。 */
  private async topEntries(type: RankType, rankDate: string): Promise<RankEntry[]> {
    const rows = await this.orderedQuery(type, rankDate)
      .limit(LIST_LIMIT)
      .getRawMany<RankRow>();
    return rows.map((row, index) => this.toEntry(row, index + 1));
  }

  /**
   * 本人名次：与排序完全一致的「排在本人之前的记录数 + 1」。
   * 排序为 榜内规则 → updated_at ASC → id ASC，条件逐项同构，
   * 打平、无记录、大名次场景与整榜行号一致（由单测覆盖）。
   */
  private async rankOf(record: Rank): Promise<number> {
    let before: string;
    if (record.type === RankType.Level) {
      // star DESC, level DESC, updated_at ASC, id ASC
      before = `(star_count > ?
          OR (star_count = ? AND level_count > ?)
          OR (star_count = ? AND level_count = ? AND updated_at < ?)
          OR (star_count = ? AND level_count = ? AND updated_at = ? AND id < ?))`;
    } else if (record.type === RankType.Endless) {
      // clear DESC, duration ASC, updated_at ASC, id ASC
      before = `(clear_count > ?
          OR (clear_count = ? AND duration_ms < ?)
          OR (clear_count = ? AND duration_ms = ? AND updated_at < ?)
          OR (clear_count = ? AND duration_ms = ? AND updated_at = ? AND id < ?))`;
    } else {
      // duration ASC, updated_at ASC, id ASC
      before = `(duration_ms < ?
          OR (duration_ms = ? AND updated_at < ?)
          OR (duration_ms = ? AND updated_at = ? AND id < ?))`;
    }
    // before 分支的占位符数量不同，参数按分支拼装（rankConditionParams）
    const branchParams = this.rankConditionParams(record);
    const rows = await this.ranks.query(
      `SELECT COUNT(*) AS ahead FROM cat_world_rank
       WHERE type = ? AND rank_date = ? AND ${before}`,
      [record.type, record.rankDate, ...branchParams],
    );
    const ahead = Number((rows as AheadCountRow[])?.[0]?.ahead ?? 0);
    return ahead + 1;
  }

  private rankConditionParams(record: Rank): Array<string | number | Date> {
    if (record.type === RankType.Level) {
      return [
        record.starCount,
        record.starCount, record.levelCount,
        record.starCount, record.levelCount, record.updatedAt,
        record.starCount, record.levelCount, record.updatedAt, record.id,
      ];
    }
    if (record.type === RankType.Endless) {
      return [
        record.clearCount,
        record.clearCount, record.durationMs,
        record.clearCount, record.durationMs, record.updatedAt,
        record.clearCount, record.durationMs, record.updatedAt, record.id,
      ];
    }
    return [
      record.durationMs,
      record.durationMs, record.updatedAt,
      record.durationMs, record.updatedAt, record.id,
    ];
  }

  /** MySQL 赋值按顺序执行：条件只在改动主分数之前计算一次。 */
  private scoreUpdateAssignments(type: RankType): string {
    if (type === RankType.Level) {
      return `level_count = IF(VALUES(star_count) > star_count OR (VALUES(star_count) = star_count AND VALUES(level_count) > level_count), VALUES(level_count), level_count),
        star_count = GREATEST(star_count, VALUES(star_count))`;
    }
    if (type === RankType.Endless) {
      return `duration_ms = IF(VALUES(clear_count) > clear_count OR (VALUES(clear_count) = clear_count AND VALUES(duration_ms) < duration_ms), VALUES(duration_ms), duration_ms),
        clear_count = GREATEST(clear_count, VALUES(clear_count))`;
    }
    return 'duration_ms = LEAST(duration_ms, VALUES(duration_ms))';
  }

  private async buildEntry(record: Rank, name: string): Promise<RankEntry> {
    const rank = await this.rankOf(record);
    return {
      rank,
      user_id: record.userId,
      name,
      type: record.type,
      date: this.formatDate(record.rankDate),
      level_count: record.levelCount,
      star_count: record.starCount,
      clear_count: record.clearCount,
      duration_ms: record.durationMs,
    };
  }

  private orderedQuery(type: RankType, rankDate: string) {
    const qb = this.ranks
      .createQueryBuilder('rank')
      .innerJoin(User, 'user', 'user.userId = rank.userId')
      .select([
        'rank.userId AS user_id',
        'user.name AS name',
        'rank.type AS type',
        'rank.rankDate AS rank_date',
        'rank.levelCount AS level_count',
        'rank.starCount AS star_count',
        'rank.clearCount AS clear_count',
        'rank.durationMs AS duration_ms',
      ])
      .where('rank.type = :type', { type });

    qb.andWhere('rank.rankDate = :rankDate', { rankDate });

    this.applyOrder(qb, type);
    // 唯一键兜底：同分且同更新时间的记录顺序稳定，分页截断与本人名次一致
    return qb.addOrderBy('rank.updatedAt', 'ASC').addOrderBy('rank.id', 'ASC');
  }

  private normalizeScore(dto: SubmitRankDto) {
    if (dto.type === RankType.Level) {
      this.requireNumber(dto.level_count, '关卡数量不能为空');
      this.requireNumber(dto.star_count, '星星数量不能为空');
      return {
        levelCount: dto.level_count,
        starCount: dto.star_count,
        clearCount: 0,
        durationMs: 0,
      };
    }

    if (dto.type === RankType.Endless) {
      this.requireNumber(dto.clear_count, '消除卡牌数不能为空');
      this.requireNumber(dto.duration_ms, '游戏用时不能为空');
      return {
        levelCount: 0,
        starCount: 0,
        clearCount: dto.clear_count,
        durationMs: dto.duration_ms,
      };
    }

    this.requireNumber(dto.duration_ms, '游戏用时不能为空');
    return {
      levelCount: 0,
      starCount: 0,
      clearCount: 0,
      durationMs: dto.duration_ms,
    };
  }

  private applyOrder(qb: SelectQueryBuilder<Rank>, type: RankType) {
    if (type === RankType.Level) {
      qb.orderBy('rank.starCount', 'DESC').addOrderBy('rank.levelCount', 'DESC');
      return;
    }
    if (type === RankType.Endless) {
      qb.orderBy('rank.clearCount', 'DESC').addOrderBy('rank.durationMs', 'ASC');
      return;
    }
    qb.orderBy('rank.durationMs', 'ASC');
  }

  private toEntry(row: RankRow, rank: number): RankEntry {
    return {
      rank,
      user_id: row.user_id,
      name: row.name,
      type: Number(row.type) as RankType,
      date: this.formatDate(row.rank_date),
      level_count: Number(row.level_count),
      star_count: Number(row.star_count),
      clear_count: Number(row.clear_count),
      duration_ms: Number(row.duration_ms),
    };
  }

  private resolveSubmitDate(dto: SubmitRankDto): string {
    if (dto.type !== RankType.Challenge) {
      return TIMELESS_DATE;
    }
    return this.normalizeDate(dto.date) ?? todayInShanghai();
  }

  private resolveQueryDate(query: QueryRankDto): string {
    if (query.type !== RankType.Challenge) {
      return TIMELESS_DATE;
    }
    if (!query.date) {
      throw new BadRequestException('超萌挑战榜必须传入日期');
    }
    return this.normalizeDate(query.date);
  }

  private normalizeDate(value?: string): string {
    if (!value) {
      throw new BadRequestException('日期格式必须是 YYYY-MM-DD');
    }
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (!match) {
      throw new BadRequestException('日期格式必须是 YYYY-MM-DD');
    }
    return match[1];
  }

  private formatDate(value: string | Date | null): string | null {
    if (!value) {
      return null;
    }
    const text =
      value instanceof Date
        ? new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(value)
        : this.normalizeDate(value);
    return text === TIMELESS_DATE ? null : text;
  }

  private requireNumber(
    value: number | undefined,
    message: string,
  ): asserts value is number {
    if (value === undefined) {
      throw new BadRequestException(message);
    }
  }
}

function todayInShanghai(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
