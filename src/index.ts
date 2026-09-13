#!/usr/bin/env node
/**
 * PropLab MCP Server
 *
 * Agent-friendly access to NBA Prop Lab's picks, track record, backtest,
 * player research, and pipeline operations.
 *
 * Public endpoints need no auth. Authenticated endpoints require
 * PROPLAB_API_KEY env var (Bearer token).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ── Config ────────────────────────────────────────────────────────────────

const API_BASE = process.env.PROPLAB_API_URL ?? "https://nbaproplab.com";
const API_KEY = process.env.PROPLAB_API_KEY ?? "";
const CHARACTER_LIMIT = 40_000;

// ── HTTP client ───────────────────────────────────────────────────────────

interface FetchOptions {
  method?: "GET" | "POST";
  params?: Record<string, string | undefined>;
  body?: unknown;
  auth?: boolean;
}

async function api<T = unknown>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { method = "GET", params, body, auth = false } = opts;

  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (auth && API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ""}`);
  }

  return (await res.json()) as T;
}

function truncate(json: string): string {
  if (json.length <= CHARACTER_LIMIT) return json;
  return json.slice(0, CHARACTER_LIMIT) + "\n\n... [TRUNCATED — use filters or date range to reduce data]";
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: truncate(JSON.stringify(data, null, 2)) }] };
}

function err(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text" as const, text: `Error: ${msg}` }] };
}

// ── Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "proplab-mcp-server",
  version: "1.0.0",
});

// ── Tool 1: Track Record ──────────────────────────────────────────────────

server.registerTool(
  "proplab_track_record",
  {
    title: "Get Track Record",
    description:
      "Get PropLab's historical pick performance: overall hit rate, profit, rating breakdown (Elite/Good/Marginal/Weak), daily results, and recent Good+ picks. " +
      "Without a tier filter the overall/total fields cover ALL tiers (including internal Weak/Avoid picks that are never published) and the premium* fields cover Good+; with a tier filter EVERY headline field describes that tier only. " +
      "Supports league filter (nba/wnba), tier filter, stat type, and date range. Public — no auth required.",
    inputSchema: {
      league: z.enum(["nba", "wnba"]).optional().describe("Filter by league"),
      tier: z.enum(["Good", "Premium", "Marginal", "Standard"]).optional().describe("Filter by pick tier"),
      statType: z.string().optional().describe("Filter by stat: Points, Rebounds, Assists, Threes, PtsRebAst, etc."),
      from: z.string().optional().describe("Start date YYYY-MM-DD"),
      to: z.string().optional().describe("End date YYYY-MM-DD"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (params) => {
    try {
      const data = await api("/api/v1/track-record", {
        params: { league: params.league, tier: params.tier, statType: params.statType, from: params.from, to: params.to },
      });
      return ok(data);
    } catch (e) { return err(e); }
  },
);

// ── Tool 2: Dashboard ─────────────────────────────────────────────────────

server.registerTool(
  "proplab_dashboard",
  {
    title: "Get Daily Dashboard",
    description:
      "Get today's (or a specific date's) dashboard: games with spreads/totals, top 10 scored picks, and rating distribution. Public — no auth required.",
    inputSchema: {
      date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today (CST)"),
      league: z.enum(["nba", "wnba"]).optional().describe("Filter by league"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (params) => {
    try {
      const data = await api("/api/v1/dashboard/today", { params: { date: params.date, league: params.league } });
      return ok(data);
    } catch (e) { return err(e); }
  },
);

// ── Tool 3: Backtest Summary ──────────────────────────────────────────────

server.registerTool(
  "proplab_backtest_summary",
  {
    title: "Get Backtest Summary",
    description:
      "Aggregate backtest over PREMIUM (Good+) picks only: total picks, hits, misses, pushes, hit rate, profit, and ROI for a date range. " +
      "Requires auth (PROPLAB_API_KEY). Supports league filter.",
    inputSchema: {
      from: z.string().optional().describe("Start date YYYY-MM-DD (default: 14 days ago)"),
      to: z.string().optional().describe("End date YYYY-MM-DD (default: today)"),
      league: z.enum(["nba", "wnba"]).optional().describe("Filter by league"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (params) => {
    try {
      const data = await api("/api/v1/backtest/summary", { auth: true, params: { from: params.from, to: params.to, league: params.league } });
      return ok(data);
    } catch (e) { return err(e); }
  },
);

// ── Tool 4: Backtest Daily ────────────────────────────────────────────────

server.registerTool(
  "proplab_backtest_daily",
  {
    title: "Get Backtest Daily",
    description:
      "Day-by-day backtest results with hits, misses, daily profit, and cumulative profit. " +
      "Requires auth (PROPLAB_API_KEY). Good for charting profit curves.",
    inputSchema: {
      from: z.string().optional().describe("Start date YYYY-MM-DD"),
      to: z.string().optional().describe("End date YYYY-MM-DD"),
      league: z.enum(["nba", "wnba"]).optional().describe("Filter by league"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (params) => {
    try {
      const data = await api("/api/v1/backtest/daily", { auth: true, params: { from: params.from, to: params.to, league: params.league } });
      return ok(data);
    } catch (e) { return err(e); }
  },
);

// ── Tool 5: Backtest By Rating ────────────────────────────────────────────

server.registerTool(
  "proplab_backtest_by_rating",
  {
    title: "Get Backtest By Rating",
    description:
      "Hit rate and profit broken down by pick rating tier (Elite, Good, Marginal, Weak, Avoid). " +
      "Requires auth. Use to compare tier quality across leagues.",
    inputSchema: {
      from: z.string().optional().describe("Start date YYYY-MM-DD"),
      to: z.string().optional().describe("End date YYYY-MM-DD"),
      league: z.enum(["nba", "wnba"]).optional().describe("Filter by league"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (params) => {
    try {
      const data = await api("/api/v1/backtest/by-rating", { auth: true, params: { from: params.from, to: params.to, league: params.league } });
      return ok(data);
    } catch (e) { return err(e); }
  },
);

// ── Tool 6: Backtest By Stat ──────────────────────────────────────────────

server.registerTool(
  "proplab_backtest_by_stat",
  {
    title: "Get Backtest By Stat Type",
    description:
      "Hit rate and profit broken down by stat market (Points, Rebounds, Assists, PtsRebAst, etc.). " +
      "Requires auth. Use to find which markets the model performs best on.",
    inputSchema: {
      from: z.string().optional().describe("Start date YYYY-MM-DD"),
      to: z.string().optional().describe("End date YYYY-MM-DD"),
      league: z.enum(["nba", "wnba"]).optional().describe("Filter by league"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (params) => {
    try {
      const data = await api("/api/v1/backtest/by-stat", { auth: true, params: { from: params.from, to: params.to, league: params.league } });
      return ok(data);
    } catch (e) { return err(e); }
  },
);

// ── Tool 7: Pick Details ──────────────────────────────────────────────────

server.registerTool(
  "proplab_pick_details",
  {
    title: "Get Pick Details",
    description:
      "Get full details for a specific pick by ID: player, stat, line, direction, score, 7-block breakdown, spider chart data, and settlement result.",
    inputSchema: {
      id: z.number().int().positive().describe("Pick ID"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (params) => {
    try {
      const data = await api(`/api/v1/picks/${params.id}`, { auth: true });
      return ok(data);
    } catch (e) { return err(e); }
  },
);

// ── Tool 8: Evaluate Pick ─────────────────────────────────────────────────

server.registerTool(
  "proplab_evaluate_pick",
  {
    title: "Evaluate a Pick",
    description:
      "Score a custom pick on-demand through PropLab's 7-block engine. Returns a confidence score (0-100), rating, and block-by-block breakdown. " +
      "Requires auth.",
    inputSchema: {
      playerName: z.string().describe("Full player name, e.g. 'LeBron James'"),
      statType: z.string().describe("Stat market: Points, Rebounds, Assists, Threes, Steals, Blocks, PtsRebAst, PtsReb, PtsAst, RebAst"),
      line: z.number().describe("The prop line, e.g. 25.5"),
      direction: z.enum(["Over", "Under"]).describe("Over or Under"),
      opponentTeam: z.string().optional().describe("Opponent team abbreviation, e.g. 'LAL'. Auto-detected from today's schedule if omitted"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async (params) => {
    try {
      const data = await api("/api/v1/picks/evaluate", {
        method: "POST",
        auth: true,
        body: {
          playerName: params.playerName,
          statType: params.statType,
          line: params.line,
          direction: params.direction,
          opponentTeam: params.opponentTeam,
        },
      });
      return ok(data);
    } catch (e) { return err(e); }
  },
);

// ── Tool 9: Player Research ───────────────────────────────────────────────

server.registerTool(
  "proplab_player_research",
  {
    title: "Get Player Research",
    description:
      "Deep research data for a player: season averages, recent game logs, matchup history, DvP, trends, and injury status. " +
      "Use proplab_search_players first to get the playerId.",
    inputSchema: {
      playerId: z.number().int().positive().describe("Internal player ID (from search_players)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (params) => {
    try {
      const data = await api(`/api/v1/research/player/${params.playerId}`, { auth: true });
      return ok(data);
    } catch (e) { return err(e); }
  },
);

// ── Tool 10: Search Players ───────────────────────────────────────────────

server.registerTool(
  "proplab_search_players",
  {
    title: "Search Players",
    description:
      "Search for NBA/WNBA players by name. Returns player ID, full name, team, and position. " +
      "Use the returned ID with proplab_player_research or proplab_evaluate_pick.",
    inputSchema: {
      q: z.string().min(2).describe("Player name or partial name, e.g. 'LeBron' or 'Gilgeous'"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (params) => {
    try {
      const data = await api("/api/v1/players/search", { params: { q: params.q } });
      return ok(data);
    } catch (e) { return err(e); }
  },
);

// ── Tool 11: Games Schedule ───────────────────────────────────────────────

server.registerTool(
  "proplab_games",
  {
    title: "Get Games",
    description:
      "Get NBA/WNBA games for a date: teams, spreads, totals, game status. Defaults to today.",
    inputSchema: {
      date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (params) => {
    try {
      const data = await api("/api/v1/games", { params: { date: params.date } });
      return ok(data);
    } catch (e) { return err(e); }
  },
);

// ── Tool 12: Pipeline & Health ────────────────────────────────────────────

server.registerTool(
  "proplab_system_status",
  {
    title: "Get System Status",
    description:
      "Check PropLab system health: API health status, recent pipeline runs, data freshness, and any errors.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => {
    try {
      const [health, freshness] = await Promise.allSettled([
        api("/api/v1/health"),
        api("/api/v1/diagnostics/freshness"),
      ]);

      const result = {
        health: health.status === "fulfilled" ? health.value : { error: (health.reason as Error).message },
        freshness: freshness.status === "fulfilled" ? freshness.value : { error: (freshness.reason as Error).message },
      };
      return ok(result);
    } catch (e) { return err(e); }
  },
);

// ── Start ─────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("PropLab MCP server running via stdio");
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
