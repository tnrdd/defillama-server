import { Write } from "../utils/dbInterfaces";
import { getApi } from "../utils/sdk";
import getWrites from "../utils/getWrites";
import { checkOracleFresh } from "../utils/oracle";

const chain = "ethereum";
const token = "0x9a1bFb2B9E3d1959Ed11636bc56DB0aB7b4473A9";
const oracle = "0xE41cD2DcC63EB63A9D9e62f2a3D9b49e6d0C0A1d";

export async function SurARSs(timestamp: number = 0): Promise<Write[]> {
  const api = await getApi(chain, timestamp);

  // latestRoundData (not latestAnswer) so we get updatedAt for a freshness check
  const [, answer, , updatedAt] = await api.call({
    target: oracle,
    abi: "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  });

  // skip writing a stale price rather than reporting a frozen oracle value as current
  if (!checkOracleFresh(updatedAt, { timestamp, label: "ARSs", throwIfStale: false }))
    return [];

  const price = Number(answer) / 1e8; // oracle reports 8 decimals

  const pricesObject = {
    [token]: {
      price,
      symbol: "ARSs",
      decimals: 18,
    },
  };

  return getWrites({
    chain,
    timestamp,
    pricesObject,
    projectName: "SurARSs",
    confidence: 0.9,
  });
}
