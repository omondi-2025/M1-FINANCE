document.addEventListener("DOMContentLoaded", () => {
  registerAppInstallSupport();

  const token = localStorage.getItem("token");
  if (token) {
    initIdleLogout();
  }

  const nav = document.getElementById("bottom-nav");
  if (!nav) return;

  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  const items = [
    { href: "index.html", icon: "fa-house", label: "Home" },
    { href: "level.html", icon: "fa-layer-group", label: "Level" },
    { href: "history.html", icon: "fa-clock-rotate-left", label: "History" },
    { href: "team.html", icon: "fa-users", label: "Team" },
    { href: "profile.html", icon: "fa-user", label: "Profile" },
  ];

  nav.innerHTML = `
    <nav class="bottom-nav">
      ${items.map((item) => `
        <a href="${item.href}" class="${currentPage === item.href ? "active" : ""}">
          <i class="fa ${item.icon}"></i>
          <span>${item.label}</span>
        </a>
      `).join("")}
    </nav>
  `;
});

function registerAppInstallSupport() {
  if (window.__m1InstallSupportInitialized) return;
  window.__m1InstallSupportInitialized = true;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed:", error);
      });
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    window.deferredM1InstallPrompt = event;
    window.dispatchEvent(new Event("m1-install-available"));
  });

  window.addEventListener("appinstalled", () => {
    window.deferredM1InstallPrompt = null;
    window.dispatchEvent(new Event("m1-app-installed"));
  });
}

function initIdleLogout() {
  if (window.__m1IdleLogoutInitialized) return;
  window.__m1IdleLogoutInitialized = true;

  const timeoutMs = 10 * 60 * 1000;
  let idleTimer;

  const expireSession = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    alert("Session expired due to 10 minutes of inactivity. Please sign in again.");
    window.location.replace("signin.html");
  };

  const resetTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(expireSession, timeoutMs);
  };

  ["click", "mousemove", "keydown", "scroll", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, resetTimer, { passive: true });
  });

  resetTimer();
}
