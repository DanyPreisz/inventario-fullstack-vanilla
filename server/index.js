import { URL } from "node:url";
import { connect, isReady, users, items, toId, mapItem } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }
function countOf(value, fallback = 0) { const n = Number(value); if (!Number.isFinite(n) || n < 0) return fallback; return Math.round(n); }
function deltaOf(value) { const n = Number(value); return Number.isFinite(n) ? Math.round(n) : 0; }

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname, searchParams } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    const row = await users().findOne({ _id: toId(user.id) });
    if (!row) return sendJson(res, 401, { error: "Usuario no encontrado" });
    return sendJson(res, 200, { user: { id: String(row._id), username: row.username } });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  if (method === "GET" && pathname === "/api/items") {
    const q = String(searchParams.get("q") || "").trim();
    const low = searchParams.get("low") === "1";
    const query = { userId };
    if (q) query.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const rows = await items().find(query).sort({ name: 1 }).limit(200).toArray();
    const mapped = rows.map(mapItem).filter((item) => !low || item.low);
    return sendJson(res, 200, { items: mapped, low: rows.filter((row) => row.qty <= row.min).length });
  }
  if (method === "POST" && pathname === "/api/items") {
    const body = await readJson(req);
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "El producto es obligatorio" });
    const result = await items().insertOne({ userId, name: name.slice(0, 60), qty: countOf(body.qty, 1), min: countOf(body.min, 1), place: String(body.place || "").slice(0, 24) || "Casa", createdAt: new Date() });
    return sendJson(res, 201, { item: mapItem(await items().findOne({ _id: result.insertedId })) });
  }
  const match = pathname.match(/^\/api\/items\/([a-fA-F0-9]{24})$/);
  if (match) {
    const id = toId(match[1]);
    const existing = await items().findOne({ _id: id, userId });
    if (!existing) return sendJson(res, 404, { error: "Producto no encontrado" });
    if (method === "PATCH") {
      const body = await readJson(req);
      const qty = body.delta !== undefined ? Math.max(0, existing.qty + deltaOf(body.delta)) : countOf(body.qty, existing.qty);
      await items().updateOne({ _id: id, userId }, { $set: { name: body.name !== undefined ? String(body.name).trim().slice(0, 60) || existing.name : existing.name, qty, min: body.min !== undefined ? countOf(body.min, existing.min) : existing.min, place: body.place !== undefined ? String(body.place).slice(0, 24) || "Casa" : existing.place } });
      return sendJson(res, 200, { item: mapItem(await items().findOne({ _id: id })) });
    }
    if (method === "DELETE") {
      await items().deleteOne({ _id: id, userId });
      return sendEmpty(res, 204);
    }
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Inventario en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
