# Open-source, live

**Live:** [sarankumar1325.github.io/oss-showcase](https://sarankumar1325.github.io/oss-showcase/) · try anyone's with [`?u=yyx990803`](https://sarankumar1325.github.io/oss-showcase/?u=yyx990803)

A cinematic showcase of someone's merged pull requests to other people's open-source projects. It loads live from GitHub, has an orbit of every repository, rhythm charts in 2D and 3D, and a searchable archive.

It works for anyone, in two ways:

- **Fork it** and it becomes your portfolio, deployed to GitHub Pages and refreshed automatically.
- **Open anyone's** on any deployed copy with `?u=<username>`, for example `…/?u=octocat`.

Everything shown is public GitHub data, so **no token is required**.

---

## Make it yours (fork in 3 steps)

1. **Fork** this repository.
2. **Edit `portfolio.config.ts`**: your GitHub username, name, photo (or `null` for your GitHub avatar) and time zone. Put a photo file in `public/` if you use one.
3. **Turn on Pages**: in your fork, go to Settings → Pages → Source and choose **GitHub Actions**. Then push, or run the *Deploy* workflow by hand.

The workflow in `.github/workflows/deploy.yml`:
- runs `bun run snapshot` with GitHub's **built-in** `GITHUB_TOKEN`, so there is no secret to create,
- renders your link-preview card (`bun run og`),
- builds the site with your title, description and preview tags,
- publishes it to Pages,
- runs again every 6 hours so new merges land without a push.

Until the first snapshot is generated, the site loads your data live in the browser instead. A fork works even before the workflow has run.

### Config options

| Key | What it does |
| --- | --- |
| `github` | Your username. Everything is built from it |
| `name` | Display name in the hero and footer |
| `photo` | A file in `public/`, an `https://` URL, or `null` for your GitHub avatar |
| `timeZone` / `timeZoneLabel` | IANA zone used for days and hours, plus an optional short label like `IST` |
| `excludeOwners` | Owners whose repos shouldn't count, such as your employer's org |
| `includeOwnRepos` | Also count PRs merged into your own repositories |
| `allowViewer` | Let visitors open other people's portfolios with `?u=` |
| `sourceRepo` | `owner/repo` for the *Fork this site* button. Leave `null` and Actions fills it in |

---

## Tokens, honestly

You don't need one. A token only raises GitHub's rate limits:

| | No token | With a token |
| --- | --- | --- |
| Searches | 10 / minute | 30 / minute |
| Other requests | 60 / hour | 5,000 / hour |

- **Deploying:** the workflow uses the built-in Actions token. Never put a token in a `VITE_*` variable, because Vite bakes those into the public JavaScript.
- **Browsing with `?u=`:** visitors can optionally paste their own token in the site's *Optional token* sheet. Use a **fine-grained** token with **public repositories** access and **no permissions** selected; the sheet links to a prefilled page. It is stored only in that browser (session-only unless "remember" is ticked) and sent only to `api.github.com`.
- **Locally:** `GITHUB_TOKEN=… bun run snapshot` is faster, but `bun run snapshot` works without one.

---

## Run locally

```bash
bun install
bun run dev        # http://localhost:5173
bun run snapshot   # refresh src/data/snapshot.json from GitHub
bun run og         # render public/og-<username>.png, the link-preview card
bun run build      # typecheck + production build into dist/
bun run preview    # serve the production build
```

## URL flags

| Flag | Effect |
| --- | --- |
| `?u=<username>` | Show someone else's portfolio, loaded live in the browser |
| `?skip` | Skip the opening sequence |
| `?demo` | Replay the 4 newest real merges one at a time, to preview the live experience offline |

## Sharing

- **Link previews** (Slack, X, LinkedIn, WhatsApp) show a 1200×630 card. It has the count, repositories, name, photo and an activity chart, rendered at build time by `scripts/og.tsx`. Crawlers don't run JavaScript, so previews always describe the deployment's owner. A `?u=` link previews as the site owner's card, while its tab title and icon show the person being viewed.
- **Share** in the footer copies a clean link to the portfolio on screen (or opens the share sheet on phones).
- **Fork this site** appears once the repo is known (automatic on GitHub Actions).

## Pages

- `#/`: the overview
- `#/contributions`: the full archive. It has search, owner and repo filters, sort, page size, group by day, pagination and ←/→ keys. Filters live in the URL, so any view is shareable.

## How the data flows

1. **Your own site:** `src/data/snapshot.json` is generated at build time for the configured user, then the browser polls GitHub search every 60 s for new merges.
2. **`?u=` or a fresh fork:** the browser loads the full history live, splitting by date past GitHub's 1,000-results-per-search cap. It waits out rate limits with a visible countdown and caches the result in `localStorage`, so the next visit opens instantly.
3. **Owner types** (organization or individual) are resolved in a single GraphQL call when a token is available. Otherwise they are looked up one at a time within the hourly budget and shown as "resolving" until known.

Nothing is invented: if GitHub is unreachable or rate-limited, what is on screen simply stays.

## Structure

- `portfolio.config.ts`: the one file a fork edits
- `scripts/snapshot.ts`: builds the snapshot (Bun)
- `src/Boot.tsx`: decides owner vs `?u=`, and snapshot vs cache vs live load
- `src/lib/github.ts`: the small GitHub client shared by the browser and the script
- `src/lib/profile.ts`, `token.ts`, `cache.ts`: who is shown, the optional token, the browser cache
- `src/components/Loader.tsx`, `TokenSheet.tsx`, `ViewAnother.tsx`: live loading, the token sheet, the username box
- `src/components/*`: intro, orbit, rhythm (2D/3D), feed, ledger, archive, cursor and transitions

Respects `prefers-reduced-motion`.

## License

MIT. Fork it, make it yours.

