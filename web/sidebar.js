/* 共享侧边栏注入 — 所有页面统一引用 */
(function () {
  var NAV_ITEMS = [
    {
      href: "/command-situation.html",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l4 4"/><path d="M3 12h2M19 12h2M12 3l-1.5 1.5M12 3l1.5 1.5"/></svg>',
      label: "指挥态势",
    },
    {
      href: "/command-map.html",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
      label: "地图中心",
    },
    {
      href: "/workbench.html",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      label: "警情研判",
    },
    {
      href: "/judgments.html",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
      label: "研判记录",
    },
  ];
  var SYS_ITEMS = [];

  function isActive(href, currentPage) {
    if (href === "/") return currentPage === "index";
    var pathname = window.location.pathname;
    // 去掉 .html 后缀统一匹配
    var normalized = pathname.endsWith(".html") ? pathname.slice(0, -5) : pathname;
    var target = href.endsWith(".html") ? href.slice(0, -5) : href;
    return normalized === target || normalized === href;
  }

  function injectSidebar(currentPage) {
    var sidebar = document.getElementById("app-sidebar");
    if (!sidebar) return;

    var navHtml = NAV_ITEMS.map(function (item) {
      return (
        '<a class="command-app-nav__link' +
        (isActive(item.href, currentPage) ? " command-app-nav__link--active" : "") +
        '" href="' +
        item.href +
        '"><span class="command-app-nav__icon" aria-hidden="true">' +
        item.icon +
        "</span><span class=\"command-app-nav__text\">" +
        item.label +
        "</span></a>"
      );
    }).join("");

    var sysHtml = SYS_ITEMS.length
      ? SYS_ITEMS.map(function (item) {
          return (
            '<a class="command-app-nav__link' +
            (isActive(item.href, currentPage) ? " command-app-nav__link--active" : "") +
            '" href="' +
            item.href +
            '"><span class="command-app-nav__icon" aria-hidden="true">' +
            item.icon +
            "</span><span class=\"command-app-nav__text\">" +
            item.label +
            "</span></a>"
          );
        }).join("")
      : "";

  /* ====== 侧栏底部状态栏 ====== */
    var savedBadge = localStorage.getItem('plice_badge') || '';
    var clockHtml =
      '<span id="commandShellClock" class="sidebar-clock"></span>';
    var statusHtml =
      '<span class="sidebar-status">' +
      '<span class="sidebar-status__dot"></span>' +
      '<span class="sidebar-status__label">系统正常</span>' +
      '</span>';
    var ragLabel = document.getElementById('useRag');
    var ragChecked = ragLabel && ragLabel.checked ? 'checked' : '';
    var ragHtml =
      '<label class="sidebar-rag">' +
      '<input id="useRag" type="checkbox" ' +
      ragChecked +
      ' />' +
      '<span>RAG</span>' +
      '</label>';
    var footerHtml =
      '<div class="sidebar-footer">' +
      '<div class="sidebar-footer__badge">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
      '<span>' +
      (savedBadge ? savedBadge : '未登录') +
      '</span>' +
      '</div>' +
      '<div class="sidebar-footer__row">' +
      statusHtml +
      ragHtml +
      clockHtml +
      '</div>' +
      '</div>';

    sidebar.innerHTML =
      '<div class="sidebar-top">' +
      '<div class="sidebar-logo">' +
      '<div class="sidebar-logo__mark"></div>' +
      '<div class="sidebar-logo__text">' +
      '<span class="sidebar-logo__name">智警引擎</span>' +
      '<span class="sidebar-logo__ver">智慧警务</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<nav class="command-app-nav" aria-label="业务模块">' +
      navHtml +
      (sysHtml ? '</nav><nav class="command-app-nav command-app-nav--footer" aria-label="系统">' + sysHtml + '</nav>' : '</nav>') +
      footerHtml;
  }

  /* 页面初始化时根据 data-page 属性注入侧边栏 */
  var pageId = document.body.getAttribute("data-page") || "index";
  injectSidebar(pageId);

  /* 供外部调用（备用） */
  window.injectSidebar = injectSidebar;
})();
