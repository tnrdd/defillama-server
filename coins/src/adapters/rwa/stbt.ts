import fetch from "node-fetch";
import { Write } from "../utils/dbInterfaces";
import { addToDBWritesList } from "../utils/database";
import { getCurrentUnixTimestamp } from "../../utils/date";

/*
 STBT (Matrixdock Short-term Treasury Bill Token) is a permissioned, rebasing token
 pegged to $1 — yield accrues via daily supply rebase, not via price. It is NOT on
 CoinGecko, and its only on-chain liquidity is a near-zero-volume Curve pool
 (thin -> noisy, prone to spikes), so neither the default DEX pricing nor CG cover it.

 We price it from Coinpaprika (a real external mark, ~$0.98) for live runs, and fall
 back to the $1 peg when Coinpaprika is unavailable / out of band, or for historical
 re-derivations (Coinpaprika's free tier can't serve old dates, and a rebasing
 T-bill token is ~$1 by construction). BSC is the same token bridged 1:1.

 See memory: reference_pricing_cgless_rwa_tokens, issue_rwa_longgap_stbt_usdplus_bibta.
*/

const PAPRIKA_ID = "stbt-short-term-t-bill-token";
const PEG = 1;
const DECIMALS = 18;
// sanity band for a $1-pegged T-bill token — reject obviously-bad Coinpaprika marks
const MIN_OK = 0.9;
const MAX_OK = 1.1;
const MAX_SPOT_AGE_H = 48;

const STBT: { [chain: string]: string } = {
  ethereum: "0x530824DA86689C9C17CdC2871Ff29B058345b44a",
  bsc: "0x61B7A0Bb3986e40eC06f3184DA6153c4B3F6233f",
};

async function paprikaSpot(): Promise<number | undefined> {
  try {
    const r: any = await (
      await fetch(`https://api.coinpaprika.com/v1/tickers/${PAPRIKA_ID}`)
    ).json();
    const price = r?.quotes?.USD?.price;
    const updated = r?.last_updated ? Math.floor(Date.parse(r.last_updated) / 1000) : 0;
    const ageH = (getCurrentUnixTimestamp() - updated) / 3600;
    if (typeof price === "number" && price >= MIN_OK && price <= MAX_OK && ageH <= MAX_SPOT_AGE_H)
      return price;
    console.log(`stbt: ignoring Coinpaprika mark price=${price} ageH=${ageH.toFixed(1)}`);
  } catch (e) {
    console.log(`stbt: Coinpaprika fetch failed: ${(e as Error).message}`);
  }
  return undefined;
}

export async function stbt(timestamp: number = 0): Promise<Write[]> {
  // Only trust the Coinpaprika *current* mark for live runs. For historical
  // re-derivations use the $1 peg (a rebasing T-bill token is ~$1 by construction,
  // and Coinpaprika's current quote is not a valid price for past dates).
  const isLive = timestamp === 0 || getCurrentUnixTimestamp() - timestamp < 2 * 86400;
  const spot = isLive ? await paprikaSpot() : undefined;
  const price = spot ?? PEG;
  const confidence = spot !== undefined ? 0.9 : 0.85;

  const writes: Write[] = [];
  for (const [chain, address] of Object.entries(STBT)) {
    addToDBWritesList(writes, chain, address, price, DECIMALS, "STBT", timestamp, "stbt", confidence);
  }
  return writes;
}
