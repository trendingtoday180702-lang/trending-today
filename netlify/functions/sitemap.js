/**
 * netlify/functions/sitemap.js
 *
 * Builds sitemap.xml ON THE FLY every time it's requested, by reading
 * your current articles straight from Firestore. This means you never
 * have to run a script or push to git again — publish an article on
 * the site, and it's in the sitemap within seconds.
 *
 * Netlify runs this automatically because it lives in netlify/functions/.
 * It's wired to the URL /sitemap.xml via the redirect in _redirects.
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

exports.handler = async function () {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/articles?pageSize=300`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Firestore request failed: ${res.status}`);
    }

    const data = await res.json();
    const docs = data.documents || [];

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

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
      "\n"
    )}\n</urlset>\n`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600", // cache 1 hour so it's fast and cheap
      },
      body: sitemap,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain" },
      body: "Error generating sitemap: " + err.message,
    };
  }
};
