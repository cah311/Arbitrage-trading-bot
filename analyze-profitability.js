// Analysis script to understand arbitrage profitability issues
require("dotenv").config();
const ethers = require("ethers");
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
} = require("./helpers/initialization");

async function analyzeProfitability() {
  console.log("🔍 ARBITRAGE PROFITABILITY ANALYSIS");
  console.log("=====================================\n");

  const { token0Contract, token1Contract, token0, token1 } =
    await getTokenAndContract(
      process.env.ARB_FOR,
      process.env.ARB_AGAINST,
      provider
    );

  const tjPair = await getPairContract(
    tjFactory,
    token0.address,
    token1.address,
    provider
  );
  const pPair = await getPairContract(
    pFactory,
    token0.address,
    token1.address,
    provider
  );

  // Get current prices and reserves
  const tjPrice = await calculatePrice(tjPair);
  const pPrice = await calculatePrice(pPair);
  const tjReserves = await getReserves(tjPair);
  const pReserves = await getReserves(pPair);

  const priceDiff =
    (Math.abs(Number(tjPrice) - Number(pPrice)) / Number(pPrice)) * 100;

  console.log("📊 CURRENT MARKET STATE");
  console.log("------------------------");
  console.log(`Trader Joe Price: ${Number(tjPrice).toFixed(4)} USDC/WAVAX`);
  console.log(`Pangolin Price:   ${Number(pPrice).toFixed(4)} USDC/WAVAX`);
  console.log(`Price Difference: ${priceDiff.toFixed(3)}%\n`);

  console.log("💰 LIQUIDITY ANALYSIS");
  console.log("----------------------");
  const tjUSDC = Number(ethers.utils.formatUnits(tjReserves[0], "mwei"));
  const tjWAVAX = Number(ethers.utils.formatUnits(tjReserves[1], "ether"));
  const pUSDC = Number(ethers.utils.formatUnits(pReserves[0], "mwei"));
  const pWAVAX = Number(ethers.utils.formatUnits(pReserves[1], "ether"));

  console.log(
    `Trader Joe:  ${tjUSDC.toFixed(0)} USDC | ${tjWAVAX.toFixed(2)} WAVAX`
  );
  console.log(
    `Pangolin:    ${pUSDC.toFixed(0)} USDC | ${pWAVAX.toFixed(2)} WAVAX`
  );
  console.log(
    `Liquidity Ratio: ${(tjUSDC / pUSDC).toFixed(2)}:1 (TJ:Pangolin)\n`
  );

  // Determine direction
  let buyExchange, sellExchange, buyRouter, sellRouter;
  if (Number(tjPrice) > Number(pPrice)) {
    buyExchange = "Pangolin";
    sellExchange = "Trader Joe";
    buyRouter = pRouter;
    sellRouter = tjRouter;
  } else {
    buyExchange = "Trader Joe";
    sellExchange = "Pangolin";
    buyRouter = tjRouter;
    sellRouter = pRouter;
  }

  console.log("🎯 ARBITRAGE DIRECTION");
  console.log("----------------------");
  console.log(`Buy on:  ${buyExchange} (cheaper)`);
  console.log(`Sell on: ${sellExchange} (more expensive)\n`);

  // Test different trade sizes
  console.log("💡 TRADE SIZE ANALYSIS");
  console.log("----------------------");

  const testSizes = [50, 100, 200, 300, 500]; // USDC amounts

  for (const testSize of testSizes) {
    try {
      const targetAmount = ethers.utils.parseUnits(testSize.toString(), "mwei");

      // Calculate required WAVAX to buy testSize USDC
      const result1 = await buyRouter.getAmountsIn(targetAmount, [
        token0.address,
        token1.address,
      ]);

      // Calculate WAVAX received from selling testSize USDC
      const result2 = await sellRouter.getAmountsOut(result1[1], [
        token1.address,
        token0.address,
      ]);

      const wavaxIn = Number(ethers.utils.formatUnits(result1[0], "ether"));
      const wavaxOut = Number(ethers.utils.formatUnits(result2[1], "ether"));
      const netProfit = wavaxOut - wavaxIn;
      const gasCost = 0.006; // Estimated gas in WAVAX
      const finalProfit = netProfit - gasCost;

      const poolImpact = (testSize / Math.min(tjUSDC, pUSDC)) * 100;

      console.log(`${testSize} USDC trade:`);
      console.log(
        `  WAVAX In: ${wavaxIn.toFixed(6)} | WAVAX Out: ${wavaxOut.toFixed(6)}`
      );
      console.log(`  Gross Profit: ${netProfit.toFixed(6)} WAVAX`);
      console.log(`  Net Profit: ${finalProfit.toFixed(6)} WAVAX (after gas)`);
      console.log(`  Pool Impact: ${poolImpact.toFixed(3)}%`);
      console.log(
        `  Status: ${finalProfit > 0 ? "✅ Profitable" : "❌ Not Profitable"}\n`
      );
    } catch (error) {
      console.log(
        `${testSize} USDC trade: ❌ Failed (insufficient liquidity)\n`
      );
    }
  }

  // Calculate minimum profitable spread
  console.log("🎯 MINIMUM PROFITABLE SPREAD");
  console.log("-----------------------------");

  // Estimate fees: 0.3% per trade = 0.6% total + gas costs
  const tradingFees = 0.006; // 0.6%
  const gasUSD = 0.006 * Number(tjPrice); // Gas cost in USD equivalent
  const minSpreadNeeded = tradingFees + gasUSD / 100; // Add gas as percentage

  console.log(`Trading Fees: ${(tradingFees * 100).toFixed(2)}%`);
  console.log(
    `Gas Cost: ~$${gasUSD.toFixed(3)} (~${((gasUSD / 100) * 100).toFixed(3)}%)`
  );
  console.log(`Minimum Spread Needed: ${(minSpreadNeeded * 100).toFixed(2)}%`);
  console.log(`Current Spread: ${priceDiff.toFixed(3)}%`);
  console.log(
    `Profitable: ${priceDiff > minSpreadNeeded * 100 ? "✅ Yes" : "❌ No"}\n`
  );

  console.log("💡 RECOMMENDATIONS");
  console.log("------------------");
  if (priceDiff < minSpreadNeeded * 100) {
    console.log("❌ Current spread too small to overcome fees");
    console.log(
      `   Need at least ${(minSpreadNeeded * 100).toFixed(2)}% spread`
    );
  } else {
    console.log("✅ Spread sufficient, but trade size needs optimization");
    console.log("   Consider reducing trade size to minimize slippage");
  }

  if (Math.min(tjUSDC, pUSDC) < 10000) {
    console.log("⚠️  Low liquidity detected - use smaller trade sizes");
  }

  console.log(
    `   Recommended max trade: ${Math.min(
      Math.min(tjUSDC, pUSDC) * 0.01,
      200
    ).toFixed(0)} USDC`
  );
}

analyzeProfitability()
  .then(() => {
    console.log("\n🎉 Analysis complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Analysis failed:", error);
    process.exit(1);
  });
