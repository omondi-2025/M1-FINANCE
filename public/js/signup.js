document.addEventListener("DOMContentLoaded", () => {

  // 🔄 Spinner helpers
  const loadingOverlay = document.getElementById("loadingOverlay");

  function showLoader() {
    if (loadingOverlay) loadingOverlay.classList.remove("hidden");
  }

  function hideLoader() {
    if (loadingOverlay) loadingOverlay.classList.add("hidden");
  }

  // 📞 Normalize Kenyan phone numbers → +254XXXXXXXXX
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

  // 📌 Auto-fill referral code from URL
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");

  const referralInput = document.getElementById("referralCode");
  if (ref && referralInput) {
    referralInput.value = ref;
    referralInput.readOnly = true;
  }

  const form = document.getElementById("signupForm");
  if (!form) {
    console.error("signupForm not found");
    return;
  }

  const errorBox = document.getElementById("errorBox");
  if (!errorBox) {
    console.error("errorBox not found");
    return;
  }

  // 📌 Handle signup
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.textContent = "";

    const password = document.getElementById("password")?.value.trim();
    const confirmPassword = document.getElementById("confirmPassword")?.value.trim();

    if (password !== confirmPassword) {
      errorBox.textContent = "Passwords do not match";
      return;
    }

    if (password.length < 6) {
      errorBox.textContent = "Password must be at least 6 characters";
      return;
    }

    const rawPhone = document.getElementById("phone")?.value.trim();
    const phone = normalizePhone(rawPhone);

    console.log("📞 Signup phone normalized:", phone);

    const data = {
      fullName: document.getElementById("fullName")?.value.trim(),
      email: document.getElementById("email")?.value.trim(),
      phone,
      password,
      referralCode: referralInput?.value.trim() || ""
    };

    const submitBtn = form.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing up...";
    showLoader();

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      const result = await res.json();

      if (!res.ok) {
        errorBox.textContent = result.error || result.message || "Signup failed";
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign Up";
        hideLoader();
        return;
      }

      // ✅ Save JWT + user
      localStorage.setItem("token", result.token);
      if (result.user) {
        localStorage.setItem("user", JSON.stringify(result.user));
      }

      window.location.href = "index.html";

    } catch (err) {
      console.error(err);
      errorBox.textContent = "Network error. Try again.";
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign Up";
      hideLoader();
    }
  });

});
