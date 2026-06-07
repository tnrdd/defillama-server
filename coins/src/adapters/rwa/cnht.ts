import { Write } from "../utils/dbInterfaces";
import { getApi } from "../utils/sdk";
import { addToDBWritesList } from "../utils/database";
import { checkOracleFresh } from "../utils/oracle";

/*
 CNHT (Tether CNH) is a stablecoin pegged 1:1 to offshore Chinese yuan (CNH). It was
 delisted from CoinGecko (id cnh-tether returns 404) and has no DEX liquidity on
 Ethereum or Tron, so there is no market price source.

 We price it off the Chainlink CNY/USD feed — the same pattern Jarvis uses for jCNY
 and brix uses for the TRY-pegged iTRY. Onshore CNY (the feed) vs offshore CNH (the
 token) diverge ~0.1-0.4%, negligible for a stablecoin mcap. The feed lives on
 Polygon; the price (an FX rate) is chain-agnostic, so we read it once and apply it
 to CNHT on every chain it exists.

 See memory: reference_pricing_cgless_rwa_tokens, issue_rwa_longgap_stbt_usdplus_bibta.
*/

const CNY_USD_FEED = "0x04bB437Aa63E098236FA47365f0268547f6EAB32"; // Polygon, 8 decimals
const FEED_CHAIN = "polygon";
const latestRoundDataAbi =
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)";

// CNHT exists on Ethereum and Tron at the same FX-derived price. We write only the canonical Ethereum
// record here; Tron redirects to it via adapters/tokenMapping.json (so we don't write both chains).
const tokens: { chain: string; address: string }[] = [
  { chain: "ethereum", address: "0x6e109e9dd7fa1a58bc3eff667e8e41fc3cc07aef" },
];
const DECIMALS = 6;
// Forex feeds idle over weekends/holidays — allow up to 4 days before treating as stale.
const FX_MAX_AGE_SECONDS = 4 * 24 * 60 * 60;

export async function cnht(timestamp: number = 0): Promise<Write[]> {
  const api = await getApi(FEED_CHAIN, timestamp);
  const round = await api.call({ abi: latestRoundDataAbi, target: CNY_USD_FEED });

  checkOracleFresh(round.updatedAt, {
    timestamp,
    label: "CNY/USD",
    maxAgeSeconds: FX_MAX_AGE_SECONDS,
  });

  const price = Number(round.answer) / 1e8;

  const writes: Write[] = [];
  for (const { chain, address } of tokens) {
    addToDBWritesList(writes, chain, address, price, DECIMALS, "CNHT", timestamp, "cnht", 0.9);
  }
  return writes;
}
