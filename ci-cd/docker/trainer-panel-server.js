const http = require("node:http");

const REQUEST_TIMEOUT_MS = 60 * 60 * 1000;

// Next standalone uses Node's HTTP server, whose default request timeout is
// five minutes. Trainer videos are streamed through this process to Object
// Storage, so a slow upload must be allowed to run as long as nginx does.
function configureHttpServerTimeouts(httpModule = http) {
  const createServer = httpModule.createServer;
  httpModule.createServer = function createLongRunningServer(...args) {
    const server = createServer.apply(this, args);
    server.requestTimeout = REQUEST_TIMEOUT_MS;
    server.headersTimeout = REQUEST_TIMEOUT_MS;
    return server;
  };
}

module.exports = { REQUEST_TIMEOUT_MS, configureHttpServerTimeouts };

if (require.main === module) {
  configureHttpServerTimeouts();
  require("./apps/trainer-panel/server.js");
}
