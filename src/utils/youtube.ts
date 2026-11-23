// Note: plain regex parsing on purpose — React Native's built-in URL/URLSearchParams are incomplete.

const ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts the video id (and optional start time) from any common YouTube link:
 * youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID, /embed/ID, /live/ID, m.youtube.com, music.youtube.com.
 */
export function parseYouTube(input: string): { id: string; start: number } | null {
  const raw = input.trim();
  if (ID.test(raw)) return { id: raw, start: 0 };
  const m = raw.match(/^(?:https?:\/\/)?(?:(?:www|m|music)\.)?([a-z0-9.-]+)(\/[^?#]*)?(\?[^#]*)?/i);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const path = m[2] ?? '';
  const query = m[3] ?? '';
  const param = (k: string) => query.match(new RegExp(`[?&]${k}=([^&]*)`))?.[1] ?? null;

  let id: string | null = null;
  if (host === 'youtu.be') {
    id = path.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = param('v') ?? path.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/)?.[1] ?? null;
  }
  if (!id || !ID.test(id)) return null;
  return { id, start: parseStart(param('t') ?? param('start')) };
}

/** "90", "90s", "1m30s", "1h2m3s" -> seconds */
function parseStart(t: string | null) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function youTubeThumb(id: string) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function youTubeWatchUrl(id: string, start = 0) {
  return `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`;
}

export function youTubeEmbedUrl(id: string, start = 0) {
  return `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&rel=0${start ? `&start=${start}` : ''}`;
}
