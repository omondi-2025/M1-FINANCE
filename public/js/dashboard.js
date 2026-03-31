const token = localStorage.getItem("token");

if (!token) {
  window.location.href = "signin.html";
}

function loadDashboard() {
  fetch("/api/user/dashboard", {
    headers: {
      Authorization: "Bearer " + token
    }
  })
    .then(res => {
      if (!res.ok) {
        localStorage.removeItem("token");
        window.location.href = "signin.html";
        return;
      }
      return res.json();
    })
    .then(data => {
      if (!data) return;

      document.getElementById("fullName").textContent = data.fullName || "N/A";
      document.getElementById("phone").textContent = data.phone || "N/A";
      document.getElementById("balance").textContent = Number(data.balance || 0).toFixed(2);
    })
    .catch(err => {
      console.error("Dashboard fetch failed:", err);
      document.getElementById("fullName").textContent = "Error";
      document.getElementById("phone").textContent = "Error";
      document.getElementById("balance").textContent = "0.00";
    });
}

// Initial load
loadDashboard();

// 🔄 Auto-refresh every 60 seconds
setInterval(loadDashboard, 60000);