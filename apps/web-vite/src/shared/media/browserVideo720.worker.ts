/** Browser-only video conversion. No media bytes leave this worker except the
 * encoded MP4 returned to the tab, which then uses the existing signed S3 POST.
 */
import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input,
  Mp4InputFormat, Mp4OutputFormat, Output, Quality } from "mediabunny";
import { canReuseWeb720, webVideo720Dimensions } from "./browserVideo720Policy";

type Request = { file: File };
type WorkerResponse =
  | { kind: "progress"; value: number }
  | { kind: "result"; file: File }
  | { kind: "reusable" }
  | { kind: "fallback" };
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: WorkerResponse): void;
};

async function encode(file: File): Promise<File> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw Error("NO_VIDEO_TRACK");
    const width = await videoTrack.getDisplayWidth();
    const height = await videoTrack.getDisplayHeight();
    const dimensions = webVideo720Dimensions(width, height);
    const duration = await videoTrack.getDurationFromMetadata();
    // Source can skip the second lossy encode ONLY after real MP4 codec,
    // timeline, frame-rate, HDR and file-budget checks (never trust MIME).
    if (file.type === "video/mp4" && duration !== null && duration > 0 &&
      duration <= 120 && (await input.getFormat()) instanceof Mp4InputFormat) {
      try {
        const tracks = await input.getTracks();
        const videos = tracks.filter(track => track.type === "video");
        const audios = tracks.filter(track => track.type === "audio");
        const audio = audios[0];
        const fps = await videoTrack.computeFrameRateMetrics({ targetPacketCount: Infinity });
        if (canReuseWeb720({
          container: "mp4", videoCodec: await videoTrack.getCodec(),
          audioCodec: audio ? await audio.getCodec() : null,
          videoTracks: videos.length, audioTracks: audios.length,
          otherTracks: tracks.length - videos.length - audios.length,
          width, height, duration,
          maxFrameRate: fps.maxFrameRate,
          totalBitrate: file.size * 8 / duration,
          hdr: await videoTrack.hasHighDynamicRange(),
          rotation: await videoTrack.getRotation(),
        })) return file;
      } catch { /* uncertain metadata: encode rather than falsely reuse */ }
    }
    if (!dimensions) throw Error("UNSUPPORTED_VIDEO_DIMENSIONS");
    if (duration !== null && (!Number.isFinite(duration) || duration <= 0 || duration > 120))
      throw Error("UNSUPPORTED_VIDEO_DURATION");

    // Never raise 24/25 FPS footage to 30 just to meet an upper limit:
    // use its actual cadence when known, and cap fast sources at 30.
    let outputFps = 30;
    try {
      const metrics = await videoTrack.computeFrameRateMetrics({ targetPacketCount: Infinity });
      if (Number.isFinite(metrics.bestGuessFrameRate) && metrics.bestGuessFrameRate > 0)
        outputFps = Math.min(30, Math.max(1, metrics.bestGuessFrameRate));
    } catch { /* unknown cadence: 30 FPS is the safe encode target */ }

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const conversion = await Conversion.init({
      input, output, tracks: "primary", tags: {},
      video: {
        ...dimensions, fit: "contain", codec: "avc", frameRate: outputFps,
        quality: new Quality({ bitrate: 1_800_000 }),
        allowTransformationMetadata: false,
        hardwareAcceleration: "prefer-hardware", keyFrameInterval: 2,
      },
      audio: { codec: "aac", quality: new Quality({ bitrate: 96_000 }) },
    });
    if (!conversion.isValid || !conversion.utilizedTracks.some(track => track.type === "video"))
      throw Error("BROWSER_VIDEO_CODEC_UNAVAILABLE");
    // Never silently drop the original audio track on output.
    if (await input.getPrimaryAudioTrack() &&
      !conversion.utilizedTracks.some(track => track.type === "audio"))
      throw Error("BROWSER_AUDIO_CODEC_UNAVAILABLE");
    conversion.onProgress = value => scope.postMessage({ kind: "progress", value });
    await conversion.execute();
    const buffer = target.buffer;
    if (!buffer || buffer.byteLength < 1024 || buffer.byteLength > 200 * 1024 * 1024)
      throw Error("INVALID_ENCODED_MP4_SIZE");
    const name = file.name.replace(/\.[^.]+$/, "").slice(0, 180) + "-720.mp4";
    return new File([buffer], name, { type: "video/mp4" });
  } finally {
    input.dispose();
  }
}

scope.onmessage = event => {
  void encode(event.data.file).then(file => {
    scope.postMessage(file === event.data.file ? { kind: "reusable" } : { kind: "result", file });
  }).catch(() => {
    // Browser codec/decode/memory errors: keep the existing server processing.
    scope.postMessage({ kind: "fallback" });
  });
};
