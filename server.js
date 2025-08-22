// server.js (project root)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";


const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();


app.use(express.json({ limit: "10mb" }));


app.use(express.static(path.join(__dirname, "public")));


const adapt = (handler) => (req, res) => handler(req, res);


import memes      from "./api/memes.js";
import submitMeme from "./api/submit-meme.js";
import upload     from "./api/upload.js";
import contest    from "./api/contest.js";   


app.get ("/api/memes",       adapt(memes));
app.post("/api/submit-meme", adapt(submitMeme));
app.post("/api/upload",      adapt(upload));


app.use("/api/contest", contest);


app.get("/",        (_, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/contest", (_, res) => res.sendFile(path.join(__dirname, "public", "contest.html")));


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Running at http://localhost:${PORT}`);
});