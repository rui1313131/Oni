// Firebase設定管理
const FirebaseConfig = (() => {
  const STORAGE_KEY = 'oni_firebase_config';

  // デフォルト設定（ユーザーが自分のFirebaseプロジェクトを設定する）
  const defaultConfig = {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
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

  function init() {
    const config = loadConfig();
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
      firebase.auth().signInAnonymously().catch(err => {
        console.warn('匿名認証エラー:', err);
      });

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
