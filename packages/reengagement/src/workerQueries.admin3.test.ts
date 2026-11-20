import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ state: vi.fn(), count: vi.fn(), subscriptions: vi.fn(), deleteSubscriptions: vi.fn() }));
vi.mock('@gafus/prisma', () => ({ prisma: {
  reengagementCampaign: { findUnique: mocked.state },
  reengagementNotification: { count: mocked.count },
  pushSubscription: { findMany: mocked.subscriptions, deleteMany: mocked.deleteSubscriptions },
} }));
import {
  isReengagementDispatchAllowed, getReengagementCampaignState,
  getReengagementPushSubscriptions, deleteInvalidReengagementPushEndpoints,
} from './workerQueries';

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


describe('reengagement worker persistence adapters', () => {
  it('reads only the campaign state needed for fail-closed dispatch', async () => {
    const result = { isActive: true, returned: false, unsubscribed: false };
    mocked.state.mockResolvedValueOnce(result);
    await expect(getReengagementCampaignState('camp-2')).resolves.toEqual(result);
    expect(mocked.state).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'camp-2' },
      select: { isActive: true, returned: true, unsubscribed: true },
    });
  });
  it('selects only the target user subscriptions and needed push credentials', async () => {
    const rows = [{ endpoint: 'https://push.example.test/a', keys: { p256dh: 'public', auth: 'key' } }];
    mocked.subscriptions.mockResolvedValueOnce(rows);
    await expect(getReengagementPushSubscriptions('learner-2')).resolves.toEqual(rows);
    expect(mocked.subscriptions).toHaveBeenCalledExactlyOnceWith({
      where: { userId: 'learner-2' },
      select: { endpoint: true, keys: true },
    });
  });
  it('never issues a broad delete for an empty list of invalid endpoints', async () => {
    await expect(deleteInvalidReengagementPushEndpoints([])).resolves.toBe(0);
    expect(mocked.deleteSubscriptions).not.toHaveBeenCalled();
  });
  it('deletes only explicitly invalid endpoints and reports actual count', async () => {
    mocked.deleteSubscriptions.mockResolvedValueOnce({ count: 2 });
    const endpoints = ['https://push.example.test/stale-1', 'https://push.example.test/stale-2'];
    await expect(deleteInvalidReengagementPushEndpoints(endpoints)).resolves.toBe(2);
    expect(mocked.deleteSubscriptions).toHaveBeenCalledExactlyOnceWith({
      where: { endpoint: { in: endpoints } },
    });
  });
  it('propagates storage errors rather than pretending dispatch state was checked', async () => {
    mocked.state.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(getReengagementCampaignState('camp-3')).rejects.toThrow('storage unavailable');
  });
});
