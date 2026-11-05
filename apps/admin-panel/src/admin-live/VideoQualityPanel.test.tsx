import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VideoQualityPanel } from "./VideoQualityPanel";
import type { VideoPlaybackQualityReport } from "@gafus/types";

const report: VideoPlaybackQualityReport = {
  days:7,from:"2026-10-30",through:"2026-11-05",total:20,
  count360:6,count720:14,percent360:30,auto360:4,manual360:2,
  only360:1,only720:0,fallbackStarts:1,savingData360:2,
  byDay:[{label:"2026-11-05",count360:6,count720:14,total:20}],
  bySurface:[{label:"moments",count360:4,count720:6,total:10},
    {label:"chat",count360:2,count720:8,total:10}],
  byPlatform:[{label:"android",count360:6,count720:14,total:20}],
  byNetwork:[{label:"cellular",count360:6,count720:14,total:20}],
};
describe("ADMIN quality video report",()=>{
  it("shows actual counts and explained 360p usage, by surface, device and date",()=>{
    const html=renderToStaticMarkup(<VideoQualityPanel source={report}/>);
    expect(html).toContain("Фактические начала воспроизведения");
    expect(html).toContain("360p");
    expect(html).toContain("720p");
    expect(html).toContain("30%");
    expect(html).toContain("Автоматически");
    expect(html).toContain("Вручную");
    expect(html).toContain("Моменты");
    expect(html).toContain("Android");
    expect(html).toContain("2026-11-05");
    expect(html).not.toContain("undefined");
  });
  it("shows safe zero-data notice and no fabricated usage",()=>{
    const html=renderToStaticMarkup(<VideoQualityPanel source={{
      ...report,total:0,count360:0,count720:0,byDay:[],
    }}/>);
    expect(html).toContain("Данных пока нет");
    expect(html).toContain("0%");
  });
  it("fails closed on malformed report API payload",()=>{
    expect(renderToStaticMarkup(<VideoQualityPanel source={{total:4}}/>))
      .toContain("Некорректный ответ");
  });
});
