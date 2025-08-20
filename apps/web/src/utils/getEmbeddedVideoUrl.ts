export function getEmbeddedVideoInfo(url: string | null): {
  embedUrl: string;
  isShorts: boolean;
} {
  if (!url) {
    return { embedUrl: "", isShorts: false };
  }

  const shortsRegex = /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/;
  const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

  const shortsMatch = url.match(shortsRegex);
  if (shortsMatch) {
    return {
      embedUrl: `https://www.youtube.com/embed/${shortsMatch[1]}`,
      isShorts: true,
    };
  }

  const youtubeMatch = url.match(youtubeRegex);
  if (youtubeMatch) {
    return {
      embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}`,
      isShorts: false,
    };
  }

  // RuTube и другие
  const rutubeMatch = url.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rutubeMatch) {
    return {
      embedUrl: `https://rutube.ru/play/embed/${rutubeMatch[1]}`,
      isShorts: false,
    };
  }

  return { embedUrl: url, isShorts: false };
}
