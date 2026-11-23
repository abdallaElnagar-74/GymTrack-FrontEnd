import { Alert, Platform } from 'react-native';

/** Cross-platform confirm dialog (Alert buttons don't work on web). */
export function confirm(
  title: string,
  message: string,
  confirmText: string,
  onConfirm: () => void,
  opts: { destructive?: boolean; cancelText?: string } = {}
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: opts.cancelText ?? 'Cancel', style: 'cancel' },
    { text: confirmText, style: opts.destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

/** Cross-platform simple message. */
export function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
