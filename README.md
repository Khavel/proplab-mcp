# PropLab MCP Server

Model Context Protocol server for [PropLab](https://nbaproplab.com): NBA and WNBA **player-prop
analytics**. You get the daily board the model publishes before tip-off, its public record graded
against the official box score, defense vs position, usage, referees and player research.

There are two ways to use it:

- **Remote server: works now, nothing to install, no key.** `https://nbaproplab.com/mcp`
- **Local stdio package**, built from this repository. It adds backtests and on-demand pick
  evaluation, which need an API key. It is not yet published on npm.

The data is informational sports analysis, not betting advice. PropLab does not take wagers,
link to sportsbooks or guarantee outcomes, and past results do not predict future ones.

## Remote server (recommended)

Streamable HTTP, stateless, no authentication. Every tool is read-only and returns the same public
data shown on nbaproplab.com.

**Claude (claude.ai, desktop, mobile):** Settings → Connectors → Add custom connector. Name:
`PropLab`. URL: `https://nbaproplab.com/mcp`. Authentication: none.

**Claude Code:**

```bash
claude mcp add --transport http proplab https://nbaproplab.com/mcp
```

**Codex:**

```bash
codex mcp add proplab --url https://nbaproplab.com/mcp
```

or in `~/.codex/config.toml`:

```toml
[mcp_servers.proplab]
url = "https://nbaproplab.com/mcp"
```

Any other client that supports streamable HTTP can point at the same URL.

### Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `daily_board` | `league` (`nba` or `wnba`) | The published player-prop board for the next slate (player, stat, line, direction, tier, model score) and how the previous board settled |
| `track_record` | `league?`, `tier?` (`Premium` or `Standard`), `from?`, `to?` | Settled record by tier and stat. The published record is the Premium tier (`premiumHitRate`, `goodPicks`) and Standard (`marginalPicks`); `overall*` fields also count internal ratings that are never published. Dates before 2026-04-03 are a backtest |
| `defense_vs_position` | `league` | Points, rebounds and assists each team allows to guards, forwards and centers relative to the league average, with defensive rating, pace and ranks |
| `usage_leaders` | `league` | Players ranked by usage rate this season, with last-10-games usage, minutes and points |
| `nba_today` | — | Today's NBA games with tip-off times, yesterday's scores and the standings |
| `games` | `date?` (`yyyy-MM-dd`) | NBA and WNBA games on a date (default: today, US Eastern) |
| `referee_assignments_today` | — | The crew of each NBA game today, once the league publishes it the morning of game day |
| `referees` | — | NBA referees this season with games worked and fouls per game against the league average |
| `search_players` | `query` | NBA and WNBA players by name, accents optional ("Jokic" finds Jokić) |
| `player_research` | `playerId` | Recent game logs, current prop lines across books with hit rates, injury status, next-game context and the model's picks on that player |

Example prompts:

- "Which NBA teams allow the most rebounds to centers, and do any of them play today?"
- "How has PropLab's published Premium tier done in the WNBA since April, by stat?"
- "Search for Jokic and show his last 10 games and injury status."

Invalid arguments, for example `league: "nfl"`, return a tool error that explains the valid values.

## Local stdio package

Not yet published on npm, so build it from this repository:

```bash
git clone https://github.com/Khavel/proplab-mcp.git
cd proplab-mcp
npm install
npm run build      # compiles src/index.ts → dist/index.js
```

Then register it in your MCP client with the absolute path to the build:

```json
{
  "mcpServers": {
    "proplab": {
      "command": "node",
      "args": ["/absolute/path/to/proplab-mcp/dist/index.js"],
      "env": {
        "PROPLAB_API_KEY": "…"
      }
    }
  }
}
```

`PROPLAB_API_KEY` is optional: without it the public tools still work. For local development
with hot reload, run `npm run dev`.

### Environment variables

| Variable | Required for | Description |
|----------|--------------|-------------|
| `PROPLAB_API_URL` | No | API base URL (default: `https://nbaproplab.com`) |
| `PROPLAB_API_KEY` | Backtest, pick and research tools | Bearer API key |

The key is minted at **nbaproplab.com → Account → API keys**. It is shown once at creation and can
be revoked from the same screen.

### Tools

Public, no key:

| Tool | Endpoint | Key params |
|------|----------|------------|
| `proplab_track_record` | `GET /api/v1/track-record` | `league?`, `tier?`, `statType?`, `from?`, `to?` |
| `proplab_dashboard` | `GET /api/v1/dashboard/today` | `date?`, `league?` |
| `proplab_games` | `GET /api/v1/games` | `date?` |
| `proplab_search_players` | `GET /api/v1/players/search` | `q` |
| `proplab_system_status` | `GET /api/v1/health` | — |

With `PROPLAB_API_KEY`:

| Tool | Endpoint | Key params |
|------|----------|------------|
| `proplab_backtest_summary` | `GET /api/v1/backtest/summary` | `from?`, `to?`, `league?` |
| `proplab_backtest_daily` | `GET /api/v1/backtest/daily` | `from?`, `to?`, `league?` |
| `proplab_backtest_by_rating` | `GET /api/v1/backtest/by-rating` | `from?`, `to?`, `league?` |
| `proplab_backtest_by_stat` | `GET /api/v1/backtest/by-stat` | `from?`, `to?`, `league?` |
| `proplab_pick_details` | `GET /api/v1/picks/{id}` | `id` |
| `proplab_evaluate_pick` | `POST /api/v1/picks/evaluate` | `playerName`, `statType`, `line`, `direction`, `opponentTeam?` |
| `proplab_player_research` | `GET /api/v1/research/player/{playerId}` | `playerId` |

### Verify locally

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Then call `proplab_system_status`, which needs no key and should return the live system status.

## Data and privacy

- **Remote server:** it keeps no state and stores nothing from your conversations. It only receives
  the arguments of each tool call (a league, a date, a player name or id), and the web server
  keeps its standard access logs.
- **Local package:** it calls the public nbaproplab.com API over HTTPS and reads the key only from
  the environment, never logging it. No tool reads database credentials or app settings, or opens
  a shell.
- Inputs are validated with zod and responses are truncated at 40,000 characters. Every tool is
  read-only except `proplab_evaluate_pick`, which scores a hypothetical pick and stores nothing.
- Privacy policy: [nbaproplab.com/legal/privacy](https://nbaproplab.com/legal/privacy).
  Responsible gambling: [nbaproplab.com/responsible-gambling](https://nbaproplab.com/responsible-gambling).

## Support

Open an issue at [github.com/Khavel/proplab-mcp/issues](https://github.com/Khavel/proplab-mcp/issues).
