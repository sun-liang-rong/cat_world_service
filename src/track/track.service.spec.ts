import { Logger } from '@nestjs/common';
import { TrackService } from './track.service';

interface Captured {
  values?: unknown;
}

/** 只模拟 TrackService 用到的 insert().into().values().orIgnore().execute() 链。 */
function createRepo(affectedRows: number, executeError?: Error) {
  const captured: Captured = {};
  const builder = {
    insert() {
      return builder;
    },
    into() {
      return builder;
    },
    values(value: unknown) {
      captured.values = value;
      return builder;
    },
    orIgnore() {
      return builder;
    },
    async execute() {
      if (executeError) throw executeError;
      return { raw: { affectedRows } };
    },
  };
  const repo = { createQueryBuilder: () => builder };
  return { repo: repo as never, captured };
}

function event(id: string, name = 'app_launch', props?: Record<string, unknown>) {
  return { event_id: id, name, ts: 1_700_000_000_000, props };
}

const BASE = { session_id: 'session-1', platform: 'h5', app_version: '1.0.0' };

describe('TrackService.ingest', () => {
  afterEach(() => jest.restoreAllMocks());

  it('1 条合法 + 1 条批内重复 + 1 条未知 → inserted=1, duplicated=1, dropped=1', async () => {
    const { repo, captured } = createRepo(1);
    const service = new TrackService(repo);

    const result = await service.ingest({
      ...BASE,
      events: [event('a'), event('a'), event('x', 'not_an_event')],
    });

    expect(result).toEqual({ inserted: 1, duplicated: 1, dropped: 1, accepted: 1 });
    expect((captured.values as unknown[]).length).toBe(1);
  });

  it('同一个 event_id 再提交且与库内冲突 → inserted=0, duplicated=1, dropped=0', async () => {
    const { repo } = createRepo(0);
    const service = new TrackService(repo);

    const result = await service.ingest({ ...BASE, events: [event('a')] });

    expect(result).toEqual({ inserted: 0, duplicated: 1, dropped: 0, accepted: 0 });
  });

  it('匿名批次正常入库：user_id 可为空，session_id 不丢失', async () => {
    const { repo, captured } = createRepo(2);
    const service = new TrackService(repo);

    const result = await service.ingest({
      session_id: 'anon-session',
      events: [event('a'), event('b', 'journey_claim', { day: 3 })],
    });

    expect(result.inserted).toBe(2);
    expect(result.dropped).toBe(0);
    const rows = captured.values as Array<Record<string, unknown>>;
    expect(rows[0].sessionId).toBe('anon-session');
    expect(rows[0].userId).toBe('');
    expect(rows[1].name).toBe('journey_claim');
  });

  it('数据库错误整个请求按错误返回，不伪报成功', async () => {
    const { repo } = createRepo(0, new Error('db down'));
    const service = new TrackService(repo);

    await expect(
      service.ingest({ ...BASE, events: [event('a')] }),
    ).rejects.toThrow('db down');
  });

  it('未知事件按事件名聚合并告警，日志不包含属性', async () => {
    const { repo } = createRepo(0);
    const service = new TrackService(repo);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    const result = await service.ingest({
      ...BASE,
      events: [
        event('x', 'mystery_event', { secret: 'should-not-appear' }),
        event('y', 'mystery_event'),
        event('z', 'another_unknown'),
      ],
    });

    expect(result).toEqual({ inserted: 0, duplicated: 0, dropped: 3, accepted: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0].join(' ');
    expect(message).toContain('mystery_event x2');
    expect(message).toContain('another_unknown x1');
    expect(message).not.toContain('should-not-appear');
  });
});
