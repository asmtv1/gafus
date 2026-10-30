// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it} from "vitest";
import {PetWeightChart} from "./PetWeightChart";
import type {PetWeightHistoryRead} from "./petApi";
const data:PetWeightHistoryRead={
  currentWeightKg:12,targetWeightKg:11,
  entries:[
    {id:"old",weightKg:20,measuredAt:"2024-01-01T12:00:00.000Z"},
    {id:"middle",weightKg:14,measuredAt:"2026-07-01T12:00:00.000Z"},
    {id:"latest",weightKg:12,measuredAt:"2026-10-25T12:00:00.000Z"},
  ],
};
const now=new Date("2026-10-26T10:00:00.000Z");
let host:HTMLDivElement,root:Root;
const chart=()=>host.querySelector('svg[role="img"]');
const buttons=()=>[...host.querySelectorAll<HTMLButtonElement>(
  '[aria-label="Период графика"] button')];
const render=async(value:PetWeightHistoryRead=data)=>act(async()=>
  root.render(<PetWeightChart data={value} now={now}/>));
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
describe("WEB2 Next PetWeight SVG parity on Hono owner-projected data",()=>{
  it("starts on year, plots its dated points and draws target without showing old entry",async()=>{
    await render();
    expect(buttons().map(button=>[button.textContent,button.getAttribute("aria-pressed")]))
      .toEqual([["3 месяца","false"],["Год","true"],["Всё","false"]]);
    expect(chart()?.getAttribute("aria-label")).toBe("График веса: 2 измерений");
    expect(chart()?.querySelectorAll("circle")).toHaveLength(2);
    expect(chart()?.querySelector("polyline")?.getAttribute("points"))
      .toContain("22,");
    expect(chart()?.textContent).toContain("Цель 11 кг");
    expect(host.textContent).toContain("До цели 1 кг · снижение веса");
    expect(host.outerHTML).not.toContain("20 кг");
  });
  it("three-month and full-history periods switch chart only, no mutation",async()=>{
    await render();
    await act(async()=>buttons()[0].click());
    expect(chart()?.querySelectorAll("circle")).toHaveLength(1);
    expect(chart()?.querySelector("polyline")).toBeNull();
    expect(chart()?.querySelector("circle")?.getAttribute("cx")).toBe("250");
    await act(async()=>buttons()[2].click());
    expect(chart()?.querySelectorAll("circle")).toHaveLength(3);
    expect(chart()?.getAttribute("aria-label")).toContain("3 измерений");
    expect(chart()?.querySelector("polyline")?.getAttribute("points")?.split(" "))
      .toHaveLength(3);
  });
  it("empty period and target-cleared history never invent chart or goal",async()=>{
    await render({currentWeightKg:null,targetWeightKg:null,entries:[]});
    expect(chart()).toBeNull();
    expect(host.textContent).toContain("За этот период измерений нет");
    expect(host.textContent).not.toContain("Цель 11 кг");
  });
  it("equal weight and target reports reached and tooltip uses real owner entry",async()=>{
    await render({...data,targetWeightKg:12});
    expect(host.textContent).toContain("Целевой вес достигнут");
    expect(chart()?.querySelector("circle title")?.textContent).toContain("14 кг");
  });
});
