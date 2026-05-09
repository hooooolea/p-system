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
      href: "/",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      label: "接警研判",
    },
    {
      href: "/judgments.html",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
      label: "研判记录",
    },
    {
      href: "/command-analysis.html",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
      label: "智能分析",
    },
    {
      href: "/performance.html",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
      label: "分析报表",
    },
  ];
  var SYS_ITEMS = [
    {
      href: "/tech-route.html",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M5 9v3h14V9"/><path d="M12 12v3"/></svg>',
      label: "技术路线",
    },
  ];

  function isActive(href, currentPage) {
    if (href === "/") return currentPage === "index";
    return window.location.pathname.endsWith(href);
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

    var sysHtml = SYS_ITEMS.map(function (item) {
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

    sidebar.innerHTML =
      '<nav class="command-app-nav" aria-label="业务模块">' +
      navHtml +
      '</nav>' +
      '<nav class="command-app-nav command-app-nav--footer" aria-label="系统">' +
      sysHtml +
      '</nav>';
  }

  /* 页面初始化时根据 data-page 属性注入侧边栏 */
  var pageId = document.body.getAttribute("data-page") || "index";
  injectSidebar(pageId);

  /* 供外部调用（备用） */
  window.injectSidebar = injectSidebar;
})();
