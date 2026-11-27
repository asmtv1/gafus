export const syntheticMediaCredentials: { accessKeyId: string; secretAccessKey: string };
export const syntheticCdnCredentials: { gallery: string; feed: string };
export function installMediaCredentialFixture(options?: { readonlyCdn?: boolean }): {
  cdnFile: string;
  credentialFile: string;
  restore(): void;
};
