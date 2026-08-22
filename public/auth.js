"use strict";

(() => {
  let csrfToken = null;
  let authenticated = false;

  const nativeFetch = window.fetch.bind(window);

  window.borsaciAuth = {
    get authenticated() {
      return authenticated;
    },
    get csrfToken() {
      return csrfToken;
    },
  };

  function showLoginError(message) {
    const element =
      document.getElementById("authMessage");

    if (element) {
      element.textContent = message;
    }
  }

  function setSubmitting(submitting) {
    const button =
      document.getElementById("loginButton");

    if (button) {
      button.disabled = submitting;
      button.textContent =
        submitting
          ? "GİRİŞ KONTROL EDİLİYOR..."
          : "GİRİŞ YAP";
    }
  }

  function activate(session) {
    authenticated = true;
    csrfToken = session.csrfToken || null;

    const screen =
      document.getElementById("authScreen");

    const app =
      document.getElementById("appShell");

    const logout =
      document.getElementById("logoutButton");

    if (screen) screen.hidden = true;
    if (app) app.hidden = false;
    if (logout) logout.hidden = false;

    showLoginError("");

    window.dispatchEvent(
      new Event("borsaci:auth-ready")
    );
  }

  function deactivate(message = "") {
    authenticated = false;
    csrfToken = null;

    const screen =
      document.getElementById("authScreen");

    const app =
      document.getElementById("appShell");

    const logout =
      document.getElementById("logoutButton");

    if (app) app.hidden = true;
    if (logout) logout.hidden = true;
    if (screen) screen.hidden = false;

    showLoginError(message);
  }

  window.fetch = async (
    input,
    init = {}
  ) => {
    const requestUrl =
      new URL(
        typeof input === "string"
          ? input
          : input.url,
        window.location.origin
      );

    const method =
      String(
        init.method ||
        (
          typeof input === "string"
            ? "GET"
            : input.method
        ) ||
        "GET"
      ).toUpperCase();

    const sameOrigin =
      requestUrl.origin ===
      window.location.origin;

    const headers =
      new Headers(
        init.headers ||
        (
          typeof input === "string"
            ? undefined
            : input.headers
        )
      );

    if (
      sameOrigin &&
      !["GET", "HEAD", "OPTIONS"]
        .includes(method) &&
      csrfToken
    ) {
      headers.set(
        "X-CSRF-Token",
        csrfToken
      );
    }

    const response =
      await nativeFetch(
        input,
        {
          ...init,
          headers,
          credentials: "same-origin",
        }
      );

    if (
      sameOrigin &&
      response.status === 401 &&
      requestUrl.pathname.startsWith("/api/") &&
      !requestUrl.pathname.startsWith("/api/auth/")
    ) {
      deactivate(
        "Oturum süresi doldu. Lütfen tekrar giriş yapın."
      );
    }

    return response;
  };

  async function checkSession() {
    try {
      const response =
        await nativeFetch(
          "/api/auth/session",
          {
            credentials: "same-origin",
            cache: "no-store",
          }
        );

      if (!response.ok) {
        deactivate();
        return;
      }

      const session =
        await response.json();

      if (session?.authenticated) {
        activate(session);
      } else {
        deactivate();
      }
    } catch {
      deactivate(
        "Oturum kontrol edilemedi. Lütfen tekrar deneyin."
      );
    }
  }

  async function login(event) {
    event.preventDefault();

    const passwordInput =
      document.getElementById("loginPassword");

    const password =
      String(passwordInput?.value || "");

    if (!password) {
      showLoginError(
        "Şifrenizi girin."
      );
      return;
    }

    setSubmitting(true);
    showLoginError("");

    try {
      const response =
        await nativeFetch(
          "/api/auth/login",
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              { password }
            ),
          }
        );

      const payload =
        await response.json()
          .catch(() => ({}));

      if (!response.ok || !payload.authenticated) {
        showLoginError(
          "Giriş bilgileri doğrulanamadı."
        );
        return;
      }

      if (passwordInput) {
        passwordInput.value = "";
      }

      activate(payload);
    } catch {
      showLoginError(
        "Giriş bilgileri doğrulanamadı."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    try {
      await window.fetch(
        "/api/auth/logout",
        {
          method: "POST",
        }
      );
    } finally {
      deactivate("Çıkış yapıldı.");
    }
  }

  const form =
    document.getElementById("loginForm");

  const logoutButton =
    document.getElementById("logoutButton");

  if (form) {
    form.addEventListener(
      "submit",
      login
    );
  }

  if (logoutButton) {
    logoutButton.addEventListener(
      "click",
      logout
    );
  }

  checkSession();
})();