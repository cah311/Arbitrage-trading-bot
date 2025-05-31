// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Trader Joe V2.2 Liquidity Book interfaces
interface ILBRouter {
    struct Path {
        uint256[] pairBinSteps;
        IERC20[] tokenPath;
    }
    
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Path memory path,
        address to,
        uint256 deadline
    ) external returns (uint256 amountOut);
    
    function getSwapOut(
        address pair,
        uint128 amountIn,
        bool swapForY
    ) external view returns (uint128 amountInLeft, uint128 amountOut, uint128 fee);
}

interface ILBFactory {
    function getLBPairInformation(
        IERC20 tokenA,
        IERC20 tokenB,
        uint256 binStep
    ) external view returns (
        address lbPair,
        bool createdByOwner,
        bool ignoredForRouting
    );
}

// Aave V3 interfaces
interface IPool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

interface IFlashLoanSimpleReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

contract Arbitrage is IFlashLoanSimpleReceiver {
    ILBRouter public immutable lbRouter;      // Trader Joe LB Router
    IUniswapV2Router02 public immutable pRouter;  // Pangolin Router (still V2)
    ILBFactory public immutable lbFactory;    // Trader Joe LB Factory
    IPool public immutable POOL;

    address public owner;
    uint256 public constant DEFAULT_BIN_STEP = 25; // 0.25% bin step

    constructor(
        address _lbRouter,
        address _lbFactory, 
        address _pRouter,
        address _poolAddress
    ) {
        lbRouter = ILBRouter(_lbRouter);
        lbFactory = ILBFactory(_lbFactory);
        pRouter = IUniswapV2Router02(_pRouter);
        POOL = IPool(_poolAddress);
        owner = msg.sender;
    }

    function executeTrade(
        bool _startOnTraderJoe,
        address _token0,
        address _token1,
        uint256 _flashAmount
    ) external {
        bytes memory data = abi.encode(
            _startOnTraderJoe,
            _token0,
            _token1,
            _flashAmount
        );

        POOL.flashLoanSimple(
            address(this),
            _token0,
            _flashAmount,
            data,
            0
        );
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == address(POOL), "FlashLoan: could be called by Aave pool only");
        
        (
            bool startOnTraderJoe,
            address token0,
            address token1,
            uint256 flashAmount
        ) = abi.decode(params, (bool, address, address, uint256));

        if (startOnTraderJoe) {
            // Swap on Trader Joe LB first
            _swapOnTraderJoe(token0, token1, flashAmount, 0);

            // Then swap back on Pangolin
        address[] memory path = new address[](2);
            path[0] = token1;
            path[1] = token0;

            _swapOnPangolin(
                path,
                IERC20(token1).balanceOf(address(this)),
                flashAmount + premium
            );
        } else {
            // Swap on Pangolin first
            address[] memory path = new address[](2);
            path[0] = token0;
            path[1] = token1;
            
            _swapOnPangolin(path, flashAmount, 0);

            // Then swap back on Trader Joe LB
            _swapOnTraderJoe(
                token1,
                token0, 
                IERC20(token1).balanceOf(address(this)),
                flashAmount + premium
            );
        }

        // Approve the pool to pull the funds
        uint256 amountToRepay = flashAmount + premium;
        IERC20(asset).approve(address(POOL), amountToRepay);

        // Transfer profit to owner
        uint256 profit = IERC20(asset).balanceOf(address(this)) - amountToRepay;
        if (profit > 0) {
            IERC20(asset).transfer(owner, profit);
        }

        return true;
    }

    // -- INTERNAL FUNCTIONS -- //

    function _swapOnTraderJoe(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint256 _amountOutMin
    ) internal {
        require(
            IERC20(_tokenIn).approve(address(lbRouter), _amountIn),
            "Trader Joe LB approval failed."
        );

        // Create LB path with default bin step
        uint256[] memory pairBinSteps = new uint256[](1);
        pairBinSteps[0] = DEFAULT_BIN_STEP;
        
        IERC20[] memory tokenPath = new IERC20[](2);
        tokenPath[0] = IERC20(_tokenIn);
        tokenPath[1] = IERC20(_tokenOut);

        ILBRouter.Path memory lbPath = ILBRouter.Path({
            pairBinSteps: pairBinSteps,
            tokenPath: tokenPath
        });

        lbRouter.swapExactTokensForTokens(
            _amountIn,
            _amountOutMin,
            lbPath,
            address(this),
            block.timestamp + 1200
        );
    }

    function _swapOnPangolin(
        address[] memory _path,
        uint256 _amountIn,
        uint256 _amountOutMin
    ) internal {
        require(
            IERC20(_path[0]).approve(address(pRouter), _amountIn),
            "Pangolin approval failed."
        );

        pRouter.swapExactTokensForTokens(
            _amountIn,
            _amountOutMin,
            _path,
            address(this),
            block.timestamp + 1200
        );
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }
}
