import {describe,it,expect} from 'vitest';
import {photoRetryMessage} from './photoRetryMessage';
describe('safe phone photo recovery advice',()=>{
 it('encourages one-file retry after device encode failure',()=>{
  expect(photoRetryMessage(Error('image manipulator failed'))).toContain('телефоне');
  expect(photoRetryMessage(Error('S3 connection lost'))).toContain('интернет');
  expect(photoRetryMessage(Error('unknown X-Amz-Signature=SECRET'))).not.toContain('SECRET');
 });
});
