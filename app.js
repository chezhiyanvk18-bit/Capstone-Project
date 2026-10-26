/* TaskFlow – layers: Storage -> Auth -> Store (CRUD) -> UI */
"use strict";
const $ = (id) => document.getElementById(id);

/* ---------- Storage layer (localStorage, safe wrappers) ---------- */
const Storage = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn(e); } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

/* ---------- Auth simulation (client-side only, NOT real security) ---------- */
const Auth = {
  async hash(s) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  },
  users: () => Storage.get("tf_users", {}),
  current: () => Storage.get("tf_session", null),
  async register(name, email, pass) {
    const users = Auth.users(); email = email.toLowerCase();
    if (users[email]) throw new Error("An account with this email already exists.");
    users[email] = { name: name || email.split("@")[0], hash: await Auth.hash(pass) };
    Storage.set("tf_users", users);
    Storage.set("tf_session", { email, name: users[email].name });
  },
  async login(email, pass) {
    const u = Auth.users()[email.toLowerCase()];
    if (!u || u.hash !== (await Auth.hash(pass))) throw new Error("Invalid email or password.");
    Storage.set("tf_session", { email: email.toLowerCase(), name: u.name });
  },
  logout: () => Storage.del("tf_session"),
};

/* ---------- Store: CRUD + persistence per user ---------- */
const Store = {
  key: () => "tf_tasks_" + Auth.current().email,
  all() { return Storage.get(Store.key(), []); },
  save(list) { Storage.set(Store.key(), list); },
  create(t) { const l = Store.all(); l.unshift({ ...t, id: crypto.randomUUID(), created: Date.now() }); Store.save(l); },
  update(id, patch) { Store.save(Store.all().map((t) => (t.id === id ? { ...t, ...patch } : t))); },
  remove(id) { Store.save(Store.all().filter((t) => t.id !== id)); },
  seed() {
    const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    [["Write project README", "Architecture diagram + setup steps", "high", "doing", d(1), ["docs"]],
     ["Deploy to Vercel", "Connect GitHub repo and push", "high", "todo", d(2), ["deploy"]],
     ["Design landing page", "Hero, features, pricing", "medium", "todo", d(5), ["design"]],
     ["Set up repo", "Init git, add .gitignore", "low", "done", d(-2), ["setup"]]]
      .forEach(([title, desc, priority, status, due, tags]) => Store.create({ title, desc, priority, status, due, tags }));
  },
};

/* ---------- UI ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LABEL = { todo: "To do", doing: "In progress", done: "Done" };
const PRI = { high: 0, medium: 1, low: 2 };
let editingId = null, registerMode = false;

function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1800); }

function route() {
  const s = Auth.current();
  $("auth-view").classList.toggle("hidden", !!s);
  $("app-view").classList.toggle("hidden", !s);
  if (s) { $("user-label").textContent = s.name; render(); }
}

function render() {
  const all = Store.all();
  const q = $("search").value.trim().toLowerCase(), fs = $("f-status").value, fp = $("f-priority").value, sort = $("sort").value;
  const today = new Date().toISOString().slice(0, 10);
  $("stats").innerHTML = [["Total", all.length], ["To do", all.filter((t) => t.status === "todo").length],
    ["In progress", all.filter((t) => t.status === "doing").length], ["Done", all.filter((t) => t.status === "done").length]]
    .map(([l, n]) => `<div class="card stat"><span class="muted">${l}</span><b>${n}</b></div>`).join("");

  let list = all.filter((t) => (!fs || t.status === fs) && (!fp || t.priority === fp) &&
    (!q || (t.title + " " + t.desc + " " + t.tags.join(" ")).toLowerCase().includes(q)));
  list.sort({ created: (a, b) => b.created - a.created, title: (a, b) => a.title.localeCompare(b.title),
    priority: (a, b) => PRI[a.priority] - PRI[b.priority], due: (a, b) => (a.due || "9999").localeCompare(b.due || "9999") }[sort]);

  $("empty").classList.toggle("hidden", list.length > 0);
  $("catalog").innerHTML = list.map((t) => {
    const overdue = t.due && t.due < today && t.status !== "done";
    return `<article class="card task ${t.priority} ${t.status}" data-id="${t.id}">
      <h3>${esc(t.title)}</h3>${t.desc ? `<p>${esc(t.desc)}</p>` : ""}
      <div class="meta"><span class="chip">${LABEL[t.status]}</span><span class="chip">${t.priority}</span>
        ${t.due ? `<span class="chip ${overdue ? "overdue" : ""}">📅 ${t.due}</span>` : ""}
        ${t.tags.map((g) => `<span class="chip">#${esc(g)}</span>`).join("")}</div>
      <div class="actions"><button class="btn sm" data-a="next">${t.status === "done" ? "Reopen" : "Advance"}</button>
        <button class="btn sm ghost" data-a="edit">Edit</button><button class="btn sm ghost" data-a="del">Delete</button></div>
    </article>`;
  }).join("");
}

function openModal(task) {
  editingId = task?.id || null;
  $("modal-title").textContent = task ? "Edit task" : "New task";
  $("t-title").value = task?.title || ""; $("t-desc").value = task?.desc || "";
  $("t-priority").value = task?.priority || "medium"; $("t-status").value = task?.status || "todo";
  $("t-due").value = task?.due || ""; $("t-tags").value = task?.tags.join(", ") || "";
  $("modal").showModal();
}

/* ---------- Events ---------- */
$("auth-toggle").onclick = () => {
  registerMode = !registerMode;
  $("name-row").classList.toggle("hidden", !registerMode);
  $("auth-submit").textContent = registerMode ? "Create account" : "Sign in";
  $("auth-toggle").textContent = registerMode ? "Have an account? Sign in" : "Need an account? Register";
  $("auth-error").textContent = "";
};
$("auth-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const em = $("auth-email").value, pw = $("auth-pass").value;
    if (registerMode) { await Auth.register($("auth-name").value.trim(), em, pw); Store.seed(); }
    else await Auth.login(em, pw);
    $("auth-form").reset(); $("auth-error").textContent = ""; route();
  } catch (err) { $("auth-error").textContent = err.message; }
};
$("demo-btn").onclick = async () => {
  try { await Auth.login("demo@taskflow.app", "demo123"); }
  catch { await Auth.register("Demo User", "demo@taskflow.app", "demo123"); Store.seed(); }
  route();
};
$("logout-btn").onclick = () => { Auth.logout(); route(); };
$("add-btn").onclick = () => openModal();
$("cancel-btn").onclick = () => $("modal").close();
$("task-form").onsubmit = () => {
  const data = { title: $("t-title").value.trim(), desc: $("t-desc").value.trim(), priority: $("t-priority").value,
    status: $("t-status").value, due: $("t-due").value, tags: $("t-tags").value.split(",").map((s) => s.trim()).filter(Boolean) };
  if (!data.title) return;
  editingId ? Store.update(editingId, data) : Store.create(data);
  toast(editingId ? "Task updated" : "Task created"); render();
};
$("catalog").onclick = (e) => {
  const b = e.target.closest("button[data-a]"); if (!b) return;
  const id = b.closest("[data-id]").dataset.id, t = Store.all().find((x) => x.id === id);
  if (b.dataset.a === "edit") openModal(t);
  else if (b.dataset.a === "del") { if (confirm("Delete this task?")) { Store.remove(id); toast("Task deleted"); render(); } }
  else { Store.update(id, { status: { todo: "doing", doing: "done", done: "todo" }[t.status] }); render(); }
};
["search", "f-status", "f-priority", "sort"].forEach((id) => $(id).addEventListener("input", render));
$("export-btn").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(Store.all(), null, 2)], { type: "application/json" }));
  a.download = "taskflow-export.json"; a.click(); URL.revokeObjectURL(a.href);
};
$("theme-btn").onclick = () => {
  const n = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = n; Storage.set("tf_theme", n);
};
document.documentElement.dataset.theme = Storage.get("tf_theme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
route();
