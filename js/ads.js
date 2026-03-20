// 広告管理システム
const AdManager = (() => {
  let initialized = false;
  let platform = 'web'; // 'web' or 'android'
  let bannerVisible = false;

  // AdMob設定（Capacitor/Android用）
  const ADMOB_CONFIG = {
    appId: 'ca-app-pub-8709386372302469~1950669310',
    bannerId: 'ca-app-pub-8709386372302469/5761221119',
    interstitialId: 'ca-app-pub-8709386372302469/1069099386',
    rewardedId: 'ca-app-pub-8709386372302469/9912919811',
    testMode: false
  };

  // AdSense設定（Web用）
  const ADSENSE_CONFIG = {
    clientId: 'ca-pub-8709386372302469',
    bannerSlot: '',
    testMode: false
  };

  async function init() {
    if (initialized) return;

    // プラットフォーム判定
    platform = detectPlatform();
    console.log('AdManager: platform =', platform);

    if (platform === 'android') {
      await initAdMob();
    } else {
      initAdSense();
    }

    initialized = true;
  }

  function detectPlatform() {
    // Capacitor環境チェック
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      return 'android';
    }
    return 'web';
  }

  // ========== AdMob (Android/Capacitor) ==========
  async function initAdMob() {
    try {
      // @capacitor-community/admob プラグイン
      const { AdMob } = window.Capacitor.Plugins || {};
      if (!AdMob) {
        console.warn('AdMob plugin not available');
        return;
      }

      await AdMob.initialize({
        requestTrackingAuthorization: false,
        testingDevices: ADMOB_CONFIG.testMode ? ['DEVICE_ID'] : [],
        initializeForTesting: ADMOB_CONFIG.testMode
      });

      console.log('AdMob initialized');
    } catch (e) {
      console.warn('AdMob init failed:', e);
    }
  }

  async function showAdMobBanner() {
    try {
      const { AdMob } = window.Capacitor.Plugins || {};
      if (!AdMob || !ADMOB_CONFIG.bannerId) return;

      await AdMob.showBanner({
        adId: ADMOB_CONFIG.bannerId,
        adSize: 'ADAPTIVE_BANNER',
        position: 'BOTTOM_CENTER',
        margin: 0,
        isTesting: ADMOB_CONFIG.testMode
      });
      bannerVisible = true;
    } catch (e) {
      console.warn('Banner show failed:', e);
    }
  }

  async function hideAdMobBanner() {
    try {
      const { AdMob } = window.Capacitor.Plugins || {};
      if (!AdMob) return;
      await AdMob.hideBanner();
      bannerVisible = false;
    } catch (e) {
      console.warn('Banner hide failed:', e);
    }
  }

  async function showAdMobInterstitial() {
    try {
      const { AdMob } = window.Capacitor.Plugins || {};
      if (!AdMob || !ADMOB_CONFIG.interstitialId) return;

      await AdMob.prepareInterstitial({
        adId: ADMOB_CONFIG.interstitialId,
        isTesting: ADMOB_CONFIG.testMode
      });
      await AdMob.showInterstitial();
    } catch (e) {
      console.warn('Interstitial failed:', e);
    }
  }

  async function showAdMobRewarded() {
    try {
      const { AdMob } = window.Capacitor.Plugins || {};
      if (!AdMob || !ADMOB_CONFIG.rewardedId) return false;

      await AdMob.prepareRewardVideoAd({
        adId: ADMOB_CONFIG.rewardedId,
        isTesting: ADMOB_CONFIG.testMode
      });

      return new Promise((resolve) => {
        const handler = AdMob.addListener('onRewardedVideoAdReward', () => {
          handler.remove();
          resolve(true);
        });
        const closeHandler = AdMob.addListener('onRewardedVideoAdClosed', () => {
          closeHandler.remove();
          resolve(false);
        });
        AdMob.showRewardVideoAd();
      });
    } catch (e) {
      console.warn('Rewarded ad failed:', e);
      return false;
    }
  }

  // ========== AdSense (Web) ==========
  function initAdSense() {
    if (!ADSENSE_CONFIG.clientId) {
      console.log('AdSense: clientId未設定 - 広告スキップ');
      return;
    }

    // AdSenseスクリプト動的ロード
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CONFIG.clientId}`;
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);

    script.onload = () => {
      console.log('AdSense loaded');
      refreshAdSlots();
    };
  }

  function refreshAdSlots() {
    try {
      const ads = document.querySelectorAll('.adsbygoogle:not([data-ad-loaded])');
      ads.forEach(ad => {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        ad.setAttribute('data-ad-loaded', 'true');
      });
    } catch (e) {
      console.warn('AdSense refresh failed:', e);
    }
  }

  // ========== 統一API ==========

  // バナー広告表示（メニュー・ロビー・リザルト画面）
  function showBanner() {
    if (platform === 'android') {
      showAdMobBanner();
    } else {
      // Web: バナー要素を表示
      const banners = document.querySelectorAll('.ad-banner');
      banners.forEach(b => b.style.display = 'block');
      refreshAdSlots();
      bannerVisible = true;
    }
  }

  // バナー広告非表示（ゲーム画面）
  function hideBanner() {
    if (platform === 'android') {
      hideAdMobBanner();
    } else {
      const banners = document.querySelectorAll('.ad-banner');
      banners.forEach(b => b.style.display = 'none');
      bannerVisible = false;
    }
  }

  // インタースティシャル広告（ゲーム終了時）
  async function showInterstitial() {
    if (platform === 'android') {
      await showAdMobInterstitial();
    }
    // Web版ではインタースティシャルは使わない（UX考慮）
  }

  // リワード広告（スタミナ回復など）
  async function showRewarded() {
    if (platform === 'android') {
      return await showAdMobRewarded();
    }
    return false;
  }

  // 画面遷移時に呼ぶ
  function onScreenChange(screenId) {
    const showBannerScreens = ['menu', 'lobby', 'result'];
    if (showBannerScreens.includes(screenId)) {
      showBanner();
    } else {
      hideBanner();
    }
  }

  // 設定更新
  function updateConfig(config) {
    if (config.admob) {
      Object.assign(ADMOB_CONFIG, config.admob);
    }
    if (config.adsense) {
      Object.assign(ADSENSE_CONFIG, config.adsense);
    }
  }

  return {
    init,
    showBanner,
    hideBanner,
    showInterstitial,
    showRewarded,
    onScreenChange,
    updateConfig,
    getPlatform: () => platform,
    isInitialized: () => initialized
  };
})();
