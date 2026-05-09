/**
 * docs-theme.js
 * 主题管理占位 Stub — 侧边栏初始化已由 sidebar.js 处理。
 * 此文件保留供扩展（如主题色/字体切换）使用。
 */
(function () {
  var THEME_KEY = 'plice-docs-theme';
  var themes = ['light', 'dark'];

  function getTheme() {
    return localStorage.getItem(THEME_KEY) || 'light';
  }

  function setTheme(name) {
    if (!themes.includes(name)) return;
    localStorage.setItem(THEME_KEY, name);
    applyTheme(name);
  }

  function applyTheme(name) {
    document.documentElement.dataset.theme = name;
    document.body.dataset.theme = name;
  }

  // 初始化
  applyTheme(getTheme());

  // 暴露 API 供控制面板调用
  window.docsTheme = {
    get: getTheme,
    set: setTheme,
    toggle: function () {
      setTheme(getTheme() === 'light' ? 'dark' : 'light');
    },
  };
})();
