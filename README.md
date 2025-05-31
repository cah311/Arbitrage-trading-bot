# Trading Bot Demo

## Technology Stack & Tools

- Solidity (Writing Smart Contract)
- Javascript (React & Testing)
- [Hardhat](https://hardhat.org/) (Development Framework)
- [Ethers.js](https://docs.ethers.io/v5/) (Blockchain Interaction)
- [Alchemy](https://www.alchemy.com/) (Blockchain Connection)

## Requirements For Initial Setup

- Install [NodeJS](https://nodejs.org/en/). We recommend using the latest LTS (Long-Term-Support) version, and preferably installing NodeJS via [NVM](https://github.com/nvm-sh/nvm#intro).
- Create an [Alchemy](https://www.alchemy.com/) account, you'll need to create an app for the Ethereum chain, on the mainnet network

## Setting Up

### 1. Clone/Download the Repository

### 2. Install Dependencies:

`npm install`

### 3. Create and Setup .env

Before running any scripts, you'll want to create a .env file with the following values (see .env.example):

- **ALCHEMY_API_KEY=""**
- **ARB_FOR="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"** (By default we are using WETH)
- **ARB_AGAINST="0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE"** (By default we are using SHIB)
- **PRIVATE_KEY=""** (Private key of the account to recieve profit/execute arbitrage contract)
- **PRICE_DIFFERENCE=0.50** (Difference in price between Uniswap & Sushiswap, default is 0.50%)
- **UNITS=0** (Only used for price reporting)
- **GAS_LIMIT=600000** (Currently a hardcoded value, may need to adjust during testing)
- **GAS_PRICE=0.00000006** (60 Gwei, Currently a hardcoded value, may need to adjust during testing)

### 4. Start Hardhat Node:

In your terminal run:
`npx hardhat node`

Once you've started the hardhat node, copy the private key of the first account as you'll need to paste it in your .env file in the next step.

_As a reminder, do **NOT** use or fund the accounts/keys provided by the hardhat node in a real production setting, they are to be only used in your local testing!_

### 5. Add Private Key to .env

Copy the private key of the first account provided from the hardhat node, and paste in the value for the **PRIVATE_KEY** variable in your .env file

### 6. Deploy Smart Contract

In a separate terminal run:
`npx hardhat run scripts/deploy.js --network localhost`

Sometimes the deployed address may be different when testing, and therefore you'll need to update the **ARBITRAGE_ADDRESS** inside of the _config.json_

### 7. Start the Bot

`node bot.js`

### 8. Manipulate Price

In another terminal run:
`npx hardhat run scripts/manipulate.js --network localhost`

## About config.json

Inside the _config.json_ file, under the PROJECT_SETTINGS object, there are 2 keys that hold a boolean value:

- isLocal
- isDeployed

Both options depend on how you wish to test the bot. By default both values are set to true. If you set isLocal to false, and then run the bot this
will allow the bot to monitor swap events on the actual mainnet, instead of locally.

isDeployed's value can be set on whether you wish for the abritrage contract to be called if a potential trade is found. By default isDeployed is
set to true for local testing. Ideally this is helpful if you want to monitor swaps on mainnet and you don't have a contract deployed.
This will allow you to still experiment with finding potential abitrage opportunites.

## Testing Bot on Mainnet

For monitoring prices and detecting potential arbitrage opportunities, you do not need to deploy the contract.

### 1. Edit config.json

Inside the _config.json_ file, set **isDeployed** to **false** and **isLocal** to **false**.

### 2. Create and Setup .env

See step #4 in **Setting Up**

### 3. Run the bot

`node bot.js`

Keep in mind you'll need to wait for an actual swap event to be triggered before it checks the price.

## Anatomy of bot.js

The bot is essentially composed of 5 functions.

- _main()_
- _checkPrice()_
- _determineDirection()_
- _determineProfitability()_
- _executeTrade()_

The _main()_ function monitors swap events from both Uniswap & Sushiswap.

When a swap event occurs, it calls _checkPrice()_, this function will log the current price of the assets on both Uniswap & Sushiswap, and return the **priceDifference**

Then _determineDirection()_ is called, this will determine where we would need to buy first, then sell. This function will return an array called **routerPath** in _main()_. The array contains Uniswap & Sushiswap's router contracts. If no array is returned, this means the **priceDifference** returned earlier is not higher than **difference**

If **routerPath** is not null, then we move into _determineProfitability()_. This is where we set our conditions on whether there is a potential arbitrage or not. This function returns either true or false.

If true is returned from _determineProfitability()_, then we call _executeTrade()_ where we make our call to our arbitrage contract to perform the trade. Afterwards a report is logged, and the bot resumes to monitoring for swap events.

### Modifying & Testing the Scripts

Both the _manipulate.js_ and _bot.js_ has been setup to easily make some modifications easy. Before the main() function in _manipulate.js_, there will be a comment: **// -- CONFIGURE VALUES HERE -- //**. Below that will be some constants you'll be able to modify such as the unlocked account, and the amount of tokens you'll want that account to spent in order to manipulate price (You'll need to adjust this if you are looking to test different pairs).

For _bot.js_, you'd want to take a look at the function near line 132 called _determineProfitability()_. Inside this function we can set our conditions and do our calculations to determine whether we may have a potential profitable trade on our hands. This function is to return **true** if a profitable trade is possible, and **false** if not.

Note if you are doing an arbitrage for a different ERC20 token than the one in the provided example (WETH), then you may also need to adjust profitability reporting in the _executeTrade()_ function.

Keep in mind, after running the scripts, specifically _manipulate.js_, you may need to restart your hardhat node, and re-deploy contracts to properly retest.

### Additional Information

The _bot.js_ script uses helper functions for fetching token pair addresses, calculating price of assets, and calculating estimated returns. These functions can be found in the _helper.js_ file inside of the helper folder.

The helper folder also has _server.js_ which is responsible for spinning up a local server, and _initialization.js_ which is responsible for setting up our blockchain connection, configuring Uniswap/Sushiswap contracts, etc.

As you customize parts of the script it's best to refer to [Uniswap documentation](https://docs.uniswap.org/contracts/v2/concepts/protocol-overview/how-uniswap-works) for a more detail rundown on the protocol and interacting with the V2 exchange.

### Strategy Overview and Potential Errors

The current strategy implemented is only shown as an example alongside with the _manipulate.js_ script. Essentially, after we manipulate price on Uniswap, we look at the reserves on Sushiswap and determine how much SHIB we need to buy on Uniswap to 'clear' out reserves on Sushiswap. Therefore the arbitrage direction is Uniswap -> Sushiswap.

This works because Sushiswap has lower reserves than Uniswap. However, if the arbitrage direction was swapped: Sushiswap -> Uniswap, this will sometimes error out if monitoring swaps on mainnet.

This error occurs in the _determineProfitability()_ function inside of _bot.js_. Currently a try/catch is implemented, so if it errors out, the bot will just resume monitoring price. Other solutions to this may be to implement a different strategy, use different ERC20 tokens, or reversing the order.

## Using other EVM chains

If you are looking to test on an EVM compatible chain, you can follow these steps:

### 1. Update .env

- **ARB_FOR=""**
- **ARB_AGAINST=""**

Token addresses will be different on different chains, you'll want to reference blockchain explorers such as [Polyscan](https://polygonscan.com/) for Polygon for token addresses you want to test.

### 2. Update config.json

- **V2_ROUTER_02_ADDRESS=""**
- **FACTORY_ADDRESS=""**

You'll want to update the router and factory addresses inside of the _config.json_ file with the V2 exchanges you want to use. Based on the exchange you want to use, refer to the documentation for it's address.

### 3. Change RPC URL

Inside of _initialization.js_, you'll want to update the websocket RPC URL. Example of Polygon:

```
provider = new hre.ethers.providers.WebSocketProvider(`wss://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`)
```

Inside of _hardhat.config.js_, you'll want to update the forking URL. Example of Polygon:

```
url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
```

### 4. Changing Arbitrage.sol

You may also need to change the flashloan provider used in the contract to one that is available on your chain of choice.

### Additional Notes

- If testing out the _manipulate.js_ script, you'll also want to update the **UNLOCKED_ACCOUNT** variable and adjust **AMOUNT** as needed.

# Eth Deployed Contract

0xC5F7Db504f00178Ede4f48d81654F0C25074ecDC

## Avalanche Deployment Guide

### Prerequisites for Avalanche

- AVAX for gas fees
- WAVAX tokens for arbitrage
- USDT.e or USDC.e tokens for trading pairs

### Environment Variables for Avalanche

```bash
ARB_FOR="0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7"  # WAVAX
ARB_AGAINST="0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7"  # USDT.e
ALCHEMY_API_KEY="your_avalanche_api_key"
PRIVATE_KEY="your_private_key"
PRICE_DIFFERENCE=0.25
GAS_LIMIT=300000
GAS_PRICE=0.000000025
```

### Deployment Commands

```bash
# Deploy to Avalanche mainnet
npx hardhat run scripts/deploy.js --network avalanche

# Test price manipulation
npx hardhat run scripts/manipulate.js --network avalanche

# Run the bot
node bot.js
```

### Key Differences from Ethereum

- **Lower gas costs**: Can target smaller arbitrage opportunities
- **Faster finality**: 2-second block times vs 12-15 seconds
- **Different DEXs**: Trader Joe and Pangolin instead of Uniswap/Sushiswap
- **Flash loans**: Aave V3 instead of DyDx
- **Token pairs**: WAVAX/USDT.e instead of WETH/SHIB
