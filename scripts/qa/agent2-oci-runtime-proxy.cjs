#!/usr/bin/env node
// Only three exact, synthetic local QA service ports may be forwarded.
// Container has the internal app network and Docker's bridge; app containers
// have ONLY the internal network and cannot contact external providers.
const net = require('node:net');
const mappings = [[5432, 55447], [6379, 56347], [8000, 58347]];
for (const [listenPort, localPort] of mappings) {
  const server = net.createServer(socket => {
    const upstream = net.connect({ host: 'host.docker.internal', port: localPort });
    socket.pipe(upstream).pipe(socket);
    const close = () => {socket.destroy();upstream.destroy();};
    socket.on('error', close);
    upstream.on('error', close);
    socket.on('close', () => upstream.destroy());
    upstream.on('close', () => socket.destroy());
  });
  server.listen(listenPort, '0.0.0.0');
}
console.log('AGENT2_QA_FIXED_TCP_PROXY_READY_3_PORTS');
