const dashboardBasePath = (() => {
  const scriptUrl = new URL(document.currentScript?.getAttribute("src") || "login.js", window.location.href);
  const basePath = scriptUrl.pathname.replace(/\/[^/]*$/, "");
  return basePath === "/" ? "" : basePath;
})();

function dashboardUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${dashboardBasePath}${normalizedPath}`;
}

async function api(path, options) {
  const response = await fetch(dashboardUrl(path), {
    headers: { "content-type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

api("/api/session")
  .then((session) => {
    if (session.user) {
      window.location.assign(dashboardUrl("/"));
    }
  })
  .catch(() => {});

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector("#loginError");
  const button = form.querySelector("button");

  error.hidden = true;
  button.disabled = true;

  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: document.querySelector("#usernameInput").value.trim(),
        password: document.querySelector("#passwordInput").value,
      }),
    });
    window.location.assign(dashboardUrl("/"));
  } catch (loginError) {
    error.textContent = loginError.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
});
