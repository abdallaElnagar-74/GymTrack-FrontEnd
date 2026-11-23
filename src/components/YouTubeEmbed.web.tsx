import { useCallback } from 'react';
import { youTubeEmbedUrl } from '../utils/youtube';

/**
 * YouTube player for the web build (react-native-webview doesn't run on web).
 * The web build is served with Cross-Origin-Embedder-Policy (needed for SQLite on web), so the
 * iframe must be marked `credentialless` *before* its src is set — that's why it's created by hand.
 */
export function YouTubeEmbed({ id, start }: { id: string; start: number }) {
  const mount = useCallback(
    (host: HTMLDivElement | null) => {
      if (!host) return;
      host.replaceChildren();
      const f = document.createElement('iframe');
      (f as any).credentialless = true;
      f.setAttribute('credentialless', '');
      f.title = 'YouTube video';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.allowFullscreen = true;
      f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';
      f.src = youTubeEmbedUrl(id, start);
      host.appendChild(f);
    },
    [id, start]
  );
  return <div ref={mount} style={{ position: 'absolute', inset: 0 }} />;
}
