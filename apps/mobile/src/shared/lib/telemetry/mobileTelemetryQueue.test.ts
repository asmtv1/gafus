import { describe, it, expect } from 'vitest';
import type { MobileTelemetryEventV1 } from '@gafus/types';
import {
  emptyTelemetryQueue, enqueueTelemetryEvent, nextTelemetryBatch, applyTelemetryAck,
  trimTelemetryQueue, normalizeTelemetryQueue, telemetryRetryMs, TELEMETRY_MAX_EVENTS,
} from './mobileTelemetryQueue';
// Keep fixtures inside the parser's seven-day ingestion window.
const now = Date.now();
const uuid=(i:number)=>`a0e85460-2534-4e2b-a70a-${i.toString(16).padStart(12,'0')}`;
const event=(i:number,severity:MobileTelemetryEventV1['severity']='ERROR'):MobileTelemetryEventV1 => ({
  schemaVersion:1,eventId:uuid(i),appStartId:uuid(100000),platform:'ios',kind:'js_handled',severity,
  occurredAt:new Date(now).toISOString(),appVersion:'1.8.0',build:'25',runtime:'1.8.0',channel:'preview',updateId:'embedded',
});
describe('durable telemetry queue policy',()=>{
  it('is idempotent, durable ACK removes only accepted events',()=>{
    let s=enqueueTelemetryEvent(emptyTelemetryQueue(),event(1),now);
    s=enqueueTelemetryEvent(s,event(1),now);s=enqueueTelemetryEvent(s,event(2),now);
    expect(s.entries).toHaveLength(2);
    expect(nextTelemetryBatch(s)).toHaveLength(2);
    expect(applyTelemetryAck(s,[uuid(1)]).entries.map(v=>v.event.eventId)).toEqual([uuid(2)]);
    expect(applyTelemetryAck(s,{durable:false})).toEqual(s);
  });
  it('retains fatal while dropping lower priority when capacity reached',()=>{
    // Build a validated, nearly full persisted queue once. Re-enqueuing 503
    // times repeatedly reparses all prior events (O(n²)), exercising only
    // validation work rather than the priority eviction under test.
    const fatalEvent={...event(0,'FATAL'),kind:'js_fatal' as const};
    let s=normalizeTelemetryQueue({
      schemaVersion:1,dropped:0,entries:[
        {event:fatalEvent,enqueuedAt:now,attempts:0},
        ...Array.from({length:TELEMETRY_MAX_EVENTS-1},(_,i)=>({
          event:event(i+1,'INFO'),enqueuedAt:now,attempts:0,
        })),
      ],
    },now);
    expect(s.entries).toHaveLength(TELEMETRY_MAX_EVENTS);
    for(let i=TELEMETRY_MAX_EVENTS;i<=TELEMETRY_MAX_EVENTS+3;i++)
      s=enqueueTelemetryEvent(s,event(i,'INFO'),now);
    expect(s.entries).toHaveLength(TELEMETRY_MAX_EVENTS);
    expect(s.entries[0]?.event.kind).toBe('js_fatal');
    expect(s.dropped).toBe(4);
  });
  it('revalidates persisted event allowlist before sending after app restart',()=>{
    const storage={schemaVersion:1 as const,dropped:0,entries:[
      {event:{...event(1),userId:'PRIVATE_USER',url:'https://secure.invalid/a?token=abc'},enqueuedAt:now,attempts:0},
      {event:event(2),enqueuedAt:now,attempts:0},
    ]};
    const queue=normalizeTelemetryQueue(storage,now);
    expect(queue.entries.map(e=>e.event.eventId)).toEqual([event(2).eventId]);
    expect(JSON.stringify(queue)).not.toMatch(/PRIVATE_USER|secure.invalid|token=abc/);
  });
  it('bounds batches by count and age eviction',()=>{
    const s={schemaVersion:1 as const,dropped:0,entries:Array.from({length:90},(_,i)=>({event:event(i),enqueuedAt:now,attempts:0}))};
    expect(nextTelemetryBatch(s)).toHaveLength(50);
    expect(normalizeTelemetryQueue(s,now+8*86400000).entries).toHaveLength(0);
    expect(trimTelemetryQueue(s).entries).toHaveLength(90);
  });
  it('bounded exponential backoff and Retry-After',()=>{
    expect(telemetryRetryMs(0,0)).toBe(2000);
    expect(telemetryRetryMs(5,0,'300')).toBe(300000);
    expect(telemetryRetryMs(40,0)).toBeLessThanOrEqual(900000);
  });
});
