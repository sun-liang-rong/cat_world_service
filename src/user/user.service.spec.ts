import { QueryFailedError } from 'typeorm';
import { UserService } from './user.service';
import { NameGenerator } from './name-generator';
import { hashSubmitToken } from './submit-token';

describe('anonymous leaderboard identity', () => {
  it('returns a private random credential but stores only its SHA256 hash', async () => {
    const saved: Array<Record<string, unknown>> = [];
    const users = {
      create: (value: Record<string, unknown>) => value,
      save: async (value: Record<string, unknown>) => { saved.push(value); return value; },
    };
    const service = new UserService(users as never, new NameGenerator());
    const first = await service.generate();
    const second = await service.generate();
    expect(first.submit_token).toMatch(/^[a-f0-9]{64}$/);
    expect(second.submit_token).not.toBe(first.submit_token);
    expect(saved[0].submitTokenHash).toBe(hashSubmitToken(first.submit_token));
    expect(saved[0]).not.toHaveProperty('submit_token');
    expect(saved[0]).not.toHaveProperty('token');
  });

  it('can create more identities than the old 776-name pool', async () => {
    const names = new NameGenerator();
    jest.spyOn(names, 'pick').mockReturnValue('爱打呼噜的小家伙');
    const persistedNames = new Set<string>();
    const users = {
      create: (value: Record<string, unknown>) => value,
      save: async (value: { name: string }) => {
        if (persistedNames.has(value.name)) throw new QueryFailedError('INSERT', [], { code: 'ER_DUP_ENTRY' });
        persistedNames.add(value.name);
        return value;
      },
    };
    const service = new UserService(users as never, names);
    for (let i = 0; i < 1000; i += 1) {
      const user = await service.generate();
      expect(user.name.length).toBeLessThanOrEqual(16);
      expect(user.name).toContain(`·${user.user_id}`);
    }
    expect(persistedNames.size).toBe(1000);
  });

  it('retries a concurrent database unique-key collision with a fresh identity', async () => {
    const saved: Array<{ userId: string; submitTokenHash: string }> = [];
    const users = {
      create: (value: Record<string, unknown>) => value,
      save: async (value: { userId: string; submitTokenHash: string }) => {
        saved.push(value);
        if (saved.length === 1) throw new QueryFailedError('INSERT', [], { code: 'ER_DUP_ENTRY' });
        return value;
      },
    };
    const result = await new UserService(users as never, new NameGenerator()).generate();
    expect(saved).toHaveLength(2);
    expect(saved[1].userId).not.toBe(saved[0].userId);
    expect(saved[1].submitTokenHash).not.toBe(saved[0].submitTokenHash);
    expect(result.user_id).toBe(saved[1].userId);
    expect(hashSubmitToken(result.submit_token)).toBe(saved[1].submitTokenHash);
  });
});
