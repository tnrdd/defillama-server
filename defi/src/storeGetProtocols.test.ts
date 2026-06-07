jest.mock("./protocols/data", () => ({
  __esModule: true,
  default: [
    {
      id: "1",
      name: "Visible Protocol",
      category: "Lending",
      chains: ["Ethereum"],
    },
  ],
}));

jest.mock("./protocols/parentProtocols", () => ({
  __esModule: true,
  default: [],
}));

jest.mock("./getProtocols", () => ({
  craftProtocolsResponse: jest.fn(),
}));

jest.mock("./utils/getProtocolTvl", () => ({
  getProtocolTvl: jest.fn(),
}));

jest.mock("./api2/cache/file-cache", () => ({
  readRouteData: jest.fn(),
}));

import { craftProtocolsResponse } from "./getProtocols";
import { getProtocolTvl } from "./utils/getProtocolTvl";
import { readRouteData } from "./api2/cache/file-cache";
import {
  getDimensionConfiguredChainLabels,
  getVisibleChainLabels,
  hasDimensionsChainVisibility,
  storeGetProtocols,
} from "./storeGetProtocols";

const mockedCraftProtocolsResponse = craftProtocolsResponse as jest.MockedFunction<typeof craftProtocolsResponse>;
const mockedGetProtocolTvl = getProtocolTvl as jest.MockedFunction<typeof getProtocolTvl>;
const mockedReadRouteData = readRouteData as jest.MockedFunction<typeof readRouteData>;

describe("storeGetProtocols visible chain filtering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("helper normalizes old names and includes dimensions-backed chains while excluding registry-only chains", () => {
    const protocolChainTvls = {
      Ethereum: 100,
      Optimism: 50,
    };
    const dimensionsChainAggData = {
      hyperliquid: {
        fees: {
          df: { "24h": 1 },
        },
      },
      hyperevm: {},
    };

    expect(hasDimensionsChainVisibility(dimensionsChainAggData.hyperliquid)).toBe(true);
    expect(hasDimensionsChainVisibility(dimensionsChainAggData.hyperevm)).toBe(false);
    expect(getVisibleChainLabels(protocolChainTvls, dimensionsChainAggData)).toEqual([
      "Ethereum",
      "OP Mainnet",
      "Hyperliquid L1",
    ]);
  });

  test("helper derives directly dimension-configured chains without including HyperEVM", () => {
    const chains = getDimensionConfiguredChainLabels();

    expect(chains).toEqual(
      expect.arrayContaining([
        "Adventure Layer",
        "Akash",
        "AlienX",
        "Appchain",
        "Arweave",
        "Deri Chain",
        "Heima",
        "Moca",
        "Molten Network",
        "Monero",
        "Mythos",
        "NeuroWeb",
        "Pendulum",
        "Robonomics",
        "Seda",
        "SKALE",
      ])
    );
    expect(chains).not.toContain("HyperEVM");
  });

  test("storeGetProtocols keeps protocol chains unchanged and filters top-level chains by visibility", async () => {
    mockedCraftProtocolsResponse.mockResolvedValue([
      {
        id: "1",
        name: "Visible Protocol",
        category: "Lending",
        chains: ["Ethereum"],
        chainTvls: { Ethereum: 100 },
        oraclesByChain: {},
        symbol: "VP",
        logo: "",
        url: "",
        referralUrl: "",
        parentProtocol: undefined,
        governanceID: undefined,
        gecko_id: undefined,
        tvl: 100,
      } as any,
    ]);
    mockedGetProtocolTvl.mockResolvedValue({
      tvl: 100,
      tvlPrevDay: 90,
      tvlPrevWeek: 80,
      tvlPrevMonth: 70,
      chainTvls: {
        Ethereum: {
          tvl: 100,
          tvlPrevDay: 90,
          tvlPrevWeek: 80,
          tvlPrevMonth: 70,
        },
      },
    } as any);
    mockedReadRouteData.mockResolvedValue({
      hyperliquid: {
        fees: {
          df: { "24h": 1 },
        },
      },
    });

    const { protocols2Data } = await storeGetProtocols({
      getCoinMarkets: async () => ({}),
    });

    expect(protocols2Data.protocols).toHaveLength(1);
    expect(protocols2Data.protocols[0].chains).toEqual(["Ethereum"]);
    expect(protocols2Data.chains).toEqual(expect.arrayContaining(["Ethereum", "Hyperliquid L1", "Akash", "Arweave"]));
    expect(protocols2Data.chains).not.toContain("HyperEVM");
  });

  test("storeGetProtocols includes chains backed by hidden chain-category protocol rows", async () => {
    mockedCraftProtocolsResponse.mockResolvedValue([
      {
        id: "1",
        name: "Visible Protocol",
        category: "Lending",
        chains: ["Ethereum"],
        chainTvls: { Ethereum: 100 },
        oraclesByChain: {},
        symbol: "VP",
        logo: "",
        url: "",
        referralUrl: "",
        parentProtocol: undefined,
        governanceID: undefined,
        gecko_id: undefined,
        tvl: 100,
      } as any,
      {
        id: "7818",
        name: "Quai Network",
        category: "Chain",
        chains: ["Quai"],
        chainTvls: { Quai: 0 },
        oraclesByChain: {},
        symbol: "QUAI",
        logo: "",
        url: "",
        referralUrl: "",
        parentProtocol: undefined,
        governanceID: undefined,
        gecko_id: "quai-network",
        tvl: 0,
      } as any,
    ]);
    mockedGetProtocolTvl.mockImplementation(async (protocol: any) => {
      if (protocol.id === "7818") {
        return {
          tvl: 0,
          tvlPrevDay: 0,
          tvlPrevWeek: 0,
          tvlPrevMonth: 0,
          chainTvls: {
            Quai: {
              tvl: 0,
              tvlPrevDay: 0,
              tvlPrevWeek: 0,
              tvlPrevMonth: 0,
            },
          },
        } as any;
      }

      return {
        tvl: 100,
        tvlPrevDay: 90,
        tvlPrevWeek: 80,
        tvlPrevMonth: 70,
        chainTvls: {
          Ethereum: {
            tvl: 100,
            tvlPrevDay: 90,
            tvlPrevWeek: 80,
            tvlPrevMonth: 70,
          },
        },
      } as any;
    });
    mockedReadRouteData.mockResolvedValue({
      hyperevm: {},
    });

    const { protocols2Data } = await storeGetProtocols({
      getCoinMarkets: async () => ({}),
    });

    expect(protocols2Data.protocols.map((p: any) => p.name)).toEqual(["Visible Protocol"]);
    expect(protocols2Data.chains).toEqual(expect.arrayContaining(["Ethereum", "Quai", "Akash", "Arweave"]));
    expect(protocols2Data.chains).not.toContain("HyperEVM");
  });

  test("storeGetProtocols includes chains backed only by excluded chart categories", async () => {
    mockedCraftProtocolsResponse.mockResolvedValue([
      {
        id: "1",
        name: "Visible Protocol",
        category: "Lending",
        chains: ["Ethereum"],
        chainTvls: { Ethereum: 100 },
        oraclesByChain: {},
        symbol: "VP",
        logo: "",
        url: "",
        referralUrl: "",
        parentProtocol: undefined,
        governanceID: undefined,
        gecko_id: undefined,
        tvl: 100,
      } as any,
      {
        id: "2",
        name: "RWA Protocol",
        category: "RWA",
        chains: ["Pharos"],
        chainTvls: { Pharos: 50 },
        oraclesByChain: {},
        symbol: "RP",
        logo: "",
        url: "",
        referralUrl: "",
        parentProtocol: undefined,
        governanceID: undefined,
        gecko_id: undefined,
        tvl: 50,
      } as any,
    ]);
    mockedGetProtocolTvl.mockImplementation(async (protocol: any) => {
      if (protocol.id === "2") {
        return {
          tvl: 50,
          tvlPrevDay: 45,
          tvlPrevWeek: 40,
          tvlPrevMonth: 35,
          chainTvls: {
            Pharos: {
              tvl: 50,
              tvlPrevDay: 45,
              tvlPrevWeek: 40,
              tvlPrevMonth: 35,
            },
          },
        } as any;
      }

      return {
        tvl: 100,
        tvlPrevDay: 90,
        tvlPrevWeek: 80,
        tvlPrevMonth: 70,
        chainTvls: {
          Ethereum: {
            tvl: 100,
            tvlPrevDay: 90,
            tvlPrevWeek: 80,
            tvlPrevMonth: 70,
          },
        },
      } as any;
    });
    mockedReadRouteData.mockResolvedValue({
      ethereum: {
        fees: {
          df: { "24h": 1 },
        },
      },
    });

    const { protocols2Data } = await storeGetProtocols({
      getCoinMarkets: async () => ({}),
    });

    expect(protocols2Data.protocols.map((p: any) => p.chains)).toEqual([["Ethereum"], ["Pharos"]]);
    expect(protocols2Data.chains).toEqual(expect.arrayContaining(["Ethereum", "Pharos", "Akash", "Arweave"]));
    expect(protocols2Data.chains).not.toContain("HyperEVM");
  });

  test("storeGetProtocols falls back to cached visible chains when dimensions cache is missing or empty", async () => {
    mockedCraftProtocolsResponse.mockResolvedValue([
      {
        id: "1",
        name: "Visible Protocol",
        category: "Lending",
        chains: ["Optimism"],
        chainTvls: { Optimism: 100 },
        oraclesByChain: {},
        symbol: "VP",
        logo: "",
        url: "",
        referralUrl: "",
        parentProtocol: undefined,
        governanceID: undefined,
        gecko_id: undefined,
        tvl: 100,
      } as any,
    ]);
    mockedGetProtocolTvl.mockResolvedValue({
      tvl: 100,
      tvlPrevDay: 90,
      tvlPrevWeek: 80,
      tvlPrevMonth: 70,
      chainTvls: {
        Optimism: {
          tvl: 100,
          tvlPrevDay: 90,
          tvlPrevWeek: 80,
          tvlPrevMonth: 70,
        },
      },
    } as any);
    mockedReadRouteData.mockImplementation(async (route: string) => {
      if (route === "/dimensions/chain-agg-data") return {};
      if (route === "/lite/protocols2") return { chains: ["Hyperliquid L1"] } as any;
      return null;
    });

    const { protocols2Data } = await storeGetProtocols({
      getCoinMarkets: async () => ({}),
    });

    expect(protocols2Data.chains).toEqual(expect.arrayContaining(["OP Mainnet", "Hyperliquid L1", "Akash", "Arweave"]));
    expect(protocols2Data.chains).not.toContain("HyperEVM");
  });
});
