// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import { GovernanceDiversificationUpgrade } from "../GovernanceDiversificationUpgrade.sol";

contract TestProposal {
  address public constant GOVERNANCE = 0x5efda50f22d34F262c29268506C5Fa42cB56A1Ce;

  function executeProposal() external {
    GovernanceDiversificationUpgrade(payable(GOVERNANCE)).setVestingHandler(address(this));
  }
}
