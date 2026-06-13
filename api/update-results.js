// Cron diário 08:00 UTC — busca resultados reais e recalcula pontuação
const fs   = require("fs");
const path = require("path");

function outcome(h, a) { return h > a ? "H" : h < a ? "A" : "D"; }

function calcScore(picks, results) {
  let pts = 0;
  for (const [id, res] of Object.entries(results)) {
    const p = picks[id];
    if (!p || p.h == null || p.a == null) continue;
    if (p.h === res.h && p.a === res.a) { pts += 3; continue; }
    if (outcome(p.h, p.a) === outcome(res.h, res.a)) pts += 1;
  }
  return pts;
}

async function fetchResults() {
  const results = {};
  try {
    const url = "https://api.football-data.org/v4/competitions/WC/matches?season=2026&stage=GROUP_STAGE";
    const headers = process.env.FOOTBALL_API_KEY
      ? { "X-Auth-Token": process.env.FOOTBALL_API_KEY }
      : {};
    const resp = await fetch(url, { headers });
    if (!resp.ok) return results;
    const data = await resp.json();

    // import match ids from data.json to correlate
    const dataPath = path.join(process.cwd(), "public", "data.json");
    const stored = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    const MATCHES = stored._matches || [];

    for (const m of MATCHES) {
      const found = (data.matches || []).find(am =>
        am.status === "FINISHED" &&
        am.homeTeam?.name?.toLowerCase().includes(m.apiHome?.toLowerCase()) &&
        am.awayTeam?.name?.toLowerCase().includes(m.apiAway?.toLowerCase())
      );
      if (found?.score?.fullTime) {
        results[m.id] = { h: found.score.fullTime.home, a: found.score.fullTime.away };
      }
    }
  } catch (e) { console.error("fetch error", e.message); }
  return results;
}

module.exports = async function handler(req, res) {
  if (
    req.headers["x-vercel-cron"] !== "1" &&
    req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
  ) return res.status(401).json({ error: "Unauthorized" });

  const dataPath = path.join(process.cwd(), "public", "data.json");
  let stored = {};
  try { stored = JSON.parse(fs.readFileSync(dataPath, "utf8")); } catch {}

  const results = await fetchResults();
  const picks    = stored.picks    || { renata: {}, rafael: {} };
  const champion = stored.champion || { renata: null, rafael: null };

  const scores = {
    renata: calcScore(picks.renata, results),
    rafael: calcScore(picks.rafael, results),
  };

  if (stored.actualChampion) {
    if (champion.renata === stored.actualChampion) scores.renata += 10;
    if (champion.rafael === stored.actualChampion) scores.rafael += 10;
  }

  const updated = { ...stored, results, scores, updatedAt: new Date().toISOString() };
  fs.writeFileSync(dataPath, JSON.stringify(updated, null, 2));
  res.status(200).json({ ok: true, scores, matched: Object.keys(results).length });
};
