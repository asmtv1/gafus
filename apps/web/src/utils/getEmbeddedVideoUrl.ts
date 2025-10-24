export function getEmbeddedVideoInfo(url: string | null): {
  embedUrl: string;
  isShorts: boolean;
} {
  if (!url) {
    return { embedUrl: "", isShorts: false };
  }

  // YouTube Shorts
  const shortsRegex = /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/;
  const shortsMatch = url.match(shortsRegex);
  if (shortsMatch) {
    return {
      embedUrl: `https://www.youtube.com/embed/${shortsMatch[1]}`,
      isShorts: true,
    };
  }

  // YouTube обычное видео
  const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const youtubeMatch = url.match(youtubeRegex);
  if (youtubeMatch) {
    return {
      embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}`,
      isShorts: false,
    };
  }

  // RuTube
  const rutubeMatch = url.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rutubeMatch) {
    return {
      embedUrl: `https://rutube.ru/play/embed/${rutubeMatch[1]}`,
      isShorts: false,
    };
  }

  // VK Video - различные форматы
  // Формат: vk.com/video-123456789_456789012 или vk.com/video123456789_456789012
  const vkMatch = url.match(/(?:vk\.com|m\.vk\.com)\/video(-?\d+)_(\d+)/);
  if (vkMatch) {
    const oid = vkMatch[1];
    const id = vkMatch[2];
    return {
      embedUrl: `https://vk.com/video_ext.php?oid=${oid}&id=${id}`,
      isShorts: false,
    };
  }

  // VK Video с параметром z: vk.com/video?z=video-123456789_456789012
  const vkZMatch = url.match(/(?:vk\.com|m\.vk\.com)\/video\?z=video(-?\d+)_(\d+)/);
  if (vkZMatch) {
    const oid = vkZMatch[1];
    const id = vkZMatch[2];
    return {
      embedUrl: `https://vk.com/video_ext.php?oid=${oid}&id=${id}`,
      isShorts: false,
    };
  }

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return {
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
      isShorts: false,
    };
  }

  return { embedUrl: url, isShorts: false };
}
