// 事件允许集合由 cat-world/analytics/track-events.json 经
// cat-world/scripts/generate_track_contract.js 生成（track-events.gen.ts），
// 与客户端 TrackEventName 同源；这里只保留结构清洗逻辑，勿在此手改事件名。
import { TRACK_EVENT_NAMES, TRACK_PROP_SCHEMAS } from './track-events.gen';
import type { TrackEventName } from './track-events.gen';

export { TRACK_EVENT_NAMES } from './track-events.gen';
export type { TrackEventName } from './track-events.gen';

const NAME_SET = new Set<string>(TRACK_EVENT_NAMES);
const MAX_PROP_KEYS = 32;
const MAX_STRING_LENGTH = 256;
const MAX_PROPS_JSON = 8192;

export function isTrackEventName(name: string): name is TrackEventName {
  return NAME_SET.has(name);
}

export function sanitizeTrackProps(value: unknown, name?: TrackEventName): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  if (!name) return {};
  const schema = TRACK_PROP_SCHEMAS[name];
  const props: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (propsKeyCount(props) >= MAX_PROP_KEYS) {
      break;
    }
    if (!key || key.length > 64) {
      continue;
    }
    const type = schema[key];
    if (!type || !matchesType(raw, type)) continue;
    const next = sanitizePropValue(raw);
    if (next === undefined) {
      continue;
    }
    props[key] = next;
  }

  try {
    const serialized = JSON.stringify(props);
    if (serialized.length <= MAX_PROPS_JSON) {
      return props;
    }
  } catch {
    return {};
  }
  return { truncated: true };
}

export function resolveEventTime(ts: unknown, now = new Date()): Date {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) {
    return now;
  }
  const millis = Math.floor(ts);
  if (millis < 1_000_000_000_000 || millis > now.getTime() + 60_000) {
    return now;
  }
  return new Date(millis);
}

function propsKeyCount(props: Record<string, unknown>) {
  return Object.keys(props).length;
}

function sanitizePropValue(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    return value.slice(0, MAX_STRING_LENGTH);
  }
  if (Array.isArray(value)) {
    const items = value
      .slice(0, 16)
      .map((item) => (typeof item === 'string' ? item.slice(0, 64) : undefined))
      .filter((item): item is string => !!item);
    return items;
  }
  return undefined;
}

function matchesType(value: unknown, type: string): boolean {
  if (type.endsWith('_null') && value === null) return true;
  if (type === 'string[]') return Array.isArray(value) && value.every(item => typeof item === 'string');
  return typeof value === type.replace('_null', '');
}
