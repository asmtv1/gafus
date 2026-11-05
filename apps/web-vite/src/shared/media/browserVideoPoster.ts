/** One 480px WebP cover per clip, prepared on the user's browser.
 * No Cloud.ru video Job or server-side frame extraction is needed.
 * A poster is mandatory before promoting an uploaded 720p to READY.
 */
export async function prepareBrowserVideoPoster(source: File): Promise<File> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function")
    throw Error("VIDEO_POSTER_BROWSER_UNAVAILABLE");
  const player = document.createElement("video");
  player.muted = true;
  player.preload = "auto";
  player.playsInline = true;
  const url = URL.createObjectURL(source);
  try {
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const cleanup = () => {
        clearTimeout(timeout);
        player.removeEventListener("loadeddata", onReady);
        player.removeEventListener("error", onError);
      };
      const finish = (error?: Error) => {
        if (done) return;
        done = true;
        cleanup();
        if (error) reject(error); else resolve();
      };
      const onReady = () => finish();
      const onError = () => finish(Error("VIDEO_POSTER_DECODE_FAILED"));
      const timeout = setTimeout(() => finish(Error("VIDEO_POSTER_TIMEOUT")), 12000);
      player.addEventListener("loadeddata", onReady);
      player.addEventListener("error", onError);
      player.src = url;
      player.load();
      if (player.readyState >= 2) finish();
    });
    if (!player.videoWidth || !player.videoHeight)
      throw Error("VIDEO_POSTER_DECODE_FAILED");
    let scale = Math.min(1, 480 / Math.max(player.videoWidth, player.videoHeight));
    for (let i = 0; i < 5; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(player.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(player.videoHeight * scale));
      try {
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw Error("VIDEO_POSTER_CANVAS_UNAVAILABLE");
        context.drawImage(player, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(output => output ? resolve(output) : reject(Error("VIDEO_POSTER_WEBP_FAILED")),
            "image/webp", 0.8);
        });
        if (blob.type !== "image/webp") throw Error("VIDEO_POSTER_WEBP_UNSUPPORTED");
        if (blob.size >= 12 && blob.size <= 1_750_000)
          return new File([blob], "poster.webp", { type: "image/webp" });
      } finally { canvas.width = 0; canvas.height = 0; }
      scale *= 0.75;
    }
    throw Error("VIDEO_POSTER_TOO_LARGE");
  } finally {
    player.removeAttribute("src");
    player.load();
    URL.revokeObjectURL(url);
  }
}
