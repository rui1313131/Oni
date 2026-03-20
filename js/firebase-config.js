// Firebase設定管理
const FirebaseConfig = (() => {
  const STORAGE_KEY = 'oni_firebase_config';

  // デフォルト設定（ONI本番用Firebase）
  const defaultConfig = {
    apiKey: "AIzaSyB-4hFx6okJcRfltyGfDsUbWULIIiQwGR4",
    authDomain: "oni-tag-game.firebaseapp.com",
    databaseURL: "https://oni-tag-game-default-rtdb.firebaseio.com",
    projectId: "oni-tag-game",
    storageBucket: "oni-tag-game.firebasestorage.app",
    messagingSenderId: "389101133494",
    appId: "1:389101133494:web:0937c83f73f752ad6b5017"
  };

  let db = null;
  let isInitialized = false;

  function loadConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Firebase設定の読み込みに失敗:', e);
    }
    return null;
  }

  function saveConfig(config) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  async function init() {
    const config = loadConfig() || (defaultConfig.databaseURL ? defaultConfig : null);
    if (!config || !config.databaseURL) {
      console.warn('Firebase設定が未構成です。設定画面で設定してください。');
      return false;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      db = firebase.database();

      // 匿名認証
      try {
        await firebase.auth().signInAnonymously();
        console.log('匿名認証完了: UID =', firebase.auth().currentUser?.uid);
      } catch (err) {
        console.warn('匿名認証エラー:', err);
      }

      isInitialized = true;
      console.log('Firebase初期化完了');
      return true;
    } catch (e) {
      console.error('Firebase初期化エラー:', e);
      return false;
    }
  }

  function getDB() {
    return db;
  }

  function isReady() {
    return isInitialized && db !== null;
  }

  function getConfig() {
    return loadConfig() || defaultConfig;
  }

  function updateConfig(newConfig) {
    saveConfig(newConfig);
    // 再初期化
    isInitialized = false;
    return init();
  }

  return { init, getDB, isReady, getConfig, updateConfig, saveConfig, loadConfig };
})();
