/**
 * generate-sitemap.js
 *
 * Fetches all published articles from your Firestore database and writes
 * sitemap.xml + robots.txt next to this script. Run this locally any time
 * after publishing new articles, then re-upload sitemap.xml and robots.txt
 * to your Netlify site alongside index.html.
 *
 * Requires Node.js 18+ (uses built-in fetch). No npm install needed.
 * Run with:  node generate-sitemap.js
 */

const PROJECT_ID = "trending-today-f0f00"; // from your firebaseConfig
const SITE_URL = "https://trending-today.live";

// Must match the slugify() function in index.html exactly, or URLs won't match.
function slugify(title) {
  return (title || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "story";
}

// Firestore REST API returns typed field values; unwrap them to plain JS values.
function unwrapValue(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return new Date(v.timestampValue).getTime();
  if ("nullValue" in v) return null;
  return null;
}

function unwrapFields(fields) {
  const out = {};
  for (const key in fields) out[key] = unwrapValue(fields[key]);
  return out;
}

function xmlEscape(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function main() {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/articles`;
  console.log("Fetching articles from Firestore...");

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Firestore request failed: ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }
  const data = await res.json();
  const docs = data.documents || [];
  console.log(`Found ${docs.length} article(s).`);

  const articles = docs.map((doc) => {
    const id = doc.name.split("/").pop();
    const fields = unwrapFields(doc.fields || {});
    return { id, ...fields };
  });

  const today = new Date().toISOString().slice(0, 10);

  const urls = [
    `  <url>\n    <loc>${SITE_URL}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
  ];

  for (const a of articles) {
    const slug = slugify(a.title);
    const loc = `${SITE_URL}/article/${slug}-${a.id}`;
    const lastmod = a.createdAt
      ? new Date(a.createdAt).toISOString().slice(0, 10)
      : today;
    urls.push(
      `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
    );
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

  const fs = require("fs");
  const path = require("path");
  fs.writeFileSync(path.join(__dirname, "sitemap.xml"), sitemap, "utf8");
  console.log(`Wrote sitemap.xml with ${articles.length + 1} URLs.`);

  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  fs.writeFileSync(path.join(__dirname, "robots.txt"), robots, "utf8");
  console.log("Wrote robots.txt.");
}

main().catch((err) => {
  console.error("Failed to generate sitemap:", err);
  process.exit(1);
});
