// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import "./GovernanceDiversificationUpgrade.sol";
import { LoopbackProxy } from "tornado-governance/contracts/v1/LoopbackProxy.sol";
import { ISaleHandler } from "./helpers/ISaleHandler.sol";
import { UniswapV3OracleHelper } from "./libraries/UniswapV3OracleHelper.sol";

contract TreasuryDiversificationProposal {
  using SafeMath for uint256;

  address payable public constant GOVERNANCE = 0x5efda50f22d34F262c29268506C5Fa42cB56A1Ce;
  address public constant TORN = 0x77777FeDdddFfC19Ff86DB637967013e6C6A116C;

  address public immutable saleHandler;
  uint256 public immutable saleAmount;
  uint256 public immutable rateLowLimit; // in ETH per 1 TORN
  uint256 public immutable saleDiscount; // discount in % from market TORN price
  uint24 public immutable uniswapTornPoolSwappingFee; // in 10**-4 %
  uint32 public immutable uniswapTimePeriod; // in secs

  constructor(
    address _saleHandler,
    uint256 _saleAmount,
    uint256 _rateLowLimit,
    uint256 _saleDiscount,
    uint24 _uniswapTornPoolSwappingFee,
    uint32 _uniswapTimePeriod
  ) public {
    require(_saleDiscount < 100, "Sale discount must be less than 100%");
    saleHandler = _saleHandler;
    saleAmount = _saleAmount;
    rateLowLimit = _rateLowLimit;
    saleDiscount = _saleDiscount;
    uniswapTornPoolSwappingFee = _uniswapTornPoolSwappingFee;
    uniswapTimePeriod = _uniswapTimePeriod;
  }

  /// @notice the entry point for the governance upgrade logic execution
  function executeProposal() external {
    // transfer TORN to sale contract
    require(ERC20(TORN).transfer(saleHandler, saleAmount), "TORN transfer failed");

    // determine sale rate and WETH amount to be received
    uint256 rate = UniswapV3OracleHelper.getPriceOfTokenInToken(
      TORN,
      UniswapV3OracleHelper.WETH,
      uniswapTornPoolSwappingFee,
      uniswapTimePeriod
    );
    rate = rate.mul(100 - saleDiscount).div(100);
    rate = rate > rateLowLimit ? rate : rateLowLimit;
    uint256 base = 10**uint256(ERC20(TORN).decimals());
    uint256 wethAmount = saleAmount.mul(rate).div(base);

    // init sale handler
    ISaleHandler(saleHandler).initializeSale(wethAmount);

    // upgrade Governance impl
    GovernanceStakingUpgrade gov = GovernanceStakingUpgrade(GOVERNANCE);
    LoopbackProxy(GOVERNANCE).upgradeTo(
      address(
        new GovernanceDiversificationUpgrade(
          address(gov.Staking()),
          address(gov.gasCompensationVault()),
          address(gov.userVault())
        )
      )
    );

    // set vesting handler address
    GovernanceDiversificationUpgrade(GOVERNANCE).setVestingHandler(address(saleHandler));
  }
}
