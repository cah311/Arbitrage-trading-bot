const ethers = require("ethers");
const Big = require("big.js");

const IUniswapV2Pair = require("@uniswap/v2-core/build/IUniswapV2Pair.json");
const IERC20 = require("@openzeppelin/contracts/build/contracts/ERC20.json");

// LB Pair ABI for basic functions
const LB_PAIR_ABI = [
  "function getActiveId() external view returns (uint24 activeId)",
  "function getBin(uint24 id) external view returns (uint128 binReserveX, uint128 binReserveY)",
  "function getPriceFromId(uint24 id) external view returns (uint256 price)",
  "function getTokenX() external view returns (address tokenX)",
  "function getTokenY() external view returns (address tokenY)",
  "event Swap(address indexed sender, address indexed to, uint24 id, bytes32 amountsIn, bytes32 amountsOut, uint24 volatilityAccumulator, bytes32 totalFees, bytes32 protocolFees)",
];

// LB Factory ABI
const LB_FACTORY_ABI = [
  "function getLBPairInformation(address tokenA, address tokenB, uint256 binStep) external view returns (address lbPair, bool createdByOwner, bool ignoredForRouting)",
];

async function getTokenAndContract(_token0Address, _token1Address, _provider) {
  const token0Contract = new ethers.Contract(
    _token0Address,
    IERC20.abi,
    _provider
  );
  const token1Contract = new ethers.Contract(
    _token1Address,
    IERC20.abi,
    _provider
  );

  const token0 = {
    address: _token0Address,
    decimals: 18,
    symbol: await token0Contract.symbol(),
    name: await token0Contract.name(),
  };

  const token1 = {
    address: _token1Address,
    decimals: await token1Contract.decimals(), // Get actual decimals for USDC (6)
    symbol: await token1Contract.symbol(),
    name: await token1Contract.name(),
  };

  return { token0Contract, token1Contract, token0, token1 };
}

async function getPairAddress(_V2Factory, _token0, _token1) {
  const pairAddress = await _V2Factory.getPair(_token0, _token1);
  return pairAddress;
}

async function getPairContract(_V2Factory, _token0, _token1, _provider) {
  const pairAddress = await getPairAddress(_V2Factory, _token0, _token1);
  const pairContract = new ethers.Contract(
    pairAddress,
    IUniswapV2Pair.abi,
    _provider
  );
  return pairContract;
}

async function getLBPairContract(_LBFactory, _token0, _token1, _provider) {
  // Use the known pool address directly instead of factory lookup
  console.log(
    "Using known LB Pair address: 0x864d4e5ee7318e97483db7eb0912e09f161516ea"
  );
  const lbPairContract = new ethers.Contract(
    "0x864d4e5ee7318e97483db7eb0912e09f161516ea",
    LB_PAIR_ABI,
    _provider
  );
  return lbPairContract;
}

async function getReserves(_pairContract) {
  const reserves = await _pairContract.getReserves();
  return [reserves.reserve0, reserves.reserve1];
}

async function getLBPrice(_lbPairContract) {
  try {
    const activeId = await _lbPairContract.getActiveId();
    const price = await _lbPairContract.getPriceFromId(activeId);

    // Price is returned as a Q128.128 fixed point number
    // Convert to readable format
    const priceFormatted = ethers.utils.formatUnits(price, 18);
    return Big(priceFormatted);
  } catch (error) {
    console.log("Error getting LB price:", error);
    throw error;
  }
}

async function calculatePrice(_pairContract) {
  const [x, y] = await getReserves(_pairContract);
  return Big(x).div(Big(y));
}

async function calculateDifference(_uPrice, _sPrice) {
  return (((_uPrice - _sPrice) / _sPrice) * 100).toFixed(2);
}

async function simulate(amount, _routerPath, _token0, _token1) {
  const trade1 = await _routerPath[0].getAmountsOut(amount, [
    _token0.address,
    _token1.address,
  ]);
  const trade2 = await _routerPath[1].getAmountsOut(trade1[1], [
    _token1.address,
    _token0.address,
  ]);

  const amountIn = Number(ethers.utils.formatUnits(trade1[0], "ether"));
  const amountOut = Number(ethers.utils.formatUnits(trade2[1], "ether"));

  return { amountIn, amountOut };
}

async function simulateLB(amount, _routerPath, _token0, _token1, direction) {
  try {
    if (direction === "TJ_TO_P") {
      // First trade on LB Router, second on Pangolin V2
      const lbRouter = _routerPath[0];
      const v2Router = _routerPath[1];

      // For LB, we need to use swapExactTokensForTokens with path
      const path = [_token0.address, _token1.address];
      const trade1 = await lbRouter.getSwapOut(path[0], path[1], amount);
      const trade2 = await v2Router.getAmountsOut(trade1.amountOut, [
        _token1.address,
        _token0.address,
      ]);

      const amountIn = Number(ethers.utils.formatUnits(amount, "ether"));
      const amountOut = Number(ethers.utils.formatUnits(trade2[1], "ether"));

      return { amountIn, amountOut };
    } else {
      // First trade on Pangolin V2, second on LB Router
      const v2Router = _routerPath[0];
      const lbRouter = _routerPath[1];

      const trade1 = await v2Router.getAmountsOut(amount, [
        _token0.address,
        _token1.address,
      ]);
      const path = [_token1.address, _token0.address];
      const trade2 = await lbRouter.getSwapOut(path[0], path[1], trade1[1]);

      const amountIn = Number(ethers.utils.formatUnits(amount, "ether"));
      const amountOut = Number(
        ethers.utils.formatUnits(trade2.amountOut, "ether")
      );

      return { amountIn, amountOut };
    }
  } catch (error) {
    console.log("Error in LB simulation:", error);
    // Fallback to simple simulation
    return simulate(amount, _routerPath, _token0, _token1);
  }
}

module.exports = {
  getTokenAndContract,
  getPairAddress,
  getPairContract,
  getLBPairContract,
  getReserves,
  getLBPrice,
  calculatePrice,
  calculateDifference,
  simulate,
  simulateLB,
};
