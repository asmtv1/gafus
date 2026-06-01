type YandexRewardedRenderInput = {
  blockId: string;
  sessionId: string;
  requestNonce: string;
  onGrant: (input: { sessionId: string; requestNonce: string }) => Promise<void>;
  onEvent?: (eventType: "SHOWN" | "DISMISSED" | "FAILED" | "REWARDED") => void;
};

declare global {
  interface Window {
    Ya?: {
      Context?: {
        AdvManager?: {
          render: (input: {
            blockId: string;
            type: "rewarded";
            platform: "desktop" | "touch";
            onRewarded: (isRewarded: boolean) => void;
            onError?: () => void;
            onClose?: () => void;
          }) => void;
          getPlatform?: () => "desktop" | "touch";
        };
      };
    };
  }
}

let loaderPromise: Promise<void> | null = null;

export function loadYandexRewardedLoader(): Promise<void> {
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-gafus-yandex-rewarded="true"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("YANDEX_REWARDED_LOAD_FAILED")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://yandex.ru/ads/system/context.js";
    script.async = true;
    script.dataset.gafusYandexRewarded = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("YANDEX_REWARDED_LOAD_FAILED"));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

function getYandexRewardedPlatform(): "desktop" | "touch" {
  const platform = window.Ya?.Context?.AdvManager?.getPlatform?.();
  if (platform === "desktop" || platform === "touch") return platform;
  return matchMedia("(pointer: coarse)").matches ? "touch" : "desktop";
}

export async function renderYandexRewarded(input: YandexRewardedRenderInput): Promise<void> {
  await loadYandexRewardedLoader();
  const manager = window.Ya?.Context?.AdvManager;
  if (!manager) {
    throw new Error("YANDEX_REWARDED_UNAVAILABLE");
  }

  let granted = false;
  manager.render({
    blockId: input.blockId,
    type: "rewarded",
    platform: getYandexRewardedPlatform(),
    onRewarded: (isRewarded) => {
      if (!isRewarded || granted) return;
      granted = true;
      void input.onGrant({ sessionId: input.sessionId, requestNonce: input.requestNonce });
    },
    onClose: () => input.onEvent?.("DISMISSED"),
    onError: () => input.onEvent?.("FAILED"),
  });
}
