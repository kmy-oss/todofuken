// Cloudflare Worker : 静的アセット配信 + レベル別オンラインランキングAPI
// - 静的ファイル(index.html など)は [assets] の ASSETS バインドから配信
// - /api/scores だけこのWorkerが処理
// KV名前空間を "SCORES" としてバインドすること（wrangler.toml 参照）

const MAX_SCORE = { elementary: 100, junior: 150, senior: 200 }; // 1問点数 × 10問
const KEEP = 50;

const SEED = {
  elementary: [
    { name: "たろう", score: 90 }, { name: "はなこ", score: 80 },
    { name: "ケンタ", score: 70 }, { name: "ミク",   score: 60 }, { name: "そら", score: 50 }
  ],
  junior: [
    { name: "ゆうき", score: 135 }, { name: "あおい", score: 120 },
    { name: "ダイチ", score: 105 }, { name: "リン",   score: 90 },  { name: "ナナ", score: 75 }
  ],
  senior: [
    { name: "はかせ", score: 180 }, { name: "ソウマ", score: 160 },
    { name: "ちづる", score: 140 }, { name: "ケイ",   score: 120 }, { name: "ユウ", score: 100 }
  ]
};
function seedBoard(level) {
  return (SEED[level] || []).map((e, i) => ({ name: e.name, score: e.score, ts: i, seed: true }));
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });

const key = (level) => "board:" + level;
const pub = (e) => ({ name: e.name, score: e.score });

async function readBoard(env, level) {
  if (!env || !env.SCORES) throw new Error("KV binding 'SCORES' not found");
  const raw = await env.SCORES.get(key(level));
  if (!raw) return seedBoard(level);
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) && a.length ? a : seedBoard(level);
  } catch (e) { return seedBoard(level); }
}

function sanitizeName(n) {
  n = (n == null ? "" : String(n));
  n = n.split("").filter((ch) => { const c = ch.charCodeAt(0); return c >= 32 && c !== 127; }).join("").trim();
  n = [...n].slice(0, 5).join("");
  return n || "ゲスト";
}

async function handleScores(request, env) {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const level = url.searchParams.get("level");
    if (!(level in MAX_SCORE)) return json({ error: "bad level" }, 400);
    const board = await readBoard(env, level);
    return json({ top: board.slice(0, 5).map(pub) });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    let { level, name, score } = body || {};
    if (!(level in MAX_SCORE)) return json({ error: "bad level" }, 400);
    score = Math.floor(Number(score));
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE[level]) return json({ error: "bad score" }, 400);
    name = sanitizeName(name);

    const board = await readBoard(env, level);
    const entry = { name, score, ts: Date.now() };
    board.push(entry);
    board.sort((a, b) => b.score - a.score || a.ts - b.ts);
    const trimmed = board.slice(0, KEEP);
    await env.SCORES.put(key(level), JSON.stringify(trimmed));

    const idx = trimmed.indexOf(entry);
    return json({
      top: trimmed.slice(0, 5).map(pub),
      rank: idx >= 0 ? idx + 1 : null,
      total: trimmed.length,
      you: { name: entry.name, score: entry.score }
    });
  }

  return json({ error: "method not allowed" }, 405);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/scores") return await handleScores(request, env);
      // それ以外は静的アセット（index.html など）を配信
      return env.ASSETS.fetch(request);
    } catch (e) {
      return json({ error: "server", detail: String((e && e.message) || e) }, 500);
    }
  }
};
