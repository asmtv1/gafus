/**
 * NEVER mount public GAFUS routes here: temporary isolated Core harness for
 * Cloud.ru media worker tests. Postgres+Redis are strictly localhost staging.
 * Does not import the production API application or initialize user routes.
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { internalGalleryRoutes } from './routes/internal/gallery.js';
import { internalFeedRoutes } from './routes/internal/feed.js';
import { connection as redis } from '@gafus/queues';
import { checkCoreDatabaseReady } from '@gafus/core/services/systemHealth';
if (process.env.GAFUS_MEDIA_CORE_STAGE_ONLY !== 'isolated-localhost' ||
    !process.env.DATABASE_URL?.includes('@127.0.0.1:55448/gafus_media_stage') ||
    !process.env.REDIS_URL?.includes('@127.0.0.1:56389') ||
    process.env.GALLERY_ENABLED !== 'false' ||
    process.env.FEED_ENABLED !== 'false')
  throw Error('STAGING_CORE_PRODUCTION_ISOLATION_FAILED');
const app = new Hono();
app.get('/stage-health', async c => {
  try {await Promise.all([checkCoreDatabaseReady(),redis.ping()]);return c.json({status:'ready',environment:'isolated-staging'});}
  catch {return c.json({status:'unready'},503);}
});
app.route('/internal/gallery',internalGalleryRoutes);
app.route('/internal/feed',internalFeedRoutes);
const port=Number(process.env.API_PORT??'31339');
if(port!==31339)throw Error('STAGING_CORE_PORT_MISMATCH');
const server=serve({fetch:app.fetch,hostname:'127.0.0.1',port});
console.log('GAFUS_ISOLATED_MEDIA_CORE_LISTENING=127.0.0.1:31339');
process.on('SIGTERM',()=>{server.close();void redis.quit();});
