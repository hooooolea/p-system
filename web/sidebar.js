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
      label: "接警研判",
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
    // 用 data-page 属性（来自 document.body.getAttribute("data-page")）做匹配
    // 避免 window.location.pathname 在 CF Worker 子路径下的前缀问题
    var target = href.endsWith(".html") ? href.slice(0, -5) : href;
    // currentPage 已经是 "command-situation" / "command-map" / "workbench" / "judgments"
    return currentPage === target;
  }

  function injectSidebar(currentPage) {
    var sidebar = document.getElementById("app-sidebar");
    if (!sidebar) return;

    var navHtml = NAV_ITEMS.map(function (item) {
      return (
        '<a class="sidebar-item' +
        (isActive(item.href, currentPage) ? " active" : "") +
        '" href="' +
        item.href +
        '">' +
        item.icon +
        "<span>" +
        item.label +
        "</span></a>"
      );
    }).join("");

    var sysHtml = SYS_ITEMS.length
      ? SYS_ITEMS.map(function (item) {
          return (
            '<a class="sidebar-item' +
            (isActive(item.href, currentPage) ? " active" : "") +
            '" href="' +
            item.href +
            '">' +
            item.icon +
            "<span>" +
            item.label +
            "</span></a>"
          );
        }).join("")
      : "";

  /* ====== 侧栏底部状态栏 ====== */
    var savedBadge = localStorage.getItem('plice_badge') || '';
    var badgeHtml =
      '<div class="sidebar-badge">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
      '<span>' +
      (savedBadge ? savedBadge : '未登录') +
      '</span>' +
      '</div>';
    var clockHtml = '<div class="sidebar-time" id="sidebarClock"></div>';
    var footerHtml =
      '<div class="sidebar-status-box">' +
      '<div class="sidebar-status-row">' +
      '<span class="sidebar-status-dot"></span>' +
      '<span>系统正常</span>' +
      '</div>' +
      '<div class="sidebar-status-row sidebar-status-row--rag">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>' +
      '<span>RAG</span>' +
      '</div>' +
      clockHtml +
      '</div>' +
      badgeHtml;

    sidebar.innerHTML =
      '<div class="sidebar-top">' +
      '<div class="sidebar-logo">' +
      '<div class="sidebar-logo__mark">' +
      '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>' +
      '</svg>' +
      '</div>' +
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
