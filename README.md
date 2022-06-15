# Treasury diversification proposal

## Overview

The aim of this proposal is the diversification of the treasury. Specifically, selling some treasury's TORN for WETH and store received WETH on governance contract.

Sale features:

- Fully decentralized: Tornado DAO and [1Inch LimitOrderProtocol](https://docs.1inch.io/docs/limit-order-protocol/introduction) are used to achieve it
- Crowd sale with a fixed price and token amounts
- Only Vesting TORN token (TORN-v-1) to be sold:
  - Users can lock TORN-v-1 in Tornado governance for a vesting period (see parameters section). In which case users can use them for governance voting and withdraw as TORN after vesting period
  - Alternatively, users can swap TORN-v-1 for the same value of TORN after a vesting period

## Parameters

1. `saleAmount` - 50_000 TORN, amount of TORN to be sold
2. `saleDiscount` - 20%, discount from market TORN/ETH price at governance proposal execution moment
3. `rateLowLimit` - 0.008, minimal TORN/ETH rate for sale (minimum 0.008 ETH for 1 TORN)
4. `saleDuration` - 14 days
5. `vestingDuration` - 365 days

## Warnings

1. **TORN/ETH** sale rate is constant and is fixed on the proposal execution moment. So the price can be more than the market one during the sale - which makes the sale not attractive to investors.
2. Governance contract has `canWithdrawAfter[user]` parameter which says when an exact user can withdraw tokens - it is one common date for all user's tokens. In current implementation user can't lock TORN-v-1 on governance if already they have locked tokens (otherwise all their tokens would be locked for `vestingDuration`).

## Test

```bash
yarn
cp .env.example .env
yarn test
```

## Deploy

Check config.js for actual values.

With `salt` = `0x0000000000000000000000000000000000000000000000000000000047941987` addresses must be:

1. `SaleHandler` - `0xC04B13De0E4830d98a88E48CD689b4208e9C0654`
2. `TreasuryDiversificationProposal` - `0xFfCF0A92A6A8C04b85aB8685ae98b46C243b871c`

Check addresses with current config:

```shell
    yarn compile
    node -e 'require("./src/generateAddresses").generateWithLog()'
```

Deploy SaleHandler:

```shell
    yarn hardhat run scripts/deploySaleHandler.js --network mainnet
```

Deploy TreasuryDiversificationProposal:

```shell
    yarn hardhat run scripts/deployProposal.js --network mainnet
```

Verify on Etherscan:

```
    yarn hardhat verify --network <network-name> <contract-address> <constructor-arguments>
```
