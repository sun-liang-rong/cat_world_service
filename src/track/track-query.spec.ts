import {
  FUNNEL_STEPS,
  addDays,
  buildFunnel,
  eachDay,
  ratio,
  resolveTrackQuery,
  shanghaiYmd,
} from './track-query';

describe('track query helpers', () => {
  const now = new Date('2026-09-20T08:00:00.000+08:00');

  it('defaults to the last 7 Shanghai days', () => {
    const range = resolveTrackQuery({}, now);
    expect(range.to).toBe('2026-09-20');
    expect(range.from).toBe('2026-09-14');
    expect(range.fromStart).toBe('2026-09-14 00:00:00');
    expect(range.toExclusive).toBe('2026-09-21 00:00:00');
    expect(range.platform).toBe('all');
    expect(range.mode).toBe('all');
  });

  it('rejects a range longer than 31 days', () => {
    expect(() =>
      resolveTrackQuery({ from: '2026-08-01', to: '2026-09-20' }, now),
    ).toThrow('查询跨度不能超过 31 天');
  });

  it('builds a same-day stepwise funnel', () => {
    const steps = FUNNEL_STEPS.slice(0, 3);
    const result = buildFunnel(steps, [
      [
        { day: '2026-09-20', userId: 'a' },
        { day: '2026-09-20', userId: 'b' },
        { day: '2026-09-19', userId: 'c' },
      ],
      [
        { day: '2026-09-20', userId: 'a' },
        { day: '2026-09-19', userId: 'c' },
      ],
      [{ day: '2026-09-20', userId: 'a' }],
    ]);

    expect(result.map((step) => step.same_day_users)).toEqual([3, 2, 1]);
    expect(result[1].same_day_rate).toBe(ratio(2, 3));
    expect(result[2].same_day_rate).toBe(ratio(1, 2));
    expect(result[2].unique_users).toBe(1);
  });

  it('lists inclusive calendar days', () => {
    expect(eachDay('2026-09-18', '2026-09-20')).toEqual([
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(shanghaiYmd(now)).toBe('2026-09-20');
  });
});
