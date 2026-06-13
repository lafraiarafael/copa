const fs   = require("fs");
const path = require("path");
module.exports = function handler(req, res) {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "public", "data.json"), "utf8");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    res.status(200).send(raw);
  } catch { res.status(404).json({ error: "not found" }); }
};
