// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('../../shared/api/client',()=>({apiRequest:mocked.api}));
import {WalksConnectedPage} from './WalksConnectedPage';

let host:HTMLDivElement;
let root:ReturnType<typeof createRoot>;
let cache:QueryClient;
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 host=document.createElement('div');document.body.append(host);
 root=createRoot(host);
 cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
 mocked.api.mockReset();
});
afterEach(async()=>{await act(async()=>root.unmount());cache.clear();host.remove()});
async function render(){
 await act(async()=>{root.render(<QueryClientProvider client={cache}><WalksConnectedPage ownerId="owner"/></QueryClientProvider>)});
 for(let i=0;i<35 && host.textContent?.includes('Загружаем прогулки');i++) {
  await act(async()=>{await new Promise(r=>setTimeout(r,10))});
 }
}
describe('owner web walk history',()=>{
 it('reads only the signed-in owner endpoint and shows GPS distance without step double counting',async()=>{
  mocked.api.mockResolvedValueOnce([{clientId:'20ae839f-0604-4d60-8d14-120324347293',startedAt:'2026-11-05T09:00:00Z',
   finishedAt:'2026-11-05T10:00:00Z',durationSeconds:3600,steps:4000,estimatedMeters:3200,
   gpsMeters:2800,gpsEnabled:true,incompleteSteps:false}]);
  await render();
  expect(mocked.api).toHaveBeenCalledWith('/api/v1/walks',expect.objectContaining({method:'GET',browserAuth:true}));
  expect(host.textContent).toContain('2.80 км');
  expect(host.textContent).not.toContain('≈2.80 км');
  expect(host.textContent).toContain('4 000');
  expect(host.textContent).toContain('Маршрут GPS');
 });
 it('renders a clear empty state instead of inventing a map',async()=>{
  mocked.api.mockResolvedValueOnce([]);
  await render();
  expect(host.textContent).toContain('Пока нет завершённых прогулок');
  expect(host.querySelector('[aria-label="Карта записанного маршрута прогулки"]')).toBeNull();
 });
});
