// -- HANDLE INITIAL SETUP -- //
require("./helpers/server");
require("dotenv").config();

const ethers = require("ethers");
const config = require("./config.json");
const {
  getTokenAndContract,
  getPairContract,
  getReserves,
  calculatePrice,
  simulate,
} = require("./helpers/helpers");
const {
  provider,
  tjFactory,
  tjRouter,
  pFactory,
  pRouter,
  arbitrage,
} = require("./helpers/initialization");

// -- .ENV VALUES HERE -- //
const arbFor = process.env.ARB_FOR; // WAVAX address
const arbAgainst = process.env.ARB_AGAINST; // USDC address
const units = process.env.UNITS; // Used for price display/reporting
const difference = process.env.PRICE_DIFFERENCE;
const gasLimit = process.env.GAS_LIMIT;
const gasPrice = process.env.GAS_PRICE;

let tjPair, pPair, amount;
let isExecuting = false;

const main = async () => {
  const { token0Contract, token1Contract, token0, token1 } =
    await getTokenAndContract(arbFor, arbAgainst, provider);

  tjPair = await getPairContract(
    tjFactory,
    token0.address,
    token1.address,
    provider
  );
  pPair = await getPairContract(
    pFactory,
    token0.address,
    token1.address,
    provider
  );

  console.log(`Trader Joe V2 Pair Address: ${tjPair.address}`);
  console.log(`Pangolin Pair Address: ${pPair.address}\n`);

  tjPair.on("Swap", async () => {
    if (!isExecuting) {
      isExecuting = true;

      const priceDifference = await checkPrice("Trader Joe V2", token0, token1);
      const routerPath = await determineDirection(priceDifference);

      if (!routerPath) {
        console.log(`No Arbitrage Currently Available\n`);
        console.log(`-----------------------------------------\n`);
        isExecuting = false;
        return;
      }

      const isProfitable = await determineProfitability(
        routerPath,
        token0Contract,
        token0,
        token1
      );

      if (!isProfitable) {
        console.log(`No Arbitrage Currently Available\n`);
        console.log(`-----------------------------------------\n`);
        isExecuting = false;
        return;
      }

      const receipt = await executeTrade(
        routerPath,
        token0Contract,
        token1Contract
      );

      isExecuting = false;
    }
  });

  pPair.on("Swap", async () => {
    if (!isExecuting) {
      isExecuting = true;

      const priceDifference = await checkPrice("Pangolin", token0, token1);
      const routerPath = await determineDirection(priceDifference);

      if (!routerPath) {
        console.log(`No Arbitrage Currently Available\n`);
        console.log(`-----------------------------------------\n`);
        isExecuting = false;
        return;
      }

      const isProfitable = await determineProfitability(
        routerPath,
        token0Contract,
        token0,
        token1
      );

      if (!isProfitable) {
        console.log(`No Arbitrage Currently Available\n`);
        console.log(`-----------------------------------------\n`);
        isExecuting = false;
        return;
      }

      const receipt = await executeTrade(
        routerPath,
        token0Contract,
        token1Contract
      );

      isExecuting = false;
    }
  });

  console.log("Waiting for swap event...");
};

const checkPrice = async (exchange, token0, token1) => {
  isExecuting = true;

  console.log(`Swap Initiated on ${exchange}, Checking Price...\n`);

  const currentBlock = await provider.getBlockNumber();

  const tjPrice = await calculatePrice(tjPair);
  const pPrice = await calculatePrice(pPair);

  const tjFPrice = Number(tjPrice).toFixed(units);
  const pFPrice = Number(pPrice).toFixed(units);
  const priceDifference = (((tjFPrice - pFPrice) / pFPrice) * 100).toFixed(2);

  console.log(`Current Block: ${currentBlock}`);
  console.log(`-----------------------------------------`);
  console.log(
    `TRADER JOE V2 | ${token1.symbol}/${token0.symbol}\t | ${tjFPrice}`
  );
  console.log(
    `PANGOLIN V2   | ${token1.symbol}/${token0.symbol}\t | ${pFPrice}\n`
  );
  console.log(`Percentage Difference: ${priceDifference}%\n`);

  return priceDifference;
};

const determineDirection = async (priceDifference) => {
  console.log(`Determining Direction...\n`);

  if (priceDifference >= difference) {
    console.log(`Potential Arbitrage Direction:\n`);
    console.log(`Buy\t -->\t Trader Joe V2`);
    console.log(`Sell\t -->\t Pangolin\n`);
    return [tjRouter, pRouter];
  } else if (priceDifference <= -difference) {
    console.log(`Potential Arbitrage Direction:\n`);
    console.log(`Buy\t -->\t Pangolin`);
    console.log(`Sell\t -->\t Trader Joe V2\n`);
    return [pRouter, tjRouter];
  } else {
    return null;
  }
};

const determineProfitability = async (
  _routerPath,
  _token0Contract,
  _token0,
  _token1
) => {
  console.log(`Determining Profitability...\n`);

  let reserves, exchangeToBuy, exchangeToSell;

  if (_routerPath[0].address == tjRouter.address) {
    reserves = await getReserves(pPair);
    exchangeToBuy = "Trader Joe V2";
    exchangeToSell = "Pangolin";
  } else {
    reserves = await getReserves(tjPair);
    exchangeToBuy = "Pangolin";
    exchangeToSell = "Trader Joe V2";
  }

  console.log(`Reserves on ${exchangeToSell}`);
  console.log(
    `USDC: ${Number(
      ethers.utils.formatUnits(reserves[0].toString(), "mwei") // USDC has 6 decimals
    ).toFixed(0)}`
  );
  console.log(
    `WAVAX: ${ethers.utils.formatUnits(reserves[1].toString(), "ether")}\n`
  );

  try {
    let result = await _routerPath[0].getAmountsIn(reserves[0], [
      _token0.address,
      _token1.address,
    ]);

    const token0In = result[0]; // WAVAX
    const token1In = result[1]; // USDC

    result = await _routerPath[1].getAmountsOut(token1In, [
      _token1.address,
      _token0.address,
    ]);

    console.log(
      `Estimated amount of WAVAX needed to buy enough USDC on ${exchangeToBuy}\t\t| ${ethers.utils.formatUnits(
        token0In,
        "ether"
      )}`
    );
    console.log(
      `Estimated amount of WAVAX returned after swapping USDC on ${exchangeToSell}\t| ${ethers.utils.formatUnits(
        result[1],
        "ether"
      )}\n`
    );

    const { amountIn, amountOut } = await simulate(
      token0In,
      _routerPath,
      _token0,
      _token1
    );

    if (amountOut < amountIn) {
      return false;
    }

    amount = token0In;
    return true;
  } catch (error) {
    console.log(error);
    console.log(
      `\nError occurred while trying to determine profitability...\n`
    );
    console.log(
      `This can typically happen because of liquidity issues, see README for more information.\n`
    );
    return false;
  }
};

const executeTrade = async (_routerPath, _token0Contract, _token1Contract) => {
  console.log(`Attempting Arbitrage...\n`);

  let startOnTraderJoe;

  if (_routerPath[0].address == tjRouter.address) {
    startOnTraderJoe = true;
  } else {
    startOnTraderJoe = false;
  }

  const account = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const tokenBalanceBefore = await _token0Contract.balanceOf(account.address);
  const avaxBalanceBefore = await account.getBalance();

  if (config.PROJECT_SETTINGS.isDeployed) {
    const transaction = await arbitrage
      .connect(account)
      .executeTrade(
        startOnTraderJoe,
        _token0Contract.address,
        _token1Contract.address,
        amount
      );
    const receipt = await transaction.wait();
  }

  console.log(`Trade Complete:\n`);

  const tokenBalanceAfter = await _token0Contract.balanceOf(account.address);
  const avaxBalanceAfter = await account.getBalance();

  const tokenBalanceDifference = tokenBalanceAfter - tokenBalanceBefore;
  const avaxBalanceDifference = avaxBalanceBefore - avaxBalanceAfter;

  const data = {
    "AVAX Balance Before": ethers.utils.formatUnits(avaxBalanceBefore, "ether"),
    "AVAX Balance After": ethers.utils.formatUnits(avaxBalanceAfter, "ether"),
    "AVAX Spent (gas)": ethers.utils.formatUnits(
      avaxBalanceDifference.toString(),
      "ether"
    ),
    "-": {},
    "WAVAX Balance BEFORE": ethers.utils.formatUnits(
      tokenBalanceBefore,
      "ether"
    ),
    "WAVAX Balance AFTER": ethers.utils.formatUnits(tokenBalanceAfter, "ether"),
    "WAVAX Gained/Lost": ethers.utils.formatUnits(
      tokenBalanceDifference.toString(),
      "ether"
    ),
    "-": {},
    "Total Gained/Lost": `${ethers.utils.formatUnits(
      (tokenBalanceDifference - avaxBalanceDifference).toString(),
      "ether"
    )} AVAX`,
  };

  console.table(data);
};

main();
