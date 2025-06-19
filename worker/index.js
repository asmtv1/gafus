import { CacheFirst } from 'workbox-strategies';  // ✅ Добавьте этот импорт
import { RangeRequestsPlugin } from 'workbox-range-requests';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { warmStrategyCache } from 'workbox-recipes';

const audioStrategy = new CacheFirst({
  cacheName: "static-audio-assets",
  plugins: [
    new CacheableResponsePlugin({ statuses: [200] }),
    new RangeRequestsPlugin(),
    new ExpirationPlugin({
      maxEntries: 20,
      maxAgeSeconds: 60 * 60 * 24 * 30,
    }),
  ],
});

// Прогрев аудио-файла при установке
warmStrategyCache({
  urls: ["/music/success.mp3"],
  strategy: audioStrategy,
});