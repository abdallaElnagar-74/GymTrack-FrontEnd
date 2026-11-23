import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { youTubeEmbedUrl } from '../utils/youtube';

/**
 * YouTube player for iOS/Android. The iframe is served from an https base URL with a
 * referrer policy, because YouTube refuses to play embeds that don't identify where they're shown.
 */
export function YouTubeEmbed({ id, start }: { id: string; start: number }) {
  const html = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{border:0;width:100%;height:100%}</style>
</head><body>
<iframe src="${youTubeEmbedUrl(id, start)}"
  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
  referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
</body></html>`;
  return (
    <WebView
      style={StyleSheet.absoluteFill}
      source={{ html, baseUrl: 'https://gymtracker.app' }}
      originWhitelist={['*']}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      allowsFullscreenVideo
      javaScriptEnabled
      scrollEnabled={false}
      setSupportMultipleWindows={false}
      backgroundColor="#000"
    />
  );
}
