import { NameGenerator } from './name-generator';

describe('NameGenerator', () => {
  const generator = new NameGenerator();

  it('builds a large unique pool of 2-8 character names', () => {
    expect(generator.size).toBeGreaterThan(500);
  });

  it('picks names that match the title rules', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const name = generator.pick(seen);
      expect(name.length).toBeGreaterThanOrEqual(2);
      expect(name.length).toBeLessThanOrEqual(8);
      expect(name).toMatch(/^[\u4e00-\u9fa5]+$/);
    }
  });

  it('never picks banned words', () => {
    const banned = ['死', '杀', '血', '地狱', '战神', '至尊'];
    const seen = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      const name = generator.pick(seen);
      for (const word of banned) {
        expect(name).not.toContain(word);
      }
    }
  });
});
