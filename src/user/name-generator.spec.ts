import { NameGenerator } from './name-generator';

describe('NameGenerator', () => {
  const generator = new NameGenerator();

  it('builds a large unique pool of 4-6 character names', () => {
    expect(generator.size).toBeGreaterThan(200);
  });

  it('picks names that match the title rules', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const name = generator.pick(seen);
      expect(name.length).toBeGreaterThanOrEqual(4);
      expect(name.length).toBeLessThanOrEqual(6);
      expect(name).toMatch(/^[\u4e00-\u9fa5]+$/);
    }
  });
});
