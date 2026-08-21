// Serves the marketing site (site/) — a fully static page, so this folder can
// be dropped onto Vercel/Netlify/Pages as-is when it's time to go public.
import express from "express";
import { fileURLToPath } from "node:url";

const app = express();
app.use(express.static(fileURLToPath(new URL("../site", import.meta.url))));

const PORT = process.env.SITE_PORT || 8403;
app.listen(PORT, () => {
  console.log(`SpendVeto site → http://localhost:${PORT}`);
  console.log(`(run \`npm run server\` too so the "Open the live dashboard" link works)`);
});
