import { AddUserSubmitToken1791907200000 } from '../migrations/1791907200000-add-user-submit-token';

describe('anonymous submit credential migration', () => {
  it('adds a nullable hash to the existing user table without manufacturing legacy credentials', async () => {
    const runner = { hasColumn: jest.fn().mockResolvedValue(false), addColumn: jest.fn() };
    await new AddUserSubmitToken1791907200000().up(runner as never);
    expect(runner.addColumn).toHaveBeenCalledWith('cat_world_user', expect.objectContaining({ name: 'submit_token_hash', type: 'char', length: '64', isNullable: true }));
  });

  it('can follow development synchronize without duplicating the column', async () => {
    const runner = { hasColumn: jest.fn().mockResolvedValue(true), addColumn: jest.fn() };
    await new AddUserSubmitToken1791907200000().up(runner as never);
    expect(runner.addColumn).not.toHaveBeenCalled();
  });
});
