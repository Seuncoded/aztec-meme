// server.js (project root)
// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "8mb" }));

// serve static frontend
app.use(express.static(path.join(__dirname, "public")));

// ---- adapt your Vercel-style handlers to Express ----
function adapt(handler) {
  // your files export: `export default async function handler(req,res) {}`
  return (req, res) => handler(req, res);
}

// import your API routes
import memes from "./api/memes.js";

import upload from "./api/upload.js";
app.post("/api/upload", upload);

// contest endpoints (optional; add as you need)
import contestOpen from "./api/contest/open.js";
import contestSubmit from "./api/contest/submit.js";
import contestActive from "./api/contest/active.js";
import contestStartVoting from "./api/contest/start-voting.js";
import contestVote from "./api/contest/vote.js";
import contestEntries from "./api/contest/entries.js";
import contestLeaderboard from "./api/contest/leaderboard.js";
import contestClose from "./api/contest/close.js";
import contestWinners from "./api/contest/winners.js";

import { POST as submitMeme } from "./api/submit-meme.js";


// route
app.get("/api/contest/winners", adapt(contestWinners));

// wire routes
app.get("/api/memes", adapt(memes));
app.post("/api/submit-meme", adapt(submitMeme));


// contest routes (only if you created them)
// server.js (only the contest routes section)

// contest routes
app.post("/api/contest/open", adapt(contestOpen));       // <-- POST
app.post("/api/contest/start-voting", adapt(contestStartVoting));
app.post("/api/contest/close", adapt(contestClose));
app.post("/api/contest/submit", adapt(contestSubmit));
app.post("/api/contest/vote", adapt(contestVote));
app.post("/api/upload", upload);
app.get("/api/contest/active", adapt(contestActive));
app.get("/api/contest/entries", adapt(contestEntries));
app.get("/api/contest/leaderboard", adapt(contestLeaderboard));

// fallback to index.html for plain paths
app.get("/", (_, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);
app.get("/contest", (_, res) =>
  res.sendFile(path.join(__dirname, "public", "contest.html"))
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Running at http://localhost:${PORT}`)
);

