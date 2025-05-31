// -- HANDLE INITIAL SETUP -- //
require("./helpers/server");
require("dotenv").config();

const ethers = require("ethers");
const config = require("./config.json");
const {
  getTokenAndContract,
  getPairContract,
  getLBPairContract,
  getReserves,
  getLBPrice,
  calculatePrice,
  simulate,
  simulateLB,
} = require("./helpers/helpers");
const {
  provider,
  tjFactory,
  tjRouter,
  tjLBFactory,
  tjLBRouter,
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

let tjLBPair, pPair, amount;
let isExecuting = false;

const main = async () => {
  const { token0Contract, token1Contract, token0, token1 } =
    await getTokenAndContract(arbFor, arbAgainst, provider);

  // Get Trader Joe V2.2 LB Pair (Liquidity Book)
  tjLBPair = await getLBPairContract(
    tjLBFactory,
    token0.address,
    token1.address,
    provider
  );

  // Get Pangolin V2 Pair (Traditional AMM)
  pPair = await getPairContract(
    pFactory,
    token0.address,
    token1.address,
    provider
  );

  console.log(`Trader Joe LB Pair Address: ${tjLBPair.address}`);
  console.log(`Pangolin Pair Address: ${pPair.address}\n`);

  // Monitor Trader Joe LB events
  tjLBPair.on("Swap", async () => {
    if (!isExecuting) {
      isExecuting = true;

      const priceDifference = await checkPrice("Trader Joe LB", token0, token1);
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

  // Monitor Pangolin V2 events
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

  // Get Trader Joe LB price
  const tjPrice = await getLBPrice(tjLBPair);
  // Get Pangolin V2 price
  const pPrice = await calculatePrice(pPair);

  const tjFPrice = Number(tjPrice).toFixed(units);
  const pFPrice = Number(pPrice).toFixed(units);
  const priceDifference = (((tjFPrice - pFPrice) / pFPrice) * 100).toFixed(2);

  console.log(`Current Block: ${currentBlock}`);
  console.log(`-----------------------------------------`);
  console.log(
    `TRADER JOE LB | ${token1.symbol}/${token0.symbol}\t | ${tjFPrice}`
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
    console.log(`Buy\t -->\t Trader Joe LB`);
    console.log(`Sell\t -->\t Pangolin\n`);
    return [tjLBRouter, pRouter, "TJ_TO_P"];
  } else if (priceDifference <= -difference) {
    console.log(`Potential Arbitrage Direction:\n`);
    console.log(`Buy\t -->\t Pangolin`);
    console.log(`Sell\t -->\t Trader Joe LB\n`);
    return [pRouter, tjLBRouter, "P_TO_TJ"];
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
  const direction = _routerPath[2];

  if (direction === "TJ_TO_P") {
    reserves = await getReserves(pPair);
    exchangeToBuy = "Trader Joe LB";
    exchangeToSell = "Pangolin";
  } else {
    reserves = await getReserves(pPair); // We still use Pangolin reserves as reference
    exchangeToBuy = "Pangolin";
    exchangeToSell = "Trader Joe LB";
  }

  console.log(`Reserves on Pangolin (reference)`);
  console.log(
    `USDC: ${Number(
      ethers.utils.formatUnits(reserves[0].toString(), "mwei") // USDC has 6 decimals
    ).toFixed(0)}`
  );
  console.log(
    `WAVAX: ${ethers.utils.formatUnits(reserves[1].toString(), "ether")}\n`
  );

  try {
    let result;
    let token0In, token1In;

    if (direction === "TJ_TO_P") {
      // Use LB simulation for first trade, V2 for second
      const { amountIn, amountOut } = await simulateLB(
        reserves[0], // Use USDC amount from Pangolin
        _routerPath,
        _token0,
        _token1,
        direction
      );

      token0In = amountIn;

      console.log(
        `Estimated amount of WAVAX needed to buy USDC on ${exchangeToBuy}\t\t| ${ethers.utils.formatUnits(
          token0In,
          "ether"
        )}`
      );
      console.log(
        `Estimated amount of WAVAX returned after swapping USDC on ${exchangeToSell}\t| ${ethers.utils.formatUnits(
          amountOut,
          "ether"
        )}\n`
      );

      amount = token0In;

      if (amountOut <= amountIn) {
        return false;
      }

      return true;
    } else {
      // Use V2 simulation for first trade, LB for second
      const { amountIn, amountOut } = await simulateLB(
        reserves[0], // Use USDC amount from Pangolin
        _routerPath,
        _token0,
        _token1,
        direction
      );

      token0In = amountIn;

      console.log(
        `Estimated amount of WAVAX needed to buy USDC on ${exchangeToBuy}\t\t| ${ethers.utils.formatUnits(
          token0In,
          "ether"
        )}`
      );
      console.log(
        `Estimated amount of WAVAX returned after swapping USDC on ${exchangeToSell}\t| ${ethers.utils.formatUnits(
          amountOut,
          "ether"
        )}\n`
      );

      amount = token0In;

      if (amountOut <= amountIn) {
        return false;
      }

      return true;
    }
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

  const direction = _routerPath[2];
  let startOnTraderJoe;

  if (direction === "TJ_TO_P") {
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
