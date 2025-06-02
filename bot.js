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

  // Add periodic heartbeat to show the bot is alive
  setInterval(() => {
    const now = new Date().toLocaleTimeString();
    console.log(`[${now}] Bot active - monitoring for swaps...`);
  }, 60000); // Every 60 seconds

  tjPair.on("Swap", async () => {
    console.log("🔥 TRADER JOE SWAP DETECTED!"); // Debug log
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
    console.log("🟢 PANGOLIN SWAP DETECTED!"); // Debug log
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
    // Trader Joe is MORE expensive than Pangolin
    // So: Buy cheap (Pangolin), Sell expensive (Trader Joe)
    console.log(`Potential Arbitrage Direction:\n`);
    console.log(`Buy\t -->\t Pangolin`); // ✅ Buy cheap
    console.log(`Sell\t -->\t Trader Joe V2\n`); // ✅ Sell expensive
    return [pRouter, tjRouter]; // ✅ FIXED: Pangolin first, then Trader Joe
  } else if (priceDifference <= -difference) {
    // Pangolin is MORE expensive than Trader Joe
    // So: Buy cheap (Trader Joe), Sell expensive (Pangolin)
    console.log(`Potential Arbitrage Direction:\n`);
    console.log(`Buy\t -->\t Trader Joe V2`); // ✅ Buy cheap
    console.log(`Sell\t -->\t Pangolin\n`); // ✅ Sell expensive
    return [tjRouter, pRouter]; // ✅ FIXED: Trader Joe first, then Pangolin
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
    // Get actual price difference from the swap event
    const tjPrice = await calculatePrice(tjPair);
    const pPrice = await calculatePrice(pPair);
    const actualPriceDiff =
      (Math.abs(Number(tjPrice) - Number(pPrice)) / Number(pPrice)) * 100;

    console.log(`Actual price difference: ${actualPriceDiff.toFixed(3)}%`);

    // Dynamic trade sizing based on available liquidity and price difference
    let targetUSDC;
    const sellExchangeUSDC = Number(
      ethers.utils.formatUnits(reserves[0].toString(), "mwei")
    );

    // Use smaller sizes for better execution and lower slippage
    if (actualPriceDiff >= 1.0) {
      targetUSDC = Math.min(1000, sellExchangeUSDC * 0.02); // Max 2% of pool
    } else if (actualPriceDiff >= 0.75) {
      targetUSDC = Math.min(600, sellExchangeUSDC * 0.015); // Max 1.5% of pool
    } else if (actualPriceDiff >= 0.5) {
      targetUSDC = Math.min(300, sellExchangeUSDC * 0.01); // Max 1% of pool
    } else if (actualPriceDiff >= 0.3) {
      targetUSDC = Math.min(150, sellExchangeUSDC * 0.005); // Max 0.5% of pool
    } else {
      return false; // Don't trade if < 0.30%
    }

    // Additional constraint: never trade more than 2% of the smaller pool
    const minPoolUSDC = Math.min(
      Number(ethers.utils.formatUnits(reserves[0].toString(), "mwei")),
      sellExchangeUSDC
    );
    targetUSDC = Math.min(targetUSDC, minPoolUSDC * 0.02);

    console.log(
      `Dynamic target amount: ${targetUSDC.toFixed(2)} USDC (${(
        (targetUSDC / sellExchangeUSDC) *
        100
      ).toFixed(3)}% of pool)`
    );

    const targetAmount = ethers.utils.parseUnits(targetUSDC.toString(), "mwei");

    let result = await _routerPath[0].getAmountsIn(targetAmount, [
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
      `Target amount (dynamic): ${ethers.utils.formatUnits(
        targetAmount,
        "mwei"
      )} USDC`
    );
    console.log(
      `Estimated amount of WAVAX needed to buy target USDC on ${exchangeToBuy}\t\t| ${ethers.utils.formatUnits(
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

    console.log(
      `Profit simulation: Input ${amountIn} WAVAX, Output ${amountOut} WAVAX`
    );
    console.log(`Net result: ${(amountOut - amountIn).toFixed(6)} WAVAX\n`);

    // Account for gas costs (estimate ~0.003 WAVAX per transaction)
    const estimatedGasCost = 0.006; // 2 transactions * 0.003 WAVAX each
    const netProfitAfterGas = amountOut - amountIn - estimatedGasCost;

    console.log(`Estimated gas cost: ${estimatedGasCost} WAVAX`);
    console.log(`Net profit after gas: ${netProfitAfterGas.toFixed(6)} WAVAX`);

    if (netProfitAfterGas <= 0) {
      console.log(
        `❌ Not profitable: Loss/break-even of ${Math.abs(
          netProfitAfterGas
        ).toFixed(6)} WAVAX after gas`
      );
      return false;
    }

    console.log(
      `✅ Profitable: Profit of ${netProfitAfterGas.toFixed(6)} WAVAX after gas`
    );
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
