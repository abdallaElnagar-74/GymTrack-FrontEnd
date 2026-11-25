import { useEffect, useRef } from 'react';
import { usePreventRemove } from 'expo-router';

import { t } from '../i18n';
import { confirm } from '../utils/confirm';

/**
 * While `dirty` (changes typed but not saved with the Save button), leaving the screen asks
 * "Discard changes?" first, so nothing is lost by tapping back by mistake.
 */
export function useUnsavedGuard(dirty: boolean) {
  const disableRef = useRef<() => void>(() => {});
  const disable = usePreventRemove(dirty, ({ repeat }) =>
    confirm(
      t('Discard changes?'),
      t('You have changes that aren’t saved. Leave without saving?'),
      t('Discard'),
      () => {
        disableRef.current();
        repeat();
      },
      { destructive: true, cancelText: t('Keep editing') }
    )
  );
  useEffect(() => {
    disableRef.current = disable;
  }, [disable]);
}
