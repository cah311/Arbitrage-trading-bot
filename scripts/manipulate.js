const hre = require("hardhat");
require("dotenv").config();

// -- IMPORT HELPER FUNCTIONS & CONFIG -- //
const {
  getTokenAndContract,
  getPairContract,
  calculatePrice,
} = require("../helpers/helpers");
const {
  provider,
  tjFactory,
  tjRouter,
  pFactory,
  pRouter,
} = require("../helpers/initialization.js");

// -- CONFIGURE VALUES HERE -- //
const V2_FACTORY_TO_USE = tjFactory;
const V2_ROUTER_TO_USE = tjRouter;

// Use your actual account instead of impersonating
const AMOUNT = "0.1"; // Much smaller amount for testing

async function main() {
  // Get signer from your private key
  const signer = new hre.ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log(`Using account: ${signer.address}`);

  // Check AVAX balance
  const balance = await provider.getBalance(signer.address);
  console.log(`AVAX Balance: ${hre.ethers.utils.formatEther(balance)} AVAX`);

  // Fetch contracts
  const {
    token0Contract,
    token1Contract,
    token0: ARB_AGAINST,
    token1: ARB_FOR,
  } = await getTokenAndContract(
    process.env.ARB_AGAINST,
    process.env.ARB_FOR,
    provider
  );

  const pair = await getPairContract(
    V2_FACTORY_TO_USE,
    ARB_AGAINST.address,
    ARB_FOR.address,
    provider
  );

  // Fetch price of SHIB/WETH before we execute the swap
  const priceBefore = await calculatePrice(pair);

  await manipulatePrice([ARB_AGAINST, ARB_FOR], token0Contract);

  // Fetch price of SHIB/WETH after the swap
  const priceAfter = await calculatePrice(pair);

  const data = {
    "Price Before": `1 WAVAX = ${Number(priceBefore).toFixed(4)} USDT`,
    "Price After": `1 WAVAX = ${Number(priceAfter).toFixed(4)} USDT`,
  };

  console.table(data);
}

async function manipulatePrice(_path, _token0Contract) {
  console.log(`\nBeginning Swap...\n`);

  console.log(`Input Token: ${_path[0].symbol}`);
  console.log(`Output Token: ${_path[1].symbol}\n`);

  const amount = hre.ethers.utils.parseUnits(AMOUNT, "ether");
  const path = [_path[0].address, _path[1].address];
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes

  await _token0Contract
    .connect(signer)
    .approve(V2_ROUTER_TO_USE.address, amount);
  await V2_ROUTER_TO_USE.connect(signer).swapExactTokensForTokens(
    amount,
    0,
    path,
    signer.address,
    deadline
  );

  console.log(`Swap Complete!\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
