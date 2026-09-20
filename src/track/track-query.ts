import { BadRequestException } from '@nestjs/common';

export const TRACK_QUERY_MAX_DAYS = 31;

export type TrackPlatformFilter = 'wechat' | 'preview' | 'all';
export type TrackModeFilter = 'main' | 'challenge' | 'endless' | 'all';

export interface TrackQueryInput {
  from?: string;
  to?: string;
  platform?: string;
  mode?: string;
}

export interface TrackQueryRange {
  from: string;
  to: string;
  fromStart: string;
  toExclusive: string;
  platform: TrackPlatformFilter;
  mode: TrackModeFilter;
}

export interface DayUser {
  day: string;
  userId: string;
}

export interface FunnelStepDef {
  id: string;
  label: string;
  name: string;
  pageId?: string;
  result?: string;
  applyMode?: boolean;
}

export const FUNNEL_STEPS: FunnelStepDef[] = [
  { id: 'app_launch', label: '启动', name: 'app_launch' },
  { id: 'loading_finish', label: '加载完成', name: 'loading_finish' },
  { id: 'home', label: '进入首页', name: 'page_view', pageId: 'home' },
  {
    id: 'level_enter_click',
    label: '点击进关',
    name: 'level_enter_click',
    applyMode: true,
  },
  {
    id: 'level_start',
    label: '开始对局',
    name: 'level_start',
    applyMode: true,
  },
  {
    id: 'level_win',
    label: '对局胜利',
    name: 'level_end',
    result: 'win',
    applyMode: true,
  },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PLATFORMS = new Set<TrackPlatformFilter>(['wechat', 'preview', 'all']);
const MODES = new Set<TrackModeFilter>(['main', 'challenge', 'endless', 'all']);

export function shanghaiYmd(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

export function addDays(ymd: string, delta: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return date.toISOString().slice(0, 10);
}

export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function resolveTrackQuery(
  input: TrackQueryInput,
  now = new Date(),
): TrackQueryRange {
  const today = shanghaiYmd(now);
  const to = parseDay(input.to) ?? today;
  const from = parseDay(input.from) ?? addDays(to, -6);
  if (from > to) {
    throw new BadRequestException('开始日期不能晚于结束日期');
  }
  const days = eachDay(from, to).length;
  if (days > TRACK_QUERY_MAX_DAYS) {
    throw new BadRequestException('查询跨度不能超过 31 天');
  }

  return {
    from,
    to,
    fromStart: `${from} 00:00:00`,
    toExclusive: `${addDays(to, 1)} 00:00:00`,
    platform: parsePlatform(input.platform),
    mode: parseMode(input.mode),
  };
}

export function dayUserKey(row: DayUser): string {
  return `${row.day}\t${row.userId}`;
}

export function toDayUserSet(rows: DayUser[]): Set<string> {
  const set = new Set<string>();
  for (const row of rows) {
    if (!row.day || !row.userId) continue;
    set.add(dayUserKey(row));
  }
  return set;
}

export function intersectSets(left: Set<string>, right: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const key of left) {
    if (right.has(key)) out.add(key);
  }
  return out;
}

export function uniqueCount(rows: DayUser[]): number {
  const users = new Set<string>();
  for (const row of rows) {
    if (row.userId) users.add(row.userId);
  }
  return users.size;
}

export interface FunnelStepResult {
  id: string;
  label: string;
  same_day_users: number;
  unique_users: number;
  same_day_rate: number;
  unique_rate: number;
}

export function buildFunnel(
  steps: FunnelStepDef[],
  usersByStep: DayUser[][],
): FunnelStepResult[] {
  const result: FunnelStepResult[] = [];
  let prevSameDay: Set<string> | null = null;
  let prevUnique = 0;

  steps.forEach((step, index) => {
    const rows = usersByStep[index] ?? [];
    const currentSet = toDayUserSet(rows);
    const sameDay = prevSameDay
      ? intersectSets(prevSameDay, currentSet)
      : currentSet;
    const uniqueUsers = uniqueCount(rows);
    const sameDayUsers = sameDay.size;
    const sameDayRate = prevSameDay
      ? ratio(sameDayUsers, prevSameDay.size)
      : 1;
    const uniqueRate = index === 0 ? 1 : ratio(uniqueUsers, prevUnique);

    result.push({
      id: step.id,
      label: step.label,
      same_day_users: sameDayUsers,
      unique_users: uniqueUsers,
      same_day_rate: sameDayRate,
      unique_rate: uniqueRate,
    });

    prevSameDay = sameDay;
    prevUnique = uniqueUsers;
  });

  return result;
}

export function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return round4(numerator / denominator);
}

export function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10000) / 10000;
}

export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function toDayString(value: unknown): string {
  if (value instanceof Date) {
    return shanghaiYmd(value);
  }
  return String(value ?? '').slice(0, 10);
}

function parseDay(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, 10);
  if (!DATE_RE.test(trimmed)) {
    throw new BadRequestException('日期格式需要是 YYYY-MM-DD');
  }
  return trimmed;
}

function parsePlatform(value?: string): TrackPlatformFilter {
  if (!value) return 'all';
  if (!PLATFORMS.has(value as TrackPlatformFilter)) {
    throw new BadRequestException('platform 只能是 wechat、preview 或 all');
  }
  return value as TrackPlatformFilter;
}

function parseMode(value?: string): TrackModeFilter {
  if (!value) return 'all';
  if (!MODES.has(value as TrackModeFilter)) {
    throw new BadRequestException('mode 只能是 main、challenge、endless 或 all');
  }
  return value as TrackModeFilter;
}
