// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import { OracleLibrary } from "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";
import { IUniswapV3Factory } from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";

interface IERC20Decimals {
  function decimals() external view returns (uint8);
}

library UniswapV3OracleHelper {
  IUniswapV3Factory internal constant UniswapV3Factory = IUniswapV3Factory(0x1F98431c8aD98523631AE4a59f267346ea31F984);
  address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  /**
   * @notice This function should return the price of baseToken in quoteToken, as in: quote/base (WETH/TORN)
   * @dev uses the Uniswap written OracleLibrary "getQuoteAtTick", does not call external libraries,
   *      uses decimals() for the correct power of 10
   * @param baseToken token which will be denominated in quote token
   * @param quoteToken token in which price will be denominated
   * @param fee the uniswap pool fee, pools have different fees so this is a pool selector for our usecase
   * @param period the amount of seconds we are going to look into the past for the new token price
   * @return returns the price of baseToken in quoteToken
   * */
  function getPriceOfTokenInToken(
    address baseToken,
    address quoteToken,
    uint24 fee,
    uint32 period
  ) internal view returns (uint256) {
    uint128 base = uint128(10)**uint128(IERC20Decimals(quoteToken).decimals());
    if (baseToken == quoteToken) return base;
    else
      return
        OracleLibrary.getQuoteAtTick(
          OracleLibrary.consult(UniswapV3Factory.getPool(baseToken, quoteToken, fee), period),
          base,
          baseToken,
          quoteToken
        );
  }
}
