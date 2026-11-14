import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ state: vi.fn(), count: vi.fn() }));
vi.mock('@gafus/prisma', () => ({ prisma: {
  reengagementCampaign: { findUnique: mocked.state },
  reengagementNotification: { count: mocked.count },
} }));
import { isReengagementDispatchAllowed } from './workerQueries';

const allowed = {
  userId: 'learner-1', isActive: true, returned: false, unsubscribed: false,
  currentLevel: 2, user: { reengagementSettings: { enabled: true, maxNotificationsPerWeek: 2 } },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocked.state.mockResolvedValue(allowed);
  mocked.count.mockResolvedValue(0);
});
describe('reengagement dispatch permission at send time', () => {
  it('accepts a current eligible campaign and reads explicit user settings', async () => {
    await expect(isReengagementDispatchAllowed('camp-1', 'learner-1', 2)).resolves.toBe(true);
    expect(mocked.state).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      select: expect.objectContaining({
        userId: true, currentLevel: true, isActive: true,
        user: { select: { reengagementSettings: { select: {
          enabled: true, maxNotificationsPerWeek: true,
        } } } },
      }),
    });
  });
  it('respects opt-out even when an older campaign remains active', async () => {
    mocked.state.mockResolvedValue({
      ...allowed, user: { reengagementSettings: { enabled: false } },
    });
    await expect(isReengagementDispatchAllowed('camp-1', 'learner-1', 2)).resolves.toBe(false);
  });
  it.each([
    { isActive: false }, { returned: true }, { unsubscribed: true },
    { currentLevel: 3 }, { userId: 'different-user' },
  ])('rejects obsolete or forged campaign state %#', async patch => {
    mocked.state.mockResolvedValue({ ...allowed, ...patch });
    await expect(isReengagementDispatchAllowed('camp-1', 'learner-1', 2)).resolves.toBe(false);
  });
  it('rejects missing campaign or user', async () => {
    mocked.state.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...allowed, user: null });
    await expect(isReengagementDispatchAllowed('camp-1', 'learner-1', 2)).resolves.toBe(false);
    await expect(isReengagementDispatchAllowed('camp-1', 'learner-1', 2)).resolves.toBe(false);
  });
  it('preserves original opt-in default when there is no settings row', async () => {
    mocked.state.mockResolvedValue({ ...allowed, user: { reengagementSettings: null } });
    await expect(isReengagementDispatchAllowed('camp-1', 'learner-1', 2)).resolves.toBe(true);
  });
  it('prevents a third weekly contact when the configured limit is two', async () => {
    mocked.count.mockResolvedValue(2);
    await expect(isReengagementDispatchAllowed('camp-1', 'learner-1', 2)).resolves.toBe(false);
    expect(mocked.count).toHaveBeenCalledWith({ where: {
      campaign: { is: { userId: 'learner-1' } },
      sent: true,
      sentAt: { gte: expect.any(Date) },
    } });
  });
  it('allows another contact below the configured weekly cap', async () => {
    mocked.count.mockResolvedValue(1);
    await expect(isReengagementDispatchAllowed('camp-1', 'learner-1', 2)).resolves.toBe(true);
  });
  it('blocks user-specific zero weekly notification limit', async () => {
    mocked.state.mockResolvedValue({
      ...allowed, user: { reengagementSettings: { enabled: true, maxNotificationsPerWeek: 0 } },
    });
    await expect(isReengagementDispatchAllowed('camp-1', 'learner-1', 2)).resolves.toBe(false);
    expect(mocked.count).not.toHaveBeenCalled();
  });
  it('fails closed when contact history cannot be read', async () => {
    mocked.count.mockRejectedValue(new Error('read timeout'));
    await expect(isReengagementDispatchAllowed('camp-1', 'learner-1', 2)).rejects.toThrow();
  });
  it('fails closed if the database cannot verify eligibility', async () => {
    mocked.state.mockRejectedValue(new Error('test db unavailable'));
    await expect(isReengagementDispatchAllowed('camp-1', 'learner-1', 2)).rejects.toThrow();
  });
});
