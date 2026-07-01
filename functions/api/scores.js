// Cloudflare Pages Function : /api/scores
// レベル別オンラインランキング。KV名前空間を "SCORES" という名前でこのPagesプロジェクトにバインドすること。
// GET  /api/scores?level=elementary        → {top:[{name,score} x5]}
// POST /api/scores {level,name,score}       → {top:[...5], rank, total, you:{name,score}}

const MAX_SCORE = { elementary: 100, junior: 150, senior: 200 }; // 1問点数 × 10問
const KEEP = 50; // KVに保持する件数（表示は上位5件）

// 初期ダミーランキング（KVが空のとき表示。実プレイヤーが登録すると混ざって競える）
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
// シードは古いタイムスタンプ(小さいts)にして、同点なら実プレイヤーより上（先着）に置く
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
  if (!raw) return seedBoard(level);          // 未登録ならシードを使う
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) && a.length ? a : seedBoard(level);
  } catch (e) { return seedBoard(level); }
}

function sanitizeName(n) {
  n = (n == null ? "" : String(n));
  // 改行・制御文字（コード32未満と127）を除去
  n = n.split("").filter((ch) => { const c = ch.charCodeAt(0); return c >= 32 && c !== 127; }).join("").trim();
  n = [...n].slice(0, 5).join("");            // 最大5文字（コードポイント基準）
  return n || "ゲスト";
}

export async function onRequestGet(context) {
  try {
    const level = new URL(context.request.url).searchParams.get("level");
    if (!(level in MAX_SCORE)) return json({ error: "bad level" }, 400);
    const board = await readBoard(context.env, level);
    return json({ top: board.slice(0, 5).map(pub) });
  } catch (e) {
    return json({ error: "server", detail: String((e && e.message) || e) }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    let { level, name, score } = body || {};
    if (!(level in MAX_SCORE)) return json({ error: "bad level" }, 400);
    score = Math.floor(Number(score));
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE[level]) return json({ error: "bad score" }, 400);
    name = sanitizeName(name);

    const board = await readBoard(context.env, level);
    const entry = { name, score, ts: Date.now() };
    board.push(entry);
    board.sort((a, b) => b.score - a.score || a.ts - b.ts); // 高得点順・同点は先着
    const trimmed = board.slice(0, KEEP);
    await context.env.SCORES.put(key(level), JSON.stringify(trimmed));

    const idx = trimmed.indexOf(entry);
    return json({
      top: trimmed.slice(0, 5).map(pub),
      rank: idx >= 0 ? idx + 1 : null,
      total: trimmed.length,
      you: { name: entry.name, score: entry.score }
    });
  } catch (e) {
    return json({ error: "server", detail: String((e && e.message) || e) }, 500);
  }
}
