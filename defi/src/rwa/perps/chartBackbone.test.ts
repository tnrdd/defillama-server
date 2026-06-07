/**
 * Regression guard for the 2026-05-26 chart freeze (PR #12118).
 *
 * Bug: generateHistoricalCharts gated the daily backbone on an `updated_at`
 * high-water-mark (`fetchAllDailyRecordsPG(lastSync)`). A mass `updated_at`
 * rewrite (deploy-time migration / backfill) pushed the watermark past
 * not-yet-merged days, so the per-id chart backbone froze while only the live
 * tip kept moving.
 *
 * This test drives the REAL generateHistoricalCharts (no reimplementation of
 * its merge logic) with in-memory fakes for ./db and the storage side of
 * ./file-cache — so it touches no DB, network, or prod cache. It reproduces the
 * mass-rewrite and asserts every day present in the daily table lands in the
 * chart. It fails against the watermark-gated version and passes after the fix.
 */

const DAY = 86400;
const MAY25 = 1779408000; // 2026-05-25 00:00:00 UTC (start-of-day aligned)

// A day's worth of daily-table row, midnight-aligned like storeHistoricalPG writes.
const dailyRow = (dayIdx: number, updatedAt: Date) => ({
    id: "xyz:spcx",
    timestamp: MAY25 + dayIdx * DAY,
    open_interest: 1_000_000 + dayIdx,
    volume_24h: 500_000 + dayIdx,
    price: 200 + dayIdx,
    price_change_24h: 0,
    funding_rate: 0,
    premium: 0,
    cumulative_funding: 0,
    updated_at: updatedAt,
});

// The mass-rewrite instant: every daily row's updated_at collapses to this.
const MASS_REWRITE = new Date("2026-05-26T14:36:33.000Z");

// Days 0..7 => 2026-05-25 .. 2026-06-01, ALL stamped with the mass-rewrite time.
const ALL_DAILY = Array.from({ length: 8 }, (_, i) => dailyRow(i, MASS_REWRITE));

// Mock the data source. fetchAllDailyRecordsPG honours the updatedAfter filter
// exactly like the real Sequelize query (updated_at > X), so a watermark-gated
// caller gets nothing once lastSync >= the mass-rewrite instant.
jest.mock("./db", () => ({
    fetchAllDailyRecordsPG: jest.fn(async (updatedAfter?: Date) =>
        updatedAfter ? ALL_DAILY.filter((r) => r.updated_at > updatedAfter) : ALL_DAILY
    ),
    fetchLatestHourlyForChartTipsPG: jest.fn(async () => ({
        "xyz:spcx": {
            id: "xyz:spcx",
            timestamp: 1780099200 + 47700, // 2026-06-02 13:15 (a live, non-midnight tip, after the last daily)
            open_interest: 9_999_999,
            volume_24h: 123,
            price: 199.79,
            price_change_24h: 0,
            funding_rate: 0,
            premium: 0,
            cumulative_funding: 0,
        },
    })),
    fetchMaxUpdatedAtPG: jest.fn(async () => MASS_REWRITE),
    fetchAllDailyIdsPG: jest.fn(async () => ["xyz:spcx"]),
}));

// Keep the real merge/cache logic (mergeHistoricalData) — only fake the
// frozen pre-existing chart, the persisted output, and the sync watermark.
const stored: Record<string, any[]> = {};
jest.mock("./file-cache", () => ({
    ...jest.requireActual("./file-cache"),
    // Pre-incident backbone: frozen at 2026-05-25 (day 0) only.
    readHistoricalDataForId: jest.fn(async () => [
        {
            timestamp: MAY25,
            openInterest: 1_000_000,
            volume24h: 500_000,
            price: 200,
            priceChange24h: 0,
            fundingRate: 0,
            premium: 0,
            cumulativeFunding: 0,
        },
    ]),
    storeHistoricalDataForId: jest.fn(async (id: string, data: any[]) => {
        stored[id] = data;
    }),
    // Old code read this to build its watermark; point it AT the mass-rewrite
    // instant so the gated path would fetch zero new rows.
    getSyncMetadata: jest.fn(async () => ({
        lastSyncTimestamp: MASS_REWRITE.toISOString(),
        lastSyncDate: MASS_REWRITE.toISOString(),
        totalIds: 1,
    })),
    setSyncMetadata: jest.fn(async () => undefined),
}));

import { setContractMetadata } from "./constants";
import { generateHistoricalCharts } from "./cron";

describe("generateHistoricalCharts — daily backbone is not watermark-gated (PR #12118 regression)", () => {
    beforeAll(() => {
        // hasContractMetadata must be true or the id is skipped.
        setContractMetadata("xyz:spcx", { contract: "xyz:spcx" } as any);
    });

    it("includes every day from the daily table even after a mass updated_at rewrite", async () => {
        await generateHistoricalCharts();

        const chart = stored["xyz:spcx"];
        expect(chart).toBeDefined();

        const dailyTimestamps = chart
            .map((p) => p.timestamp)
            .filter((t) => t % DAY === 0)
            .sort((a, b) => a - b);

        // All 8 days (2026-05-25 .. 2026-06-01) must be present — the gap the
        // watermark bug left (days 1..7) is what this asserts is now filled.
        const expectedDays = Array.from({ length: 8 }, (_, i) => MAY25 + i * DAY);
        expect(dailyTimestamps).toEqual(expectedDays);

        // And the live tip is still appended as the rightmost point.
        expect(chart[chart.length - 1].timestamp % DAY).not.toBe(0);
    });
});
