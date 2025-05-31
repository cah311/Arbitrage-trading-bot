require("dotenv").config();
const ethers = require("ethers");

const config = require("../config.json");
const arbitrageAbi = require("../artifacts/contracts/Arbitrage.sol/Arbitrage.json");

// -- PROVIDER -- //
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);

// -- INTERFACES -- //
const IUniswapV2Router02 = require("@uniswap/v2-periphery/build/IUniswapV2Router02.json");
const IUniswapV2Factory = require("@uniswap/v2-core/build/IUniswapV2Factory.json");

// LB Router ABI (simplified)
const LB_ROUTER_ABI = [
  "function getSwapIn(address tokenA, address tokenB, uint128 amountOut) external view returns (uint128 amountIn, uint128 amountOutLeft, uint128 fee)",
  "function getSwapOut(address tokenA, address tokenB, uint128 amountIn) external view returns (uint128 amountOut, uint128 amountOutLeft, uint128 fee)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, uint256[] calldata pairBinSteps, address[] calldata path, address to, uint256 deadline) external returns (uint256 amountOut)",
];

// -- CONTRACTS -- //
// Trader Joe V2 (Traditional)
const tjFactory = new ethers.Contract(
  config.TRADERJOE.V2_FACTORY_ADDRESS,
  IUniswapV2Factory.abi,
  provider
);

const tjRouter = new ethers.Contract(
  config.TRADERJOE.V2_ROUTER_ADDRESS,
  IUniswapV2Router02.abi,
  provider
);

// Trader Joe V2.2 (Liquidity Book)
const tjLBFactory = new ethers.Contract(
  config.TRADERJOE.LB_FACTORY_ADDRESS,
  [
    "function getLBPairInformation(address tokenA, address tokenB, uint256 binStep) external view returns (address lbPair, bool createdByOwner, bool ignoredForRouting)",
  ],
  provider
);

const tjLBRouter = new ethers.Contract(
  config.TRADERJOE.LB_ROUTER_ADDRESS,
  LB_ROUTER_ABI,
  provider
);

// Pangolin V2
const pFactory = new ethers.Contract(
  config.PANGOLIN.V2_FACTORY_ADDRESS,
  IUniswapV2Factory.abi,
  provider
);

const pRouter = new ethers.Contract(
  config.PANGOLIN.V2_ROUTER_ADDRESS,
  IUniswapV2Router02.abi,
  provider
);

// -- ARBITRAGE CONTRACT -- //
const arbitrage = new ethers.Contract(
  config.PROJECT_SETTINGS.ARBITRAGE_ADDRESS,
  arbitrageAbi.abi,
  provider
);

module.exports = {
  provider,
  tjFactory,
  tjRouter,
  tjLBFactory,
  tjLBRouter,
  pFactory,
  pRouter,
  arbitrage,
};
