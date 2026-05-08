/* 共享侧边栏注入 — 所有页面统一引用 */
(function () {
  var NAV_ITEMS = [
    {
      href: "/command-situation.html",
      icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle></svg>',
      label: "指挥态势",
    },
    {
      href: "/command-map.html",
      icon: '<svg viewBox="0 0 24 24"><path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>',
      label: "地图中心",
    },
    {
      href: "/",
      icon: '<svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.62 2.6a2 2 0 0 1-.45 2.11L8 9.9a16 16 0 0 0 6 6l1.47-1.27a2 2 0 0 1 2.11-.45c.83.29 1.7.5 2.6.62A2 2 0 0 1 22 16.92z"></path></svg>',
      label: "接警研判",
    },
    {
      href: "/judgments.html",
      icon: '<svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><circle cx="3.5" cy="6" r="1"></circle><circle cx="3.5" cy="12" r="1"></circle><circle cx="3.5" cy="18" r="1"></circle></svg>',
      label: "研判记录",
    },
    {
      href: "/command-analysis.html",
      icon: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"></rect><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"></path></svg>',
      label: "智能分析",
    },
    {
      href: "/performance.html",
      icon: '<svg viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="20"></line><rect x="6" y="11" width="3" height="7"></rect><rect x="11" y="8" width="3" height="10"></rect><rect x="16" y="5" width="3" height="13"></rect></svg>',
      label: "分析报表",
    },
  ];
  var SYS_ITEMS = [
    {
      href: "/tech-route.html",
      icon: '<svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="2"></circle><circle cx="18" cy="6" r="2"></circle><path d="M8 18h5a4 4 0 0 0 0-8h-2a4 4 0 0 1 0-8h5"></path></svg>',
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
