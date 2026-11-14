import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  manipulate: vi.fn(),
  sizes: new Map<string, number>(),
  contents: new Map<string, Uint8Array>(),
  writes: [] as Array<{ uri: string; bytes: Uint8Array }>,
  removed: [] as string[],
}));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: undefined,
  SaveFormat: { WEBP: "webp" }, manipulateAsync: mock.manipulate,
}));
vi.mock("expo-file-system", () => ({
  File: class {
    constructor(readonly uri: string) {}
    get size() { return mock.sizes.get(this.uri) ?? 0; }
    async bytes() {
      return mock.contents.get(this.uri) ?? new Uint8Array([
        82,73,70,70, 22,0,0,0, 87,69,66,80, // RIFF WEBP
        86,80,56,88, 10,0,0,0, 0,0,0,0,0,0,0,0,0,0, // VP8X clean
      ]);
    }
    write(bytes: Uint8Array) {
      mock.contents.set(this.uri, bytes);
      mock.sizes.set(this.uri, bytes.length);
      mock.writes.push({ uri: this.uri, bytes });
    }
    delete() { mock.removed.push(this.uri); }
  },
}));
import { prepareUploadWebp, prepareUploadWebpVariants, sanitizePreparedWebpVariant } from "./prepareUploadWebp";

beforeEach(() => {
  mock.manipulate.mockReset();
  mock.sizes.clear();
  mock.contents.clear();
  mock.writes.length = 0;
  mock.removed.length = 0;
});
describe("native client-only WebP encoding", () => {
  it("generates 360, 720 and 1440 variants without enlarging originals", async () => {
    for (const [uri, width, height, bytes] of [
      ["file:///tmp/s.webp", 360, 270, 12_000],
      ["file:///tmp/m.webp", 720, 540, 53_000],
      ["file:///tmp/l.webp", 1440, 1080, 230_000],
    ] as const) {
      mock.manipulate.mockResolvedValueOnce({ uri, width, height });
      mock.sizes.set(uri, bytes);
    }
    const out = await prepareUploadWebpVariants({ uri: "file:///orig/photo.jpg", width: 4032, height: 3024 },
      { small: 360, medium: 720, large: 1440 });
    expect(mock.manipulate.mock.calls.map(([uri, actions, options]) => ({ uri, actions, options })))
      .toEqual([360, 720, 1440].map(edge => ({
        uri: "file:///orig/photo.jpg", actions: [{ resize: { width: edge } }],
        options: { format: "webp", compress: 0.8 },
      })));
    expect(out.small.bytes).toBe(12_000);
    expect(out.medium.width).toBe(720);
    expect(out.large.height).toBe(1080);
    out.small.dispose(); out.medium.dispose(); out.large.dispose();
    expect(mock.removed).toHaveLength(3);
    expect(mock.removed).not.toContain("file:///orig/photo.jpg");
  });

  it("prepares 360px preview + 1440px full photo on iOS/Android for Chat2 and Questions",async()=>{
    mock.manipulate.mockResolvedValueOnce({uri:"file:///tmp/preview.webp",width:225,height:360})
      .mockResolvedValueOnce({uri:"file:///tmp/full.webp",width:900,height:1440});
    mock.sizes.set("file:///tmp/preview.webp",30_000);
    mock.sizes.set("file:///tmp/full.webp",325_000);
    const renditions=await prepareUploadWebpVariants({uri:"file:///orig/portrait.jpg",width:1500,height:2400},
      {small:360,medium:1440});
    expect(mock.manipulate.mock.calls.map(([,actions,options])=>({actions,options}))).toEqual([
      {actions:[{resize:{height:360}}],options:{format:"webp",compress:0.8}},
      {actions:[{resize:{height:1440}}],options:{format:"webp",compress:0.8}},
    ]);
    expect(renditions.small.height).toBe(360);
    expect(renditions.medium.height).toBe(1440);
    renditions.small.dispose();renditions.medium.dispose();
  });
  it("removes native Android ICCP metadata before declaring WebP bytes to S3", async () => {
    const uri = "file:///tmp/android-icc.webp";
    const icc = new Uint8Array([
      82,73,70,70, 48,0,0,0, 87,69,66,80,
      86,80,56,88, 10,0,0,0, 32,0,0,0,0,0,0,0,0,0,
      73,67,67,80, 3,0,0,0, 9,8,7,0,
      86,80,56,32, 6,0,0,0, 1,2,3,4,5,6,
    ]);
    mock.manipulate.mockResolvedValueOnce({ uri, width: 270, height: 480 });
    mock.contents.set(uri, icc);
    mock.sizes.set(uri, icc.length);
    const result = await prepareUploadWebp({
      uri: "file:///orig/android.jpg", width: 270, height: 480,
    }, 720);
    expect(result.bytes).toBe(44);
    expect(mock.writes).toHaveLength(1);
    expect(mock.writes[0]?.bytes[20]).toBe(0); // VP8X ICC flag removed
    expect(mock.writes[0]?.bytes).toEqual(new Uint8Array([
      ...icc.slice(0, 4), 36,0,0,0, ...icc.slice(8, 20),
      0, ...icc.slice(21, 30), ...icc.slice(42),
    ]));
    expect(await sanitizePreparedWebpVariant(result)).toBe(false);
    result.dispose();
    expect(mock.removed).toEqual([uri]);
  });
  it("encodes without enlarging an image already smaller than target edge", async () => {
    mock.manipulate.mockResolvedValueOnce({ uri: "file:///tmp/tiny.webp", width: 250, height: 180 });
    mock.sizes.set("file:///tmp/tiny.webp", 1200);
    await prepareUploadWebp({ uri: "file:///orig/small.jpg", width: 250, height: 180 }, 720);
    expect(mock.manipulate).toHaveBeenCalledWith("file:///orig/small.jpg", [],
      { format: "webp", compress: 0.8 });
  });

  it("revalidates actual dimensions even when picker dimensions were wrong", async () => {
    mock.manipulate.mockResolvedValueOnce({ uri: "file:///tmp/first.webp", width: 900, height: 400 })
      .mockResolvedValueOnce({ uri: "file:///tmp/final.webp", width: 360, height: 160 });
    mock.sizes.set("file:///tmp/final.webp", 2300);
    const photo = await prepareUploadWebp({ uri: "file:///orig/unknown.jpg", width: 0, height: 0 }, 360);
    expect(mock.manipulate).toHaveBeenCalledTimes(2);
    expect(mock.manipulate.mock.calls[1]?.[1]).toEqual([{ resize: { width: 360 } }]);
    photo.dispose();
    expect(mock.removed).toEqual(["file:///tmp/first.webp", "file:///tmp/final.webp"]);
  });

  it("automatically shrinks an oversized 720px WebP without changing quality 0.8", async () => {
    mock.manipulate.mockResolvedValueOnce({ uri: "file:///tmp/s.webp", width: 360, height: 270 })
      .mockResolvedValueOnce({ uri: "file:///tmp/m-big.webp", width: 720, height: 540 })
      .mockResolvedValueOnce({ uri: "file:///tmp/m-smaller.webp", width: 576, height: 432 });
    mock.sizes.set("file:///tmp/s.webp", 800);
    mock.sizes.set("file:///tmp/m-big.webp", 1_750_001);
    mock.sizes.set("file:///tmp/m-smaller.webp", 740_000);
    const output = await prepareUploadWebpVariants({ uri: "file:///orig/s.jpg", width: 1440, height: 1080 },
      { small: 360, medium: 720 });
    expect(output.medium.width).toBe(576);
    expect(output.medium.bytes).toBe(740_000);
    expect(mock.manipulate.mock.calls[2]).toEqual([
      "file:///tmp/m-big.webp", [{ resize: { width: 576 } }],
      { format: "webp", compress: 0.8 },
    ]);
    output.small.dispose(); output.medium.dispose();
    expect(mock.removed).toEqual(["file:///tmp/m-big.webp", "file:///tmp/s.webp", "file:///tmp/m-smaller.webp"]);
  });
});
