import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrackBatchDto } from './dto/track-batch.dto';
import { TrackEvent } from './entities/track-event.entity';
import {
  isTrackEventName,
  resolveEventTime,
  sanitizeTrackProps,
} from './track-events';

/**
 * 入库回执语义（需求 B-3）：
 * - inserted   = 数据库本次实际新插入的事件数（以受影响行数核算，不用待插数组长度）；
 * - duplicated = 批内重复 event_id + 与库内既有 event_id 冲突（INSERT IGNORE 跳过）；
 * - dropped    = 非法/未知事件等非重复拒收数；
 * - 正常处理批次恒满足 inserted + duplicated + dropped = 输入事件数；
 * - accepted 为过渡期兼容字段（恒等于 inserted），已废弃，后续移除。
 */
export interface TrackIngestResult {
  inserted: number;
  duplicated: number;
  dropped: number;
  /** @deprecated 兼容旧调用方，恒等于 inserted。 */
  accepted: number;
}

interface InsertAffectedRows {
  affectedRows?: number;
}

@Injectable()
export class TrackService {
  private readonly logger = new Logger(TrackService.name);

  constructor(
    @InjectRepository(TrackEvent)
    private readonly events: Repository<TrackEvent>,
  ) {}

  async ingest(dto: TrackBatchDto): Promise<TrackIngestResult> {
    const now = new Date();
    const userId = (dto.user_id ?? '').trim().slice(0, 32);
    const sessionId = dto.session_id.trim().slice(0, 64);
    const platform = (dto.platform ?? '').trim().slice(0, 16);
    const appVersion = (dto.app_version ?? '').trim().slice(0, 32);
    const seen = new Set<string>();
    const rows: Array<Partial<TrackEvent>> = [];
    const rejected = new Map<string, number>();
    let batchDuplicates = 0;

    for (const event of dto.events) {
      if (!isTrackEventName(event.name) || !event.event_id.trim()) {
        // 未知/非法事件：按事件名聚合计数，不逐条刷日志，不输出属性
        const key = (event.name ?? '').trim().slice(0, 64) || '<empty>';
        rejected.set(key, (rejected.get(key) ?? 0) + 1);
        continue;
      }
      const eventId = event.event_id.trim().slice(0, 64);
      if (seen.has(eventId)) {
        batchDuplicates += 1;
        continue;
      }
      seen.add(eventId);
      rows.push({
        eventId,
        userId,
        sessionId,
        name: event.name,
        eventTime: resolveEventTime(event.ts, now),
        platform,
        appVersion,
        props: sanitizeTrackProps(event.props, event.name),
      });
    }

    const dropped = dto.events.length - rows.length - batchDuplicates;
    if (rows.length === 0) {
      this.logRejectedEvents(rejected);
      return { inserted: 0, duplicated: batchDuplicates, dropped, accepted: 0 };
    }

    try {
      const result = await this.events
        .createQueryBuilder()
        .insert()
        .into(TrackEvent)
        .values(rows as never)
        .orIgnore()
        .execute();
      // affectedRows：新插入计数；被唯一键冲突跳过的行不计入。
      const affected = (result?.raw as InsertAffectedRows | undefined)?.affectedRows;
      const inserted = typeof affected === 'number' && affected >= 0 ? affected : rows.length;
      this.logRejectedEvents(rejected);
      return {
        inserted,
        duplicated: batchDuplicates + rows.length - inserted,
        dropped,
        accepted: inserted,
      };
    } catch (error) {
      // 数据库失败整个请求按错误返回：客户端保留未确认队列，靠 event_id 去重重放
      this.logger.error(
        '写入埋点失败',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /** 未知/非法事件的聚合告警：仅事件名与计数，供监控提取未知事件比例。 */
  private logRejectedEvents(rejected: Map<string, number>) {
    if (rejected.size === 0) return;
    const summary = [...rejected.entries()]
      .map(([name, count]) => `${name || '<empty>'} x${count}`)
      .join(', ')
      .slice(0, 512);
    this.logger.warn(`收到未知或非法埋点事件并拒收：${summary}`);
  }
}
