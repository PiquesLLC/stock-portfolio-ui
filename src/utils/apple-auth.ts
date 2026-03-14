const APPLE_SDK_ID = 'apple-signin-sdk';
const APPLE_SDK_SRC = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
import { generateUuid } from './uuid';

type AppleUser = { name?: { firstName?: string; lastName?: string } };
type AppleAuthResponse = {
  authorization?: { id_token?: string };
  user?: AppleUser;
};

type AppleAuthApi = {
  init: (config: {
    clientId: string;
    scope: string;
    redirectURI: string;
    usePopup: boolean;
  }) => void;
  signIn: (options?: { nonce?: string }) => Promise<AppleAuthResponse>;
};

declare global {
  interface Window {
    AppleID?: { auth?: AppleAuthApi };
  }
}

let loadPromise: Promise<AppleAuthApi> | null = null;
let initializedKey: string | null = null;

function getAppleConfig() {
  const clientId = import.meta.env.VITE_APPLE_CLIENT_ID as string | undefined;
  const redirectURI = (import.meta.env.VITE_APPLE_REDIRECT_URI as string | undefined) || window.location.origin;
  return { clientId, redirectURI };
}

function initAppleAuth(auth: AppleAuthApi): AppleAuthApi {
  const { clientId, redirectURI } = getAppleConfig();
  if (!clientId) {
    throw new Error('Apple Sign-In not configured');
  }

  const nextKey = `${clientId}|${redirectURI}`;
  if (initializedKey !== nextKey) {
    auth.init({
      clientId,
      scope: 'name email',
      redirectURI,
      usePopup: true,
    });
    initializedKey = nextKey;
  }

  return auth;
}

export function isAppleOAuthEnabled(): boolean {
  return !!getAppleConfig().clientId;
}

export async function ensureAppleAuthReady(): Promise<AppleAuthApi> {
  if (!isAppleOAuthEnabled()) {
    throw new Error('Apple Sign-In not configured');
  }

  if (window.AppleID?.auth) {
    return initAppleAuth(window.AppleID.auth);
  }

  if (!loadPromise) {
    loadPromise = new Promise<AppleAuthApi>((resolve, reject) => {
      let script = document.getElementById(APPLE_SDK_ID) as HTMLScriptElement | null;

      const handleReady = () => {
        const auth = window.AppleID?.auth;
        if (!auth) {
          reject(new Error('Apple Sign-In not loaded'));
          return;
        }
        resolve(initAppleAuth(auth));
      };

      const handleError = () => {
        loadPromise = null;
        reject(new Error('Failed to load Apple Sign-In'));
      };

      if (!script) {
        script = document.createElement('script');
        script.id = APPLE_SDK_ID;
        script.src = APPLE_SDK_SRC;
        script.async = true;
        document.head.appendChild(script);
      }

      script.addEventListener('load', handleReady, { once: true });
      script.addEventListener('error', handleError, { once: true });

      if (window.AppleID?.auth) {
        handleReady();
      }
    });
  }

  return loadPromise;
}

export async function signInWithApple(): Promise<AppleAuthResponse> {
  const auth = await ensureAppleAuthReady();
  const nonce = generateUuid();
  const response = await auth.signIn({ nonce });
  return {
    authorization: response.authorization,
    user: response.user,
    nonce,
  } as AppleAuthResponse & { nonce: string };
}
