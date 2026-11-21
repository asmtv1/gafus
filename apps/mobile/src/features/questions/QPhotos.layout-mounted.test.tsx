// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const media = vi.hoisted(() => ({
  loaded: new Map<string, (e: {source:{width:number;height:number}})=>void>(),
  picker: vi.fn(), permission: vi.fn(),
}));
vi.mock("react-native", async () => {
  const R = await import("react");
  const View = ({children,onLayout,style}:{
    children?:React.ReactNode;
    onLayout?:(e:{nativeEvent:{layout:{width:number}}})=>void;
    style?:unknown;
  }) => R.createElement("div", {
    "data-layout": JSON.stringify(style),
    "data-grid": onLayout?"true":undefined,
    ref: onLayout ? (el: HTMLDivElement|null)=>{
      if(el && !el.dataset.measured) {
        el.dataset.measured="true";
        queueMicrotask(()=>onLayout({nativeEvent:{layout:{width:320}}}));
      }
    }:undefined,
  },children);
  return {
    View,
    Pressable: ({children,accessibilityLabel,onPress,style}:{
      children?:React.ReactNode;accessibilityLabel?:string;
      onPress?:()=>void;style?:unknown;
    })=>R.createElement("button",{
      "aria-label":accessibilityLabel,"data-layout":JSON.stringify(style),onClick:onPress,
    },children),
    Text: ({children}: {children?:React.ReactNode})=>R.createElement("span",null,children),
    TextInput: ()=>null,
    FlatList: ()=>null,
    Linking:{openURL:vi.fn()},
    Alert:{alert:vi.fn()},
    Platform:{OS:"android"},
    Modal:()=>null,
    useWindowDimensions:()=>({width:390,height:844}),
    PixelRatio:{get:()=>3},
    StyleSheet:{create:<T,>(styles:T)=>styles},
  };
});
vi.mock("expo-image", async()=>{
  const R=await import("react");
  return {Image:({source,contentFit,onLoad}:{
    source:{uri:string};contentFit:string;
    onLoad?:(e:{source:{width:number;height:number}})=>void;
  })=>{
    if(onLoad)media.loaded.set(source.uri,onLoad);
    return R.createElement("div",{"data-media":source.uri,"data-fit":contentFit});
  }};
});
vi.mock("@expo/vector-icons",()=>({MaterialCommunityIcons:()=>null}));
vi.mock("expo-status-bar",()=>({StatusBar:()=>null}));
vi.mock("react-native-safe-area-context",()=>({SafeAreaView:()=>null,SafeAreaProvider:()=>null}));
vi.mock("react-native-gesture-handler",()=>({GestureHandlerRootView:()=>null}));
vi.mock("@/shared/components/media/SwipeDismissMedia",()=>({SwipeDismissMedia:()=>null}));
vi.mock("expo-image-picker",()=>({
  launchImageLibraryAsync:media.picker,requestMediaLibraryPermissionsAsync:media.permission,
}));
vi.mock("expo-router",()=>({useRouter:()=>({push:vi.fn()}),Link:()=>null}));
vi.mock("expo-crypto",()=>({randomUUID:()=>"mock-id"}));
vi.mock("@/shared/config",()=>({COLORS:{primary:"green",text:"black",textSecondary:"gray"},FONTS:{
  montserrat:"sans",montserratBold:"sans",montserratMedium:"sans",
}}));
vi.mock("@/shared/stores",()=>({useAuthStore:()=>null}));
vi.mock("@/shared/lib/api/questions",()=>({
  uploadClientQuestionsPhoto:vi.fn(),discardQuestionPhoto:vi.fn(),
}));
vi.mock("@/shared/lib/media/prepareUploadPhoto",()=>({prepareUploadPhoto:vi.fn()}));
vi.mock("@/shared/lib/media/prepareUploadWebp",()=>({prepareUploadWebpVariants:vi.fn()}));
vi.mock("@/shared/lib/media/iosCompatiblePhotoPicker",()=>({iosCompatiblePhotoPicker:vi.fn()}));
vi.mock("@/shared/lib/media/photoRetryMessage",()=>({
  photoRetryMessage:vi.fn(),photoFailureCode:vi.fn(),
}));
vi.mock("@/shared/lib/media/photoUploadStage",()=>({
  PhotoUploadStageError:class extends Error {},
  logPhotoUploadFailure:vi.fn(),photoStageDiagnostic:vi.fn(),
}));
vi.mock("@/shared/lib/error-reporting",()=>({reportClientError:vi.fn()}));
vi.mock("./questionPhotoCdnFallback",()=>({allowQuestionsS3Fallback:vi.fn()}));
vi.mock("./photoDisplay",()=>({questionPhotoTerminalNotice:()=>null}));
vi.mock("./profileLink",()=>({questionAuthorProfileIdentifier:()=>null}));
import { QPhotoPicker, QPhotos } from "./ui";
let host: HTMLDivElement, root: Root;
const photo=(id:string)=>({id,url:"https://cdn.example/"+id+".webp",
  smallUrl:"https://cdn.example/"+id+".webp",status:"READY" as const});
async function loaded(id:string,width:number,height:number){
  const callback=media.loaded.get("https://cdn.example/"+id+".webp");
  expect(callback).toBeTypeOf("function");
  await act(async()=>{callback!({source:{width,height}});});
}
beforeEach(()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  media.loaded.clear();
  media.picker.mockReset();
  media.permission.mockReset();
  host=document.createElement("div");document.body.appendChild(host);
  root=createRoot(host);
});
it("opens a bounded question and answer photo picker without a gallery grant", async () => {
  media.picker.mockResolvedValue({ canceled: true, assets: null });
  const onChange = vi.fn();
  const onBusy = vi.fn();
  await act(async () => root.render(
    <QPhotoPicker compact photos={[photo("existing")]} onChange={onChange} onBusy={onBusy} />,
  ));
  const button = host.querySelector<HTMLButtonElement>('[aria-label="Добавить фото"]');
  expect(button).not.toBeNull();
  await act(async () => button?.click());
  expect(media.permission).not.toHaveBeenCalled();
  expect(media.picker).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 4, legacy: false,
  }));
  expect(onChange).not.toHaveBeenCalled();
  expect(onBusy).toHaveBeenLastCalledWith(false);
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  host.remove();
});
describe("QPhotos mounted responsive images",()=>{
  it("renders a real 9:16 portrait in full and adjusts height on Image onLoad",async()=>{
    await act(async()=>root.render(React.createElement(QPhotos,{photos:[photo("a")] as never})));
    const preview=host.querySelector('[data-media="https://cdn.example/a.webp"]');
    expect(preview?.getAttribute("data-fit")).toBe("contain");
    const button=host.querySelector('button[aria-label="Открыть фото 1 из 1"]');
    expect(button).toBeTruthy();
    const before=JSON.parse(button!.getAttribute("data-layout")||"[]")[1].height;
    await loaded("a",720,1280);
    const after=JSON.parse(button!.getAttribute("data-layout")||"[]")[1].height;
    expect(after).toBeCloseTo(320/(9/16),1);
    expect(after).toBeGreaterThan(before);
  });
  it("adapts two cells' widths and shared height after portrait/landscape loads",async()=>{
    await act(async()=>root.render(React.createElement(QPhotos,{photos:[photo("a"),photo("b")] as never})));
    expect(host.querySelectorAll('[data-fit="contain"]')).toHaveLength(2);
    await loaded("a",720,1280);
    await loaded("b",1600,900);
    const buttons=Array.from(host.querySelectorAll('button[aria-label^="Открыть фото"]'));
    expect(buttons).toHaveLength(2);
    const first=JSON.parse(buttons[0]!.getAttribute("data-layout")||"[]")[1];
    const second=JSON.parse(buttons[1]!.getAttribute("data-layout")||"[]")[1];
    expect(first.flex).toBeLessThan(second.flex);
    expect(first.height).toBe(second.height);
    expect(first.height).toBeGreaterThan(90);
  });
  it("shows the main high-resolution photo for a single question/answer preview",async()=>{
    const full={...photo("full"),smallUrl:"https://cdn.example/tiny-s.webp",smallWidth:270};
    await act(async()=>root.render(React.createElement(QPhotos,{photos:[full] as never})));
    expect(host.querySelector('[data-media="https://cdn.example/full.webp"]')).toBeTruthy();
    expect(host.querySelector('[data-media="https://cdn.example/tiny-s.webp"]')).toBeNull();
    expect(host.querySelector('[data-fit="contain"]')).toBeTruthy();
  });
  it("uses the high-res photo for a large multi-photo cell on high-density Android",async()=>{
    const a={...photo("a"),smallUrl:"https://cdn.example/a-small.webp",smallWidth:270};
    const b={...photo("b"),smallUrl:"https://cdn.example/b-small.webp",smallWidth:270};
    await act(async()=>root.render(React.createElement(QPhotos,{photos:[a,b] as never})));
    expect(host.querySelector('[data-media="https://cdn.example/a.webp"]')).toBeTruthy();
    expect(host.querySelector('[data-media="https://cdn.example/b.webp"]')).toBeTruthy();
    expect(host.querySelectorAll('[data-fit="contain"]')).toHaveLength(2);
  });
  it("does not reuse a prior photo's measured ratio after switching images",async()=>{
    await act(async()=>root.render(React.createElement(QPhotos,{photos:[photo("a")] as never})));
    await loaded("a",720,1280);
    await act(async()=>root.render(React.createElement(QPhotos,{photos:[photo("b")] as never})));
    const button=host.querySelector('button[aria-label="Открыть фото 1 из 1"]');
    const height=JSON.parse(button?.getAttribute("data-layout")||"[]")[1].height;
    expect(height).toBe(320);
    expect(host.querySelector('[data-media="https://cdn.example/b.webp"]')?.getAttribute("data-fit")).toBe("contain");
  });
});
