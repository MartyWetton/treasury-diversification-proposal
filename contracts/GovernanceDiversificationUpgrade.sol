// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import { GovernanceStakingUpgrade } from "tornado-governance/contracts/v3-relayer-registry/GovernanceStakingUpgrade.sol";

contract GovernanceDiversificationUpgrade is GovernanceStakingUpgrade {
  mapping(address => bool) public isVestingHandler;

  constructor(
    address stakingRewardsAddress,
    address gasCompLogic,
    address userVaultAddress
  ) public GovernanceStakingUpgrade(stakingRewardsAddress, gasCompLogic, userVaultAddress) {}

  function setVestingHandler(address handler) external onlySelf {
    isVestingHandler[handler] = true;
  }

  /// @notice check that msg.sender is vestingHandler
  modifier onlyVestingHandler() {
    require(isVestingHandler[msg.sender], "Only vestingHandler");
    _;
  }

  function lockWithVestingTo(
    address beneficiary,
    uint256 amount,
    uint256 timestamp
  ) public virtual onlyVestingHandler {
    require(lockedBalance[beneficiary] == 0, "Beneficiary already has locked tokens");
    require(torn.transferFrom(msg.sender, address(userVault), amount), "TORN transferFrom failed");
    lockedBalance[beneficiary] = amount; // no addition as require to equal zero above
    _lockTokens(beneficiary, timestamp);
  }

  function version() external pure virtual override returns (string memory) {
    return "4.diversification-upgrade";
  }
}
