const state = {
  session: null,
  config: null,
};

const dashboardBasePath = (() => {
  const scriptUrl = new URL(
    document.currentScript?.getAttribute("src") || "config.js",
    window.location.href,
  );
  const basePath = scriptUrl.pathname.replace(/\/[^/]*$/, "");
  return basePath === "/" ? "" : basePath;
})();

const elements = {
  currentUserBadge: document.querySelector("#currentUserBadge"),
  logoutButton: document.querySelector("#logoutButton"),
  brandHomeLink: document.querySelector("#brandHomeLink"),
  dashboardLink: document.querySelector("#dashboardLink"),
  navButtons: document.querySelectorAll("[data-config-section]"),
  adminOnlyNavButtons: document.querySelectorAll(".admin-only"),
  configPanels: document.querySelectorAll("[data-config-panel]"),
  appCredentialForm: document.querySelector("#appCredentialForm"),
  appCredentialEnvSelect: document.querySelector("#appCredentialEnvSelect"),
  appLoginIdInput: document.querySelector("#appLoginIdInput"),
  appPasswordInput: document.querySelector("#appPasswordInput"),
  appCredentialMessage: document.querySelector("#appCredentialMessage"),
  createUserSection: document.querySelector("#createUserSection"),
  userListSection: document.querySelector("#userListSection"),
  dashboardUserForm: document.querySelector("#dashboardUserForm"),
  dashboardUsernameInput: document.querySelector("#dashboardUsernameInput"),
  dashboardPasswordInput: document.querySelector("#dashboardPasswordInput"),
  dashboardRoleSelect: document.querySelector("#dashboardRoleSelect"),
  dashboardUserMessage: document.querySelector("#dashboardUserMessage"),
  dashboardUserListMessage: document.querySelector("#dashboardUserListMessage"),
  dashboardUsersList: document.querySelector("#dashboardUsersList"),
};

function dashboardUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${dashboardBasePath}${normalizedPath}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function showFormMessage(element, text, tone = "info") {
  element.textContent = text;
  element.dataset.tone = tone;
  element.hidden = false;
}

function showConfigSection(sectionName) {
  for (const panel of elements.configPanels) {
    panel.hidden = panel.dataset.configPanel !== sectionName;
  }

  for (const button of elements.navButtons) {
    button.classList.toggle(
      "active",
      button.dataset.configSection === sectionName,
    );
  }

  if (sectionName === "userList") {
    loadDashboardUsers().catch((error) =>
      showFormMessage(
        elements.dashboardUserListMessage,
        error.message,
        "error",
      ),
    );
  }
}

function applyRoleVisibility(role) {
  const isAdmin = role === "admin";
  for (const button of elements.adminOnlyNavButtons) {
    button.hidden = !isAdmin;
  }

  if (!isAdmin) {
    elements.createUserSection.hidden = true;
    elements.userListSection.hidden = true;
    showConfigSection("configSetup");
  }
}

async function requireSession() {
  const session = await api("/api/session");
  if (!session.user) {
    window.location.assign(dashboardUrl("/login.html"));
    return null;
  }

  state.session = session;
  elements.currentUserBadge.textContent = `${session.user.username} (${session.user.role})`;
  elements.currentUserBadge.hidden = false;
  elements.brandHomeLink.href = dashboardUrl("/");
  elements.dashboardLink.href = dashboardUrl("/");
  applyRoleVisibility(session.user.role);
  return session;
}

async function logout() {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  window.location.assign(dashboardUrl("/login.html"));
}

async function loadConfig() {
  state.config = await api("/api/config");
  elements.appCredentialEnvSelect.innerHTML = Object.keys(
    state.config.environments.environments || {},
  )
    .map(
      (env) => `<option value="${escapeHtml(env)}">${escapeHtml(env)}</option>`,
    )
    .join("");
  elements.appCredentialEnvSelect.value =
    state.config.environments.default || elements.appCredentialEnvSelect.value;
}

async function loadAppCredential() {
  const env = elements.appCredentialEnvSelect.value;
  if (!env) {
    return;
  }

  elements.appCredentialMessage.hidden = true;
  const result = await api(
    `/api/app-credentials?env=${encodeURIComponent(env)}`,
  );
  const credential = result.credential;
  elements.appLoginIdInput.value =
    credential?.loginId || credential?.mobileNumber || "";
  elements.appPasswordInput.value = "";

  if (result.usesDefault) {
    showFormMessage(
      elements.appCredentialMessage,
      "Using default shared credentials for this environment.",
      "info",
    );
  } else {
    showFormMessage(
      elements.appCredentialMessage,
      "Using your saved app login for this environment.",
      "success",
    );
  }
}

async function saveAppCredential(event) {
  event.preventDefault();
  const submitButton = elements.appCredentialForm.querySelector("button");
  submitButton.disabled = true;
  elements.appCredentialMessage.hidden = true;

  try {
    const env = elements.appCredentialEnvSelect.value;
    await api("/api/app-credentials", {
      method: "POST",
      body: JSON.stringify({
        env,
        loginId: elements.appLoginIdInput.value.trim(),
        password: elements.appPasswordInput.value,
        mobileNumber: elements.appLoginIdInput.value.trim(),
        otp: elements.appPasswordInput.value,
      }),
    });
    elements.appPasswordInput.value = "";
    showFormMessage(
      elements.appCredentialMessage,
      `Saved app login for ${env}. Future runs you start will use it.`,
      "success",
    );
  } catch (error) {
    showFormMessage(elements.appCredentialMessage, error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
}

function renderDashboardUsers(users) {
  if (!users.length) {
    elements.dashboardUsersList.className = "user-list empty";
    elements.dashboardUsersList.textContent = "No dashboard users found.";
    return;
  }

  elements.dashboardUsersList.className = "user-list";
  elements.dashboardUsersList.innerHTML = users
    .map(
      (user) => `
    <article class="user-row">
      <div>
        <strong>${escapeHtml(user.username)}</strong>
        <div class="user-password-row">
          <span>Password</span>
          <code class="user-password" data-password-value="${escapeHtml(user.password || "")}">${user.password ? "********" : "Not available"}</code>
          ${user.password ? `<button class="password-toggle" type="button" data-toggle-password>Show Password</button>` : ""}
        </div>
        <small>${escapeHtml(user.isBootstrapAdmin ? "Default admin from .env" : user.createdAt ? `Created ${new Date(user.createdAt).toLocaleString()}` : "Created date unavailable")}</small>
      </div>
      <div class="user-actions">
        <span>${escapeHtml(user.role)}</span>
        <button type="button" data-reset-user="${escapeHtml(user.username)}">Reset Password</button>
        <button class="danger" type="button" data-delete-user="${escapeHtml(user.username)}">Delete</button>
      </div>
    </article>
  `,
    )
    .join("");
}

async function loadDashboardUsers() {
  if (state.session?.user?.role !== "admin") {
    return;
  }

  const result = await api("/api/dashboard-users");
  renderDashboardUsers(result.users || []);
}

async function createDashboardUser(event) {
  event.preventDefault();
  const submitButton = elements.dashboardUserForm.querySelector("button");
  submitButton.disabled = true;
  elements.dashboardUserMessage.hidden = true;

  try {
    const result = await api("/api/dashboard-users", {
      method: "POST",
      body: JSON.stringify({
        username: elements.dashboardUsernameInput.value.trim(),
        password: elements.dashboardPasswordInput.value,
        role: elements.dashboardRoleSelect.value,
      }),
    });
    elements.dashboardUserForm.reset();
    showFormMessage(
      elements.dashboardUserMessage,
      `Created ${result.user.username}.`,
      "success",
    );
    await loadDashboardUsers();
    showConfigSection("userList");
  } catch (error) {
    showFormMessage(elements.dashboardUserMessage, error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
}

async function resetDashboardUserPassword(username) {
  const password = window.prompt(
    `Enter a new password for ${username}. Minimum 8 characters.`,
  );
  if (password === null) {
    return;
  }

  try {
    await api("/api/dashboard-users/password", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    showFormMessage(
      elements.dashboardUserListMessage,
      `Password reset for ${username}.`,
      "success",
    );
    await loadDashboardUsers();
  } catch (error) {
    showFormMessage(elements.dashboardUserListMessage, error.message, "error");
  }
}

async function deleteDashboardUser(username) {
  if (!window.confirm(`Delete dashboard user ${username}?`)) {
    return;
  }

  try {
    await api("/api/dashboard-users/delete", {
      method: "POST",
      body: JSON.stringify({ username }),
    });
    showFormMessage(
      elements.dashboardUserListMessage,
      `Deleted ${username}.`,
      "success",
    );
    await loadDashboardUsers();
  } catch (error) {
    showFormMessage(elements.dashboardUserListMessage, error.message, "error");
  }
}

elements.logoutButton.addEventListener("click", logout);
for (const button of elements.navButtons) {
  button.addEventListener("click", () =>
    showConfigSection(button.dataset.configSection),
  );
}
elements.appCredentialEnvSelect.addEventListener("change", loadAppCredential);
elements.appCredentialForm.addEventListener("submit", saveAppCredential);
elements.dashboardUserForm.addEventListener("submit", createDashboardUser);
elements.dashboardUsersList.addEventListener("click", (event) => {
  const passwordButton = event.target.closest("[data-toggle-password]");
  if (passwordButton) {
    const passwordValue = passwordButton.parentElement.querySelector(
      "[data-password-value]",
    );
    const isVisible = passwordButton.dataset.visible === "true";
    passwordButton.dataset.visible = isVisible ? "false" : "true";
    passwordButton.textContent = isVisible ? "Show Password" : "Hide Password";
    passwordValue.textContent = isVisible
      ? "********"
      : passwordValue.dataset.passwordValue;
    return;
  }

  const resetButton = event.target.closest("[data-reset-user]");
  if (resetButton) {
    resetDashboardUserPassword(resetButton.dataset.resetUser);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-user]");
  if (deleteButton) {
    deleteDashboardUser(deleteButton.dataset.deleteUser);
  }
});

async function bootConfigPage() {
  const session = await requireSession();
  if (!session) {
    return;
  }

  try {
    await loadConfig();
    await loadAppCredential();
    await loadDashboardUsers();
  } catch (error) {
    showFormMessage(elements.appCredentialMessage, error.message, "error");
  }
}

bootConfigPage().catch(() => {
  window.location.assign(dashboardUrl("/login.html"));
});
