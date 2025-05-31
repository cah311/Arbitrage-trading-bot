// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");

const config = require("../config.json");

async function main() {
  console.log("Deploying with addresses:");
  console.log("Trader Joe Router:", config.TRADER_JOE.V2_ROUTER_02_ADDRESS);
  console.log("Pangolin Router:", config.PANGOLIN.V2_ROUTER_02_ADDRESS);
  console.log("Aave Pool:", config.AAVE_V3.POOL_ADDRESS);

  const poolAddress = config.AAVE_V3.POOL_ADDRESS;

  const Arbitrage = await hre.ethers.getContractFactory("Arbitrage");
  const arbitrage = await Arbitrage.deploy(
    config.TRADER_JOE.V2_ROUTER_02_ADDRESS,
    config.TRADER_JOE.FACTORY_ADDRESS,
    config.PANGOLIN.V2_ROUTER_02_ADDRESS,
    config.AAVE_V3.POOL_ADDRESS
  );

  await arbitrage.deployed();

  console.log(`Arbitrage contract deployed to ${arbitrage.address}`);
  console.log(
    `Update ARBITRAGE_ADDRESS in config.json to: ${arbitrage.address}`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
