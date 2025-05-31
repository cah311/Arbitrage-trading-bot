require("dotenv").config();
const ethers = require("ethers");

const config = require("../config.json");
const arbitrageAbi = require("../artifacts/contracts/Arbitrage.sol/Arbitrage.json");

// -- PROVIDER -- //
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);

// -- INTERFACES -- //
const IUniswapV2Router02 = require("@uniswap/v2-periphery/build/IUniswapV2Router02.json");
const IUniswapV2Factory = require("@uniswap/v2-core/build/IUniswapV2Factory.json");

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
  pFactory,
  pRouter,
  arbitrage,
};
