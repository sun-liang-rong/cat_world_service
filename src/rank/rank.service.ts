import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { User } from '../user/entities/user.entity';
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

@Injectable()
export class RankService {
  constructor(
    @InjectRepository(Rank)
    private readonly ranks: Repository<Rank>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async submit(dto: SubmitRankDto): Promise<SubmitRankResult> {
    const user = await this.users.findOneBy({ userId: dto.user_id });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const rankDate = this.resolveSubmitDate(dto);
    const payload = this.normalizeScore(dto);
    const existing = await this.ranks.findOneBy({
      userId: dto.user_id,
      type: dto.type,
      rankDate,
    });

    if (!existing) {
      const saved = await this.ranks.save(
        this.ranks.create({
          userId: dto.user_id,
          type: dto.type,
          rankDate,
          ...payload,
        }),
      );
      const record = await this.buildEntry(saved, user.name, dto.user_id);
      return { updated: true, record };
    }

    if (!this.isBetter(dto.type, payload, existing)) {
      const record = await this.buildEntry(existing, user.name, dto.user_id);
      return { updated: false, record };
    }

    existing.levelCount = payload.levelCount;
    existing.starCount = payload.starCount;
    existing.clearCount = payload.clearCount;
    existing.durationMs = payload.durationMs;
    const saved = await this.ranks.save(existing);
    const record = await this.buildEntry(saved, user.name, dto.user_id);
    return { updated: true, record };
  }

  async list(query: QueryRankDto): Promise<RankEntry[]> {
    const rankDate = this.resolveQueryDate(query);
    const rows = await this.orderedQuery(query.type, rankDate).getRawMany<RankRow>();
    const entries = rows.map((row, index) => this.toEntry(row, index + 1));
    const top = entries.slice(0, LIST_LIMIT);

    if (!query.user_id) {
      return top;
    }

    const self = entries.find((item) => item.user_id === query.user_id);
    if (!self) {
      return top;
    }
    if (self.rank <= LIST_LIMIT) {
      return top;
    }

    return [...top, self];
  }

  private async buildEntry(
    record: Rank,
    name: string,
    currentUserId: string,
  ): Promise<RankEntry> {
    const list = await this.list({
      type: record.type,
      date: this.formatDate(record.rankDate) ?? undefined,
      user_id: currentUserId,
    });
    const found = list.find((item) => item.user_id === record.userId);
    return (
      found ?? {
        rank: 0,
        user_id: record.userId,
        name,
        type: record.type,
        date: record.rankDate,
        level_count: record.levelCount,
        star_count: record.starCount,
        clear_count: record.clearCount,
        duration_ms: record.durationMs,
      }
    );
  }

  private orderedQuery(type: RankType, rankDate: string | null) {
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
    return qb.addOrderBy('rank.updatedAt', 'ASC');
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

  private isBetter(
    type: RankType,
    next: {
      levelCount: number;
      starCount: number;
      clearCount: number;
      durationMs: number;
    },
    current: Rank,
  ): boolean {
    if (type === RankType.Level) {
      if (next.starCount !== current.starCount) {
        return next.starCount > current.starCount;
      }
      return next.levelCount > current.levelCount;
    }

    if (type === RankType.Endless) {
      if (next.clearCount !== current.clearCount) {
        return next.clearCount > current.clearCount;
      }
      return next.durationMs < current.durationMs;
    }

    return next.durationMs < current.durationMs;
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
