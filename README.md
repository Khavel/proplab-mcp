# NBA Prop Lab MCP Server

Model Context Protocol server for NBA and WNBA **player props**: the picks of a 7-block scoring
model, graded in public against the official box score, plus the daily board, backtests, player
research and the day's games.

Every tool calls the public [nbaproplab.com](https://nbaproplab.com) REST API over HTTPS. No
database access, no shell, no local secrets beyond the API key you put in the environment.
**The track record, daily dashboard, games, player search and status tools need no key at all.**

The record the tools report is measured, not claimed: every pick is published before tip-off and
settled afterwards — the same figures as [nbaproplab.com/track-record](https://nbaproplab.com/track-record).

## Quick start

Add it to any MCP client (Claude Code shown here) — no install step, `npx` fetches it:

```json
{
  "mcpServers": {
    "proplab": {
      "command": "npx",
      "args": ["-y", "proplab-mcp-server"]
    }
  }
}
```

Then ask for today's board: `proplab_dashboard` for the slate and its top picks,
`proplab_track_record` for how the model has done (by league, tier, stat and date range),
`proplab_games` for who plays today.

To unlock the research and backtest tools, add the key:

```json
{
  "mcpServers": {
    "proplab": {
      "command": "npx",
      "args": ["-y", "proplab-mcp-server"],
      "env": {
        "PROPLAB_API_KEY": "…"
      }
    }
  }
}
```

## Building from source

```bash
git clone https://github.com/Khavel/proplab-mcp.git
cd proplab-mcp
npm install
npm run build      # compiles src/index.ts → dist/index.js
```

For local development with hot reload: `npm run dev`.

## Environment variables

| Variable | Required for | Description |
|----------|--------------|-------------|
| `PROPLAB_API_URL` | No | API base URL (default: `https://nbaproplab.com`) |
| `PROPLAB_API_KEY` | Research and backtest tools | Bearer API key |

Public tools work with no key at all.

### Where to get the key

Mint it from the web app: **nbaproplab.com → Account → API keys**. The raw key is shown once at
creation; keys can be revoked from the same screen.

## Tools

### Public (no auth)

| Tool | Endpoint | Key params |
|------|----------|------------|
| `proplab_track_record` | `GET /api/v1/track-record` | `league?`, `tier?`, `statType?`, `from?`, `to?` |
| `proplab_dashboard` | `GET /api/v1/dashboard/today` | `date?`, `league?` |
| `proplab_games` | `GET /api/v1/games` | `date?` |
| `proplab_search_players` | `GET /api/v1/players/search` | `q` |
| `proplab_system_status` | `GET /api/v1/health` | — |

### With `PROPLAB_API_KEY`

| Tool | Endpoint | Key params |
|------|----------|------------|
| `proplab_backtest_summary` | `GET /api/v1/backtest/summary` | `from?`, `to?`, `league?` |
| `proplab_backtest_daily` | `GET /api/v1/backtest/daily` | `from?`, `to?`, `league?` |
| `proplab_backtest_by_rating` | `GET /api/v1/backtest/by-rating` | `from?`, `to?`, `league?` |
| `proplab_backtest_by_stat` | `GET /api/v1/backtest/by-stat` | `from?`, `to?`, `league?` |
| `proplab_pick_details` | `GET /api/v1/picks/{id}` | `id` |
| `proplab_evaluate_pick` | `POST /api/v1/picks/evaluate` | `playerName`, `statType`, `line`, `direction`, `opponentTeam?` |
| `proplab_player_research` | `GET /api/v1/research/player/{playerId}` | `playerId` |

Public JSON the site also exposes without a key, readable with any HTTP tool: the daily board
(`/api/v1/seo/board?league=nba|wnba`), defense vs position (`/api/v1/seo/defense-vs-position`),
usage-rate leaders (`/api/v1/seo/usage-leaders`), referee assignments (`/api/v1/seo/referees/today`)
and the day's slate with standings (`/api/v1/seo/nba-hoy`). See
[nbaproplab.com/llms.txt](https://nbaproplab.com/llms.txt).

## Verify locally

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Then call `proplab_system_status` (no key needed) — it should return live system status.

## Security

- No tool reads database connection strings, app settings or shells into a server.
- All inputs are validated with zod; responses are truncated at 40 000 characters.
- The key is read from the environment only and never logged.
- Authenticated tools fail with a clear message when the key is missing — they never fall back to
  an unauthenticated call.
- Every tool is read-only except `proplab_evaluate_pick`, which scores a hypothetical pick and
  stores nothing.
