/**
 * Embeds schema-validated guides from lib/guides/*.ts into public/prototype.html,
 * between the SCHEMA_GUIDES markers. Run: npx tsx scripts/embed-guides.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { githubGuide } from "../lib/guides/github";
import { googleGuide } from "../lib/guides/google";
import { slackGuide } from "../lib/guides/slack";
import { DEFAULT_BUDGET, MODEL } from "../lib/pipeline/config";

const guides = Object.fromEntries([githubGuide, googleGuide, slackGuide].map((g) => [g.slug, g]));
const file = new URL("../public/prototype.html", import.meta.url);
const html = readFileSync(file, "utf8");
const start = "/*SCHEMA_GUIDES:start*/";
const end = "/*SCHEMA_GUIDES:end*/";
const i = html.indexOf(start);
const j = html.indexOf(end);
if (i < 0 || j < 0) throw new Error("SCHEMA_GUIDES markers not found in public/prototype.html");

const safe = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c"); // keep "</script>" out of the page
const json = safe(guides);
writeFileSync(file, `${html.slice(0, i + start.length)}\nObject.assign(SCHEMA_GUIDES, ${json});\nObject.assign(PIPELINE_CONFIG, ${safe({ model: MODEL, budget: DEFAULT_BUDGET })});\n${html.slice(j)}`);
console.log(`Embedded ${Object.keys(guides).join(", ")}`);
