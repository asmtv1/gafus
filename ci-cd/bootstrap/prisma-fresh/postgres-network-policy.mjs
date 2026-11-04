/**
 * Only the explicitly selected disposable GitHub Actions PostgreSQL service
 * may have a Docker bridge address. All other fresh DB bootstraps remain
 * loopback-to-loopback only. This does not waive the database ownership,
 * empty-schema, local URL, exact confirmation, or atomic SQL preconditions.
 */
const ipv4 = value => {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value ?? '')) return null;
  const parts = value.split('.').map(Number);
  return parts.every(part => part <= 255) ? parts : null;
};
const dockerBridge = address => {
  const parts = ipv4(address);
  return parts && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 ? parts : null;
};
export function allowsFreshPostgresEndpoint({
  address, peer, hostname, port, database, username, githubActions, ciService,
}) {
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return false;
  if (address === '127.0.0.1' || address === '::1') return true;
  const server = dockerBridge(address);
  const client = dockerBridge(peer);
  return githubActions === 'true' &&
    ciService === 'github-actions-disposable-postgres-16' &&
    hostname === 'localhost' && port === '5432' &&
    database === 'gafus_fresh' && username === 'gafus_ci' &&
    server !== null && client !== null &&
    server[0] === client[0] && server[1] === client[1] && server[2] === client[2];
}
