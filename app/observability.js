const { randomUUID } = require('node:crypto');
const { MeterProvider, PeriodicExportingMetricReader, AggregationType } = require('@opentelemetry/sdk-metrics');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');

const ROUTES = ['/', '/history', '/privacy', '/map', '/event-rooms', '/api/sessions', '/api/saved',
  '/register', '/login', '/logout', '/healthz', '/readyz'];
function routeLabel(path) {
  path = path.split('?')[0];
  if (ROUTES.includes(path)) return path;
  if (/^\/bingo\/\d+(\/mark|\/start)?$/.test(path)) return path.replace(/\d+/, ':id');
  if (/^\/(api\/sessions\/\d+\/buzzwords|sessions\/\d+\/results|api\/saved\/\d+)$/.test(path)) return path.replace(/\d+/, ':id');
  if (path.startsWith('/static/')) return '/static/*';
  return 'unmatched';
}

function createObservability({ env = process.env, instanceId = env.POD_UID || randomUUID() } = {}) {
  const prometheus = new PrometheusExporter({ preventServerStart: true, withoutScopeInfo: true });
  const readers = [prometheus];
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    try {
    const endpoint = new URL(env.OTEL_EXPORTER_OTLP_ENDPOINT);
    if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('unsupported protocol');
    const headers = Object.fromEntries((env.OTEL_EXPORTER_OTLP_HEADERS || '').split(',').filter(Boolean).map(header => {
      const index = header.indexOf('=');
      if (index < 1) throw new Error('invalid header');
      return [header.slice(0,index).trim(), decodeURIComponent(header.slice(index+1).trim())];
    }));
    readers.push(new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/,'')+'/v1/metrics', headers, timeoutMillis: 3000 }),
      exportIntervalMillis: 30000, exportTimeoutMillis: 5000,
    }));
    } catch {
      // Configuration can contain credentials, so do not log the exception.
      console.error('OTLP metrics disabled: invalid configuration');
    }
  }
  const provider = new MeterProvider({ readers,
    resource: resourceFromAttributes({ 'service.name': 'kube-companion', 'service.version': env.APP_VERSION || 'dev',
      'service.instance.id': instanceId, 'k8s.namespace.name': 'team-stg-fryte' }),
    views: [{ instrumentName: 'bingo_word_*', aggregationCardinalityLimit: 20000 },
      { instrumentName: 'bingo_demo_word_*', aggregationCardinalityLimit: 20000 },
      { instrumentName: '*_duration', aggregation: { type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: { boundaries: [0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5,10] } } }],
  });
  const meter = provider.getMeter('kube-companion');
  const requests = meter.createCounter('http_server_requests', { description: 'Completed HTTP requests' });
  const duration = meter.createHistogram('http_server_request_duration', { unit: 's' });
  const dbDuration = meter.createHistogram('db_query_duration', { unit: 's' });
  let snapshot = [], updatedAt = 0;
  const demoSnapshots = new Map();
  const fresh = () => updatedAt > 0 && Date.now()-updatedAt < 60000;
  meter.createObservableGauge('bingo_aggregate_fresh').addCallback(result => result.observe(fresh() ? 1 : 0));
  meter.createObservableGauge('bingo_aggregate_updated_timestamp_seconds').addCallback(result => result.observe(updatedAt/1000));
  for (const [prefix, events] of [['bingo_',()=>snapshot],['bingo_demo_',()=>demoSnapshots.values()]]) {
  for (const [name, field] of [['participants','participants'],['results_final','final']]) {
    meter.createObservableGauge(prefix+name).addCallback(result => {
      for (const event of events()) result.observe(fresh() && event.active !== false ? Number(event[field]) : NaN, { session_id: String(event.id) });
    });
  }
  for (const [name,field] of [['word_reported','reported'],['word_shown','shown']]) {
    meter.createObservableGauge(prefix+name).addCallback(result => {
      for (const event of events()) for (const word of event.words) {
        // Unshown candidates remain in the application JSON; no empty series per candidate.
        if (word.shown > 0) result.observe(fresh() && event.active !== false ? word[field] : NaN, { session_id: String(event.id), word: word.key });
      }
    });
  }
  }
  return { provider, prometheus,
    updateResults(results, at = Date.now()) { snapshot = results; updatedAt = at; },
    updateDemoResults(results) {
      // Explicitly retire removed series: the cumulative SDK retains omitted gauges.
      for (const event of demoSnapshots.values()) event.active=false;
      for (const event of results) demoSnapshots.set(event.id,{...event,active:true});
    },
    recordRequest(method, path, status, seconds) {
      const labels = { method: ['GET','POST','PUT','DELETE','HEAD','OPTIONS','PATCH'].includes(method) ? method : 'OTHER',
        route: routeLabel(path), status: String(status) };
      requests.add(1,labels); duration.record(seconds,labels);
    },
    recordDatabase(operation, seconds, failed) {
      dbDuration.record(seconds, { operation: ['SELECT','INSERT','UPDATE','DELETE','BEGIN','COMMIT','ROLLBACK'].includes(operation) ? operation : 'OTHER', outcome: failed ? 'error' : 'ok' });
    },
  };
}

function instrumentPool(pool, telemetry) {
  pool.on('connect', client => {
    const query = client.query.bind(client);
    client.query = function (...args) {
      const operation = String(typeof args[0] === 'string' ? args[0] : args[0]?.text || '').trim().split(/\s/,1)[0].toUpperCase();
      const start = performance.now();
      const record = error => telemetry.recordDatabase(operation, (performance.now()-start)/1000, !!error);
      const callback = args[args.length-1];
      if (typeof callback === 'function') {
        args[args.length-1] = (error, result) => { record(error); callback(error,result); };
        return query(...args);
      }
      return query(...args).then(result => { record(); return result; }, error => { record(error); throw error; });
    };
  });
}

module.exports = { createObservability, instrumentPool };
