/** Actual Web5 Hono/SQL/Redis/Stream, never use generic API Vitest queue mocks. */
import base from './vitest.config';
import {defineConfig} from 'vitest/config';
export default defineConfig({...base,test:{
  ...base.test,
  setupFiles:[],
  include:['src/routes/v1/web5-chat-isolated-work-stream.integration.test.ts'],
  testTimeout:120000,hookTimeout:100000,
}});
