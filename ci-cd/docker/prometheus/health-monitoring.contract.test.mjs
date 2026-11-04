import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import YAML from 'yaml';

const load = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const prometheus = YAML.parse(load('prometheus.yml'));
const alloy = load('config.alloy');
const alerts = YAML.parse(load('gafus-alerts.yml'));
const probe = prometheus.scrape_configs.find(job => job.job_name === 'services-health');

const routes = [
  { host: 'web', port: 3000, path: '/healthz', nginx: '../nginx-vite-refactor.conf' },
  { host: 'trainer-panel', port: 3001, path: '/healthz', nginx: '../nginx-trainer-panel-vite.conf' },
  { host: 'admin-panel', port: 3006, path: '/healthz', nginx: '../nginx-admin-panel-vite.conf' },
  { host: 'api', port: 3001, path: '/health' },
  { host: 'worker', port: 3003, path: '/health' },
];

test('blackbox and Alloy use verified container endpoint paths, not SPA fallback', () => {
  const targets = probe.static_configs.flatMap(config => config.targets);
  for (const { host, port, path, nginx } of routes) {
    const target = `http://${host}:${port}${path}`;
    assert(targets.includes(target), `Prometheus missing ${target}`);
    assert(alloy.includes(`__param_target = "${target}"`), `Alloy missing ${target}`);
    if (nginx) {
      assert(load(nginx).includes(`location = ${path} {`), `${host} is not configured to serve ${path}`);
      assert(!targets.some(t => t.startsWith(`http://${host}:${port}/api/health`)));
    }
  }
  assert(load('../../../apps/api/src/app.ts').includes('app.route("/", healthRoutes)'));
  assert(load('../../../apps/api/src/routes/v1/health.ts').includes('healthRoutes.get("/health"'));
  assert(load('../../../packages/worker/src/health-server.ts').includes('path === "/health"'));
});

test('alerts are valid Prometheus rules and refer only to actual monitored metrics', () => {
  assert(prometheus.rule_files.includes('/etc/prometheus/gafus-alerts.yml'));
  assert(YAML.parse(load('prometheus.local.yml')).rule_files.includes('/etc/prometheus/gafus-alerts.yml'));
  const localTargets=YAML.parse(load('prometheus.local.yml')).scrape_configs
    .find(job=>job.job_name==='services-health').static_configs.flatMap(x=>x.targets);
  for(const port of [3002,3001,3006]) {
    assert(localTargets.includes(`http://host.docker.internal:${port}/healthz`));
    assert(!localTargets.includes(`http://host.docker.internal:${port}/api/health`));
  }

  const rules = alerts.groups.flatMap(group => group.rules);
  assert.equal(new Set(rules.map(rule => rule.alert)).size, rules.length);
  for (const rule of rules) {
    assert(rule.alert && rule.expr && rule.for && rule.labels?.severity && rule.annotations?.summary);
    assert(!/password|token|secret/i.test(rule.expr));
  }
  assert(rules.some(rule => rule.expr.includes('probe_success')));
  assert(rules.some(rule => rule.expr.includes('redis_up')));
  assert(rules.some(rule => rule.expr.includes('gafus_mail_queue_failed')));
  assert(alloy.includes('redis_up'));
  assert(alloy.includes('gafus_database_backup_last_success_timestamp_seconds'));
  assert(rules.some(rule => rule.alert === 'GafusBackupMissing'));
  assert(rules.some(rule => rule.alert === 'GafusBackupStale'));
  const localCompose = load('../docker-compose.local.yml');
  assert(localCompose.includes('--collector.textfile.directory=/backup-metrics'));
  assert(localCompose.includes('./prometheus/local-backup-metrics:/backup-metrics:ro'));
  assert(alloy.includes('gafus_media_(stalled_processing|failed_tasks)'));
  assert(alloy.includes('metrics_path    = "/metrics/media"'));
  assert(prometheus.scrape_configs.some(job => job.job_name === 'worker-media' && job.metrics_path === '/metrics/media'));
  assert(rules.some(rule => rule.expr.includes('gafus_media_stalled_processing')));
  assert(rules.some(rule => rule.alert === 'GafusMediaProcessingFailed' &&
    rule.expr === 'gafus_media_failed_tasks > 0'));
  const missingMedia = rules.find(rule => rule.alert === 'GafusMediaMetricsMissing');
  assert(missingMedia, 'missing series alert is mandatory');
  for (const pipeline of ['chat2', 'questions', 'feed', 'gallery']) {
    for (const metric of ['gafus_media_failed_tasks', 'gafus_media_stalled_processing']) {
      assert(missingMedia.expr.includes(`absent(${metric}{pipeline="${pipeline}"})`),
        `missing alert must watch ${metric} for ${pipeline}`);
    }
  }
});
