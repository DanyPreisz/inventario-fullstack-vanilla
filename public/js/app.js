import { api, setSession, clearSession, getToken } from "./api.js";
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const listEl = document.querySelector("#list");
const form = document.querySelector("#item-form");
const formError = document.querySelector("#form-error");
const lowBtn = document.querySelector("#low-only");
let mode = "login";
let query = "";
let low = false;
let timer;
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
async function change(id, delta) {
  await api(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify({ delta }) });
  await refresh();
}
async function refresh() {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (low) params.set("low", "1");
  const data = await api(`/api/items?${params}`);
  document.querySelector("#low-count").textContent = `${data.low} bajo minimo`;
  listEl.innerHTML = "";
  if (!data.items.length) {
    const empty = document.createElement("li");
    empty.textContent = "No hay productos.";
    listEl.append(empty);
    return;
  }
  data.items.forEach((item) => {
    const li = document.createElement("li");
    li.className = `item${item.low ? " low" : ""}`;
    const text = document.createElement("span");
    text.textContent = `${item.name} \u00b7 ${item.place} \u00b7 min ${item.min}`;
    const qty = document.createElement("strong");
    qty.className = "qty";
    qty.textContent = item.qty;
    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "ghost";
    minus.textContent = "-";
    minus.addEventListener("click", () => change(item.id, -1));
    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "ghost";
    plus.textContent = "+";
    plus.addEventListener("click", () => change(item.id, 1));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost";
    del.textContent = "Borrar";
    del.addEventListener("click", async () => { await api(`/api/items/${item.id}`, { method: "DELETE" }); await refresh(); });
    li.append(text, minus, qty, plus, del);
    listEl.append(li);
  });
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    await refresh();
  } catch { clearSession(); }
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); });
document.querySelector("#search").addEventListener("input", (event) => { clearTimeout(timer); timer = setTimeout(async () => { query = event.target.value.trim(); await refresh(); }, 200); });
lowBtn.addEventListener("click", async () => { low = !low; lowBtn.classList.toggle("on", low); await refresh(); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  try {
    await api("/api/items", { method: "POST", body: JSON.stringify({ name: document.querySelector("#name").value.trim(), qty: document.querySelector("#qty").value, min: document.querySelector("#min").value, place: document.querySelector("#place").value.trim() }) });
    form.reset();
    document.querySelector("#qty").value = 1;
    document.querySelector("#min").value = 1;
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
boot();
