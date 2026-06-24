// Vercel Edge Middleware — Open Graph / link-unfurl meta tags for /recipe/:id.
//
// Why this exists: the app is a Vite SPA served through a blanket rewrite to
// index.html (see vercel.json), so every route returns the same static <head>.
// Pasting a recipe link into iMessage / Slack / Discord / WhatsApp therefore
// unfurls a generic "Digital Cookbook" tile instead of the recipe. Link
// scrapers don't execute JavaScript, so the only way to give them per-recipe
// metadata is to inject it server-side, before the HTML reaches them.
//
// Approach: intervene ONLY for known social/messaging crawler User-Agents.
// Everyone else — humans AND search engines (Googlebot renders JS and should
// index the real SPA, not a stub) — passes straight through untouched. For a
// matched crawler we look the recipe up via the Supabase REST API with the
// public anon key, so RLS does the access control for us: a private or
// non-existent id returns no row, and we fall back to a generic card. The card
// is a minimal standalone HTML document — crawlers only parse <head>, so there
// is no need to hydrate the full SPA for them.
//
// No new dependency: the empty Response carrying `x-middleware-next` is exactly
// what @vercel/edge's next() helper emits to continue to the origin. Keeping
// the footprint at zero matches the project's lean-deps posture (cf. the
// Stage 8 print view, which also shipped with no new packages).

export const config = {
  // Only run on recipe URLs; every other route skips the middleware entirely.
  matcher: '/recipe/:path*',
}

// Social / messaging link-unfurlers. Deliberately EXCLUDES Googlebot/Bingbot:
// search engines execute JS, so serving them the real SPA beats a stub card.
const CRAWLER_UA =
  /facebookexternalhit|facebot|Twitterbot|Slackbot|Discordbot|LinkedInBot|WhatsApp|TelegramBot|Pinterest|redditbot|Applebot|SkypeUriPreview|vkShare|embedly|Iframely|Mastodon|flipboard|Snapchat/i

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SITE_NAME = 'Digital Cookbook'

// Continue to the SPA untouched (mirrors @vercel/edge's next()).
function passThrough() {
  return new Response(null, { headers: { 'x-middleware-next': '1' } })
}

function htmlResponse(body) {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Brief shared-cache window so repeat unfurls don't re-hit Supabase,
      // while edits to a recipe still propagate within a few minutes.
      'cache-control':
        'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    },
  })
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function truncate(value, max) {
  const s = String(value).trim()
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}

// Builds the minimal crawler-facing document. Every interpolated field is
// user-authored, so all of them go through escapeHtml to prevent the recipe
// title/description from breaking out of the attribute and injecting markup.
function renderCard({ url, title, description, image }) {
  const safeTitle = escapeHtml(title)
  const safeDesc = escapeHtml(description)
  const safeUrl = escapeHtml(url)
  const card = image ? 'summary_large_image' : 'summary'
  const imageTags = image
    ? `<meta property="og:image" content="${escapeHtml(image)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />`
    : ''
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDesc}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:url" content="${safeUrl}" />
    ${imageTags}
    <meta name="twitter:card" content="${card}" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDesc}" />
  </head>
  <body>
    <h1>${safeTitle}</h1>
    <p>${safeDesc}</p>
    <p><a href="${safeUrl}">View this recipe on ${SITE_NAME}</a></p>
  </body>
</html>`
}

export default async function middleware(request) {
  const ua = request.headers.get('user-agent') || ''

  // Humans and search engines: hand back to the SPA, no work done.
  if (!CRAWLER_UA.test(ua)) return passThrough()

  const url = new URL(request.url)
  const host = request.headers.get('host') || url.host

  const generic = {
    url: `https://${host}/`,
    title: SITE_NAME,
    description:
      'A casual recipe hub — browse, bookmark, and share recipes you love.',
    image: null,
  }

  // /recipe/<id> only. Deeper paths (e.g. /recipe/<id>/edit) and malformed ids
  // get the generic card without a network round-trip.
  const segments = url.pathname.split('/').filter(Boolean) // ['recipe', '<id>']
  const id = segments[1]
  if (segments.length !== 2 || !id || !UUID_RE.test(id)) {
    return htmlResponse(renderCard(generic))
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    // Misconfigured runtime — never block the unfurl on it, serve generic.
    return htmlResponse(renderCard(generic))
  }

  try {
    const endpoint = `${supabaseUrl}/rest/v1/recipes?id=eq.${id}&select=title,description,image_url&limit=1`
    const res = await fetch(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) return htmlResponse(renderCard(generic))

    const rows = await res.json()
    const recipe = Array.isArray(rows) ? rows[0] : null

    // No row = private (RLS hid it) or non-existent → generic card, RLS-safe.
    if (!recipe) return htmlResponse(renderCard(generic))

    return htmlResponse(
      renderCard({
        url: `https://${host}${url.pathname}`,
        title: recipe.title || SITE_NAME,
        description: truncate(
          recipe.description || `A recipe on ${SITE_NAME}.`,
          200,
        ),
        image: recipe.image_url || null,
      }),
    )
  } catch {
    // Any network/parse failure falls back to the generic card rather than
    // erroring the request — a worse unfurl beats a broken link preview.
    return htmlResponse(renderCard(generic))
  }
}
