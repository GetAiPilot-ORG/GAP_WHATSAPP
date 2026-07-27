let loadPromise = null;

/**
 * Dynamically loads and initializes the Facebook SDK with duplicate loading protection.
 * Returns a Promise that resolves with the initialized `window.FB` instance.
 */
export function loadFacebookSDK() {
  // 1. If window.FB already exists, resolve immediately.
  if (window.FB) {
    return Promise.resolve(window.FB);
  }

  // 2. If there is an active loading promise in-flight, return it to prevent duplicate loads.
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    // 3. Duplicate script tag protection: Check if script element is already in DOM
    if (document.getElementById('facebook-jssdk')) {
      const checkFB = setInterval(() => {
        if (window.FB) {
          clearInterval(checkFB);
          resolve(window.FB);
        }
      }, 50);

      // Timeout after 10 seconds to prevent hanging
      setTimeout(() => {
        clearInterval(checkFB);
        loadPromise = null;
        reject(new Error('Facebook SDK script exists, but window.FB initialization timed out.'));
      }, 10000);
      return;
    }

    // 4. Set up the async initialization function called by the FB SDK script on load.
    window.fbAsyncInit = function () {
      try {
        const appId = import.meta.env.VITE_META_APP_ID || '1459710399100167';
        window.FB.init({
          appId: appId,
          cookie: true,
          autoLogAppEvents: true,
          xfbml: true,
          version: 'v18.0'
        });
        resolve(window.FB);
      } catch (err) {
        loadPromise = null;
        reject(err);
      }
    };

    // 5. Create and inject the SDK script element.
    try {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';

      script.onerror = (err) => {
        loadPromise = null; // Allow retry on network/load failure
        reject(new Error('Failed to load Facebook SDK script.'));
      };

      const firstScript = document.getElementsByTagName('script')[0];
      if (firstScript && firstScript.parentNode) {
        firstScript.parentNode.insertBefore(script, firstScript);
      } else {
        (document.head || document.body).appendChild(script);
      }
    } catch (err) {
      loadPromise = null;
      reject(err);
    }
  });

  return loadPromise;
}
