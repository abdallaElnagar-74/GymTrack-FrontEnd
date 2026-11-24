import { router } from 'expo-router';

import { useSession } from '@/src/api/SessionContext';
import { AccountForm } from '@/src/components/AccountForm';

/** Sign in with email from a guest account (its data is kept). */
export default function AccountScreen() {
  const { apiUrl, isGuest, signIn } = useSession();
  return (
    <AccountForm
      apiUrl={apiUrl}
      fromGuest={isGuest}
      onSubmit={async (url, email, password, mode) => {
        await signIn(url, email, password, mode);
        if (router.canGoBack()) router.back();
      }}
    />
  );
}
