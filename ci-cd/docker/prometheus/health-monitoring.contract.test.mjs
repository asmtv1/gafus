import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import YAML from 'yaml';

const load = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const prometheus = YAML.parse(load('prometheus.yml'));
const alloy = load('config.alloy');
const uptraceRules = alloy.split('prometheus.relabel "uptrace_allowlist" {')[1]
  .split('prometheus.remote_write "uptrace" {')[0];
const exportedMetrics = new RegExp(
  '^(?:' + uptraceRules.match(/source_labels = \["__name__"\]\s+regex = "([^"]+)"/)[1] + ')$',
);
const exportedLabels = new RegExp(
  '^(?:' + uptraceRules.match(/action = "labelkeep"\s+regex = "([^"]+)"/)[1] + ')$',
);
const alerts = YAML.parse(load('gafus-alerts.yml'));

test('Uptrace Cloud remote_write uses a single shard and extended timeout on unstable egress', () => {
  const uptraceBlock = alloy.split('prometheus.remote_write "uptrace" {')[1]
    .split('prometheus.scrape "redis_exporter_uptrace" {')[0];
  assert.match(uptraceBlock, /remote_timeout\s*=\s*"90s"/);
  assert.match(uptraceBlock, /min_shards\s*=\s*1/);
  assert.match(uptraceBlock, /max_shards\s*=\s*1/);
  assert.match(uptraceBlock, /enable_http2\s*=\s*false/);
  assert.match(uptraceBlock, /retry_on_http_429\s*=\s*true/);
});
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
  assert(exportedMetrics.test('redis_up'));
  assert(exportedMetrics.test('gafus_database_backup_last_success_timestamp_seconds'));
  assert(rules.some(rule => rule.alert === 'GafusBackupMissing'));
  assert(rules.some(rule => rule.alert === 'GafusBackupStale'));
  const localCompose = load('../docker-compose.local.yml');
  assert(localCompose.includes('--collector.textfile.directory=/backup-metrics'));
  assert(localCompose.includes('./prometheus/local-backup-metrics:/backup-metrics:ro'));
  for (const suffix of ['stalled_processing', 'failed_tasks'])
    assert(exportedMetrics.test('gafus_media_' + suffix));
  assert(alloy.includes('prometheus.scrape "api_operations"'));
  assert(alloy.includes('metrics_path    = "/internal/metrics"'));
  assert(alloy.includes('credentials = sys.env("API_METRICS_KEY")'));
  const releaseWorkflow = load('../../../.github/workflows/production-deploy-reusable.yml');
  assert(releaseWorkflow.includes('python3 ci-cd/scripts/provision-api-metrics-key.py'),
    'Production deployment must preserve the authenticated API metrics scrape key');
  assert(releaseWorkflow.indexOf('provision-api-metrics-key.py') <
    releaseWorkflow.indexOf('# Set secure permissions for .env file'),
  'API metrics key must be provisioned before release env verification');
  const compose = load('../docker-compose.prod.yml');
  assert.match(compose, /api:[\s\S]*?- API_METRICS_KEY=\$\{API_METRICS_KEY:-\}/);
  assert.match(compose, /grafana-alloy:[\s\S]*?- API_METRICS_KEY=\$\{API_METRICS_KEY:-\}/);
  assert.match(compose, /worker:[\s\S]*?- OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=\$\{OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:-\}/);

  for (const suffix of ['pending', 'leased', 'dead_letters', 'oldest_age_seconds'])
    assert(exportedMetrics.test('gafus_chat2_outbox_' + suffix));
  assert(rules.some(rule => rule.alert === 'GafusChat2OutboxDeadLetters'));
  for (const suffix of ['enabled', 'pending', 'processing', 'failed', 'oldest_age_seconds'])
    assert(exportedMetrics.test('gafus_questions_legacy_delete_' + suffix));
  for (const [name, expression] of [
    ['GafusQuestionsLegacyDeletionDeadLetters', 'gafus_questions_legacy_delete_failed > 0'],
    ['GafusQuestionsLegacyDeletionStalled', 'gafus_questions_legacy_delete_oldest_age_seconds > 3600'],
    ['GafusQuestionsLegacyDeletionMetricsMissing', 'absent(gafus_questions_legacy_delete_enabled)'],
  ]) {
    assert(rules.some(rule=>rule.alert===name && rule.expr===expression),
      'Questions delete outbox alert must have its exact gauge expression: '+name);
  }

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

test('Chat2 execution metrics remain scraped, bounded and visible on dashboard', () => {
  for (const family of ['job_attempts_total', 'job_failures_total',
    'job_duration_seconds_bucket', 'job_duration_seconds_sum', 'job_duration_seconds_count']) {
    assert(exportedMetrics.test(family), 'Alloy must forward '+family);
  }
  for (const label of ['job_type', 'outcome', 'class'])
    assert(exportedLabels.test(label), 'Alloy must preserve Chat2 alert and dashboard label ' + label);
  const worker = load('../../../packages/worker/src/chat2-outbox-worker.ts');
  const metrics = load('../../../packages/worker/src/chat2-outbox-metrics.ts');
  assert(worker.includes('chat2OutboxExecutionMetrics.record('));
  assert(metrics.includes('job_duration_seconds_bucket'));
  for (const forbidden of ['userId', 'conversationId', 'messageId', 'operationId']) {
    assert(!metrics.includes(`job_type="${forbidden}"`));
  }
  const paths = ['../grafana/dashboards/gafus-api-latency.json',
    '../grafana/dashboards/gafus-media-chat.json'];
  for (const filename of paths) {
    const dashboard = JSON.parse(load(filename));
    assert(dashboard.panels.length >= 6);
    for (const panel of dashboard.panels) {
      assert(panel.targets?.length > 0);
      for (const target of panel.targets) {
        assert(target.expr);
        assert(!/userId|operationId|messageId|conversationId/.test(target.expr));
      }
    }
  }
  const storm = alerts.groups.flatMap(group => group.rules)
    .find(rule => rule.alert === 'GafusChat2DispatchRetryStorm');
  assert(storm?.expr.includes('job_attempts_total'));
  assert(storm.expr.includes('> 20'));
  assert(storm.expr.includes('> 0.25'));
});


test('Agent 2 SLO and dependency alerts use bounded exported metrics', () => {
  const rules = alerts.groups.flatMap(group => group.rules);
  const byName = name => rules.find(r => r.alert === name);
  for (const name of [
    'GafusApi5xxElevated', 'GafusApiP95High',
    'GafusWorkerNoSuccessWithBacklog', 'GafusWorkerAttemptMetricsMissing',
    'GafusPostgresConnectionsHigh', 'GafusApiMetricsMissing',
  ]) assert(byName(name)?.for && byName(name).labels?.severity, name);
  for (const metric of [
    'http_requests_total', 'http_request_duration_seconds_bucket',
    'job_attempts_total', 'db_query_duration_seconds_bucket',
    'db_pool_wait_seconds_bucket', 'db_pool_wait_metrics_fresh',
    'pg_stat_activity_count', 'pg_settings_max_connections',
    'redis_memory_used_bytes', 'dependency_errors_total',
  ]) assert(exportedMetrics.test(metric), 'Alloy is missing source: ' + metric);
  assert(byName('GafusApi5xxElevated').expr.includes('>= 100'),
    '5xx ratio without traffic floor is noisy at low volume');
  assert(byName('GafusApiP95High').expr.includes('>= 100'),
    'p95 alert must have a traffic floor');
  assert(byName('GafusWorkerNoSuccessWithBacklog').expr.includes('outcome="delivered"'),
    'only successful Worker deliveries prove queue progress');
  assert(byName('GafusApiMetricsMissing').expr.includes('up{job="api-operations"}'),
    'fresh API with no requests must not be declared missing');
  assert(!rules.some(rule => /userId|requestId|operationId|messageId/.test(rule.expr)),
    'high cardinality identifiers must never become alert labels');
});

test('Agent 2 Grafana storage view exposes all verified measurement families and environment selection', () => {
  const dashboard = JSON.parse(load('../grafana/dashboards/gafus-a2-storage-dependencies.json'));
  assert.equal(dashboard.panels.length, 10);
  assert(dashboard.templating.list.some(variable =>
    variable.name === 'environment' && variable.includeAll && variable.allValue === '.*'));
  const expressions = dashboard.panels.flatMap(panel => panel.targets.map(target => target.expr));
  for (const name of [
    'pg_up', 'redis_up', 'pg_stat_activity_count',
    'pg_settings_max_connections', 'db_query_duration_seconds_bucket',
    'db_pool_wait_seconds_bucket', 'db_pool_wait_metrics_fresh',
    'redis_memory_used_bytes', 'dependency_errors_total',
  ]) assert(expressions.some(expr => expr.includes(name)), 'missing source ' + name);
  for (const expression of expressions) {
    assert(expression.includes('environment=~"$environment"'));
    assert(!/operationId|messageId|userId|requestId|db\.statement/.test(expression));
  }
});

test('actual Prisma pool-wait metric requires engine preview, guarded scrape and bounded labels', () => {
  const schema = load('../../../packages/prisma/schema.prisma');
  const telemetry = load('../../../packages/logger/src/serverTelemetry.ts');
  const middleware = load('../../../apps/api/src/lib/operation-observability.ts');
  assert.match(schema, /previewFeatures\s*=\s*\["metrics"\]/);
  assert(telemetry.includes('prisma_client_queries_wait_histogram_ms'));
  assert(telemetry.includes('recordPrismaPoolWaitHistogram'));
  assert(telemetry.includes('db_pool_wait_metrics_fresh'));
  assert(middleware.includes('authorizedOperationMetrics('));
  assert(middleware.includes('refreshPoolWaitMetrics()'));
  assert(middleware.includes('invalidatePrismaPoolWaitHistogram()'));
  assert(!telemetry.includes('db_pool_wait_seconds{userId='));
  for (const suffix of ['bucket', 'sum', 'count'])
    assert(exportedMetrics.test('db_pool_wait_seconds_' + suffix));
});

test('expanded synthetic alert suites include all required API, Worker, media and dependency cases', () => {
  const suites = [YAML.parse(load('gafus-alerts.promtool.test.yml')),
    YAML.parse(load('gafus-alerts-agent2.promtool.test.yml'))];
  const cases = suites.flatMap(s => s.tests ?? []);
  assert(cases.length >= 20);
  const checkedNames = new Set(cases.flatMap(t => (t.alert_rule_test ?? []).map(a => a.alertname)));
  for (const name of [
    'GafusApi5xxElevated', 'GafusApiP95High', 'GafusWorkerNoSuccessWithBacklog',
    'GafusChat2OutboxOldestPending', 'GafusChat2DispatchRetryStorm',
    'GafusChat2OutboxDeadLetters', 'GafusMediaLeaseStalled',
    'GafusPostgresUnavailable', 'GafusRedisUnavailable', 'GafusHttpServiceDown',
    'GafusWorkerAttemptMetricsMissing', 'GafusApiMetricsMissing',
  ]) assert(checkedNames.has(name), 'missing rule fixture: ' + name);
});
