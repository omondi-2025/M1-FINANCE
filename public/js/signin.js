document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ signin.js loaded");

  const form = document.getElementById("signinForm");
  const errorBox = document.getElementById("errorBox");
  const loadingOverlay = document.getElementById("loadingOverlay");

  if (!form || !errorBox) return;

  const showLoader = () => loadingOverlay?.classList.remove("hidden");
  const hideLoader = () => loadingOverlay?.classList.add("hidden");

  function normalizePhone(phone) {
    phone = phone.replace(/\s+/g, "");

    if (phone.startsWith("07") || phone.startsWith("01")) {
      return "+254" + phone.slice(1);
    }
    if (phone.startsWith("7") || phone.startsWith("1")) {
      return "+254" + phone;
    }
    if (phone.startsWith("254")) {
      return "+" + phone;
    }
    if (phone.startsWith("+254")) {
      return phone;
    }
    return phone;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.textContent = "";

    const rawPhone = document.getElementById("phone").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!rawPhone || !password) {
      errorBox.textContent = "Please fill in all fields";
      return;
    }

    const phone = normalizePhone(rawPhone);
    console.log("📞 Normalized phone:", phone);

    const submitBtn = form.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in...";
    showLoader();

    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password })
      });

      const result = await res.json();
      console.log("📩 Signin response:", result);

      if (!res.ok) {
        errorBox.textContent = result.error || "Invalid credentials";
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign In";
        hideLoader();
        return;
      }

      localStorage.setItem("token", result.token);
      localStorage.setItem("user", JSON.stringify(result.user));

      window.location.href = "index.html";

    } catch (err) {
      console.error(err);
      errorBox.textContent = "Network error. Try again.";
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign In";
      hideLoader();
    }
  });
});
