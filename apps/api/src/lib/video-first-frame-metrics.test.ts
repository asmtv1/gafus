import {describe,it,expect} from "vitest";
import {createFirstFrameMetrics,parseFrameEvent} from "./video-first-frame-metrics";
const rendered={surface:"chat",platform:"ios",outcome:"rendered",elapsedMs:1234} as const;
describe("first frame telemetry contract",()=>{
  it("rejects unknown dimensions, URL, IDs, invalid timing, false unsupported native",()=>{
    for (const input of [{...rendered,surface:"unknown"},{...rendered,url:"https://example.test"},
      {...rendered,elapsedMs:-1},{...rendered,elapsedMs:120001},{...rendered,elapsedMs:NaN},
      {...rendered,elapsedMs:1.5},{...rendered,elapsedMs:"1"},{...rendered,id:"private"},
      {platform:"ios",surface:"chat",outcome:"unsupported"},{platform:"web",surface:"chat",outcome:"abandoned",elapsedMs:0}])
      expect(parseFrameEvent(input)).toBeNull();
    expect(parseFrameEvent(rendered)).toEqual(rendered);
    expect(parseFrameEvent({surface:"moments",platform:"web",outcome:"unsupported"})).not.toBeNull();
  });
  it("renders bounded zero buckets, counts only real durations and excludes abandoned",()=>{
    const metrics=createFirstFrameMetrics();
    expect(metrics.render()).toContain('gafus_video_first_frame_seconds_count{surface="chat",platform="ios"} 0');
    metrics.record(rendered); metrics.record({...rendered,elapsedMs:600});
    metrics.record({surface:"chat",platform:"ios",outcome:"abandoned"});
    const value=metrics.render();
    expect(value).toContain('gafus_video_first_frame_seconds_bucket{surface="chat",platform="ios",le="1"} 1');
    expect(value).toContain('gafus_video_first_frame_seconds_bucket{surface="chat",platform="ios",le="2"} 2');
    expect(value).toContain('gafus_video_first_frame_seconds_count{surface="chat",platform="ios"} 2');
    expect(value).toContain('gafus_video_first_frame_observations_total{surface="chat",platform="ios",outcome="abandoned"} 1');
    expect(value.match(/gafus_video_first_frame_seconds_count\{/g)).toHaveLength(12);
  });
});
