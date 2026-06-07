import { Write } from "../utils/dbInterfaces";
import { getApi } from "../utils/sdk";
import getWrites from "../utils/getWrites";

// wstLINK (stake.link wrapped staked LINK) has effectively no DEX liquidity, so the CoinGecko mark is
// stale/unreliable (it has implied a ~1.44 wstLINK/LINK ratio off an old, higher LINK price). Price it
// from the on-chain wrap rate instead: 1 wstLINK = getUnderlyingByWrapped() stLINK (~1:1 with LINK in
// value), denominated in LINK. Confidence 1.0 so this wins over the CoinGecko redirect (0.99).
const chain = "ethereum";
const wstLINK = "0x911D86C72155c33993d594B0Ec7E6206B4C803da";
const LINK = "0x514910771AF9Ca656af840dff83E8264EcF986CA";

export async function wstlink(timestamp: number = 0): Promise<Write[]> {
  const api = await getApi(chain, timestamp);
  const rate = await api.call({
    target: wstLINK,
    abi: "function getUnderlyingByWrapped(uint256) view returns (uint256)",
    params: ["1000000000000000000"],
  });
  if (!rate || Number(rate) <= 0) return [];
  const pricesObject: any = {
    [wstLINK]: { price: Number(rate) / 1e18, underlying: LINK },
  };
  return getWrites({ chain, timestamp, pricesObject, projectName: "wstLINK", confidence: 1 });
}
