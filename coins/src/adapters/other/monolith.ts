import { getLogs } from "../../utils/cache/getLogs";
import { Write } from "../utils/dbInterfaces";
import getWrites from "../utils/getWrites";
import { getApi } from "../utils/sdk";
import { nullAddress } from "../../utils/shared/constants";

const FACTORY = "0x6D961c9DCF1AD73566822BA4B087892e3839B849";
const FROM_BLOCK = 24949282;
const CHAIN = "ethereum";
const PROJECT = "monolith";

export async function monolith(timestamp: number = 0): Promise<Write[]> {
  const api = await getApi(CHAIN, timestamp);

  const logs = await getLogs({
    api,
    target: FACTORY,
    fromBlock: FROM_BLOCK,
    eventAbi:
      "event Deployed(address indexed lender, address indexed coin, address indexed vault)",
    onlyArgs: true,
  });
  const markets = (logs as any[]).map((l) => ({ lender: l.lender, coin: l.coin }));
  if (markets.length === 0) return [];

  const lenders = markets.map((m) => m.lender);
  const coins = markets.map((m) => m.coin);

  const [coinDec, coinSym, psmAssets] = await Promise.all([
    api.multiCall({ abi: "uint8:decimals", calls: coins, permitFailure: true }),
    api.multiCall({ abi: "string:symbol", calls: coins, permitFailure: true }),
    api.multiCall({ abi: "address:psmAsset", calls: lenders, permitFailure: true }),
  ]);

  const psmDec = await api.multiCall({
    abi: "uint8:decimals",
    calls: psmAssets.map((p: any) => p ?? nullAddress),
    permitFailure: true,
  });

  const sellOutCalls = markets.map((_, i) => ({
    target: lenders[i],
    params: (BigInt(10) ** BigInt(Number(coinDec[i] ?? 18))).toString(),
  }));
  const psmOuts = await api.multiCall({
    abi: "function getSellAmountOut(uint256) view returns (uint256)",
    calls: sellOutCalls,
    permitFailure: true,
  });

  const pricesObject: any = {};
  markets.forEach((m, i) => {
    if (
      coinDec[i] == null ||
      psmAssets[i] == null ||
      psmDec[i] == null ||
      psmOuts[i] == null
    )
      return;
    const rate = Number(psmOuts[i]) / 10 ** Number(psmDec[i]);
    if (!isFinite(rate) || rate <= 0) return;
    pricesObject[m.coin] = {
      underlying: psmAssets[i],
      symbol: coinSym[i],
      decimals: Number(coinDec[i]),
      price: rate,
    };
  });

  return getWrites({
    chain: CHAIN,
    timestamp,
    pricesObject,
    projectName: PROJECT,
    confidence: 0.95,
  });
}
