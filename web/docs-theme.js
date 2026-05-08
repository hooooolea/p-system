const THEME_STORAGE_KEY = "plice-docs-theme";

function getStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" ? "light" : "light";
  } catch {
    return "dark";
  }
}

function applyDocsTheme(theme) {
  document.body.dataset.theme = "light";
  const icon = document.getElementById("themeToggleIcon");
  const label = document.getElementById("themeToggleText");
  const btn = document.getElementById("themeToggleBtn");
  if (icon) icon.textContent = t === "dark" ? "◐" : "◑";
  if (label) label.textContent = t === "dark" ? "浅色" : "深色";
  if (btn) btn.setAttribute("aria-pressed", t === "light" ? "true" : "false");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
}

function initThemeToggle() {
  applyDocsTheme(getStoredTheme());
  const btn = document.getElementById("themeToggleBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = document.body.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyDocsTheme(next);
  });
}

function initOfficerBadgeLogin() {
  const form = document.getElementById("officerBadgeForm");
  const input = document.getElementById("officerBadgeInput");
  const display = document.getElementById("officerBadgeDisplay");
  const logoutBtn = document.getElementById("officerLogoutBtn");
  if (!form || !input) return;
  const key = "plice-officer-badge";
  const sync = (badge) => {
    const v = (badge || "").trim();
    const loggedIn = Boolean(v);
    form.hidden = loggedIn;
    if (display) {
      display.hidden = !loggedIn;
      display.textContent = loggedIn ? `警号 ${v}` : "";
    }
    if (logoutBtn) logoutBtn.hidden = !loggedIn;
  };
  try {
    const saved = localStorage.getItem(key) || "";
    if (saved) input.value = saved;
    sync(saved);
  } catch {
    /* ignore */
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const badge = (input.value || "").trim();
    if (!badge) return;
    try {
      localStorage.setItem(key, badge);
    } catch {
      /* ignore */
    }
    sync(badge);
  });
  logoutBtn?.addEventListener("click", () => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    input.value = "";
    sync("");
    input.focus();
  });
}

initThemeToggle();
initOfficerBadgeLogin();
