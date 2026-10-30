import { describe, it, expect } from 'vitest';
import { getEmbeddedVideoInfo, getSafeVideoResumePosition, getDayKey } from './utils/index';
import { publicationPhaseLabel } from './feed/publication-client';
import { isCdnOutage, parseMediaDeliveryStatus } from './media-delivery/index';
import { petNameSchema } from './validation/pet';
import { resolveRegistrationChannelFromBody } from './validation/auth-register';
import { VK_ID_OAUTH_SCOPE } from './auth/vk-auth-constants';

describe('browser-safe exported contracts', () => {
  it('keeps video and training helpers available without Core', () => {
    expect(getSafeVideoResumePosition(5, 60)).toBe(5);
    expect(typeof getEmbeddedVideoInfo).toBe('function');
    expect(typeof getDayKey).toBe('function');
  });
  it('retains Moments publication phase labels', () => {
    expect(publicationPhaseLabel({id:'1',ownerId:'u',text:'',attachmentCount:0,phase:'published',progress:100})).toBe('Опубликовано!');
  });
  it('does not treat unauthorized media as CDN outages', () => {
    expect(isCdnOutage({status:403})).toBe(false);
    expect(isCdnOutage({status:410})).toBe(true);
    expect(parseMediaDeliveryStatus({gallery:'cdn',feed:'cloudru'})).toEqual({gallery:'cdn',feed:'cloudru'});
  });
  it('keeps registration and pet validation independent of Prisma', () => {
    expect(petNameSchema.safeParse('Шарик').success).toBe(true);
    expect(resolveRegistrationChannelFromBody(undefined)).toBe('UNKNOWN');
    expect(VK_ID_OAUTH_SCOPE).toBe('email');
  });
});
