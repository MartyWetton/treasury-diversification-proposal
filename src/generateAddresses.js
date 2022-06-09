const { ethers } = require('hardhat')
const defaultConfig = require('../config')

async function generate(config = defaultConfig) {
  // saleHandler contract -----------------------------------------------------
  // --------------------------------------------------------------------------
  const SaleHandlerFactory = await ethers.getContractFactory('SaleHandler')
  const deploymentBytecodeSaleHandler =
    SaleHandlerFactory.bytecode +
    SaleHandlerFactory.interface
      .encodeDeploy([
        config.vestingTokenName,
        config.vestingTokenTiker,
        config.oneInchLimitOrderProtocol,
        config.saleAmount,
        config.saleDuration,
        config.vestingDuration,
      ])
      .slice(2)

  const saleHandlerAddress = ethers.utils.getCreate2Address(
    config.singletonFactory,
    config.salt,
    ethers.utils.keccak256(deploymentBytecodeSaleHandler),
  )

  // proposal contract --------------------------------------------------------
  // --------------------------------------------------------------------------
  const ProposalFactory = await ethers.getContractFactory('TreasuryDiversificationProposal')
  const deploymentBytecodeProposal =
    ProposalFactory.bytecode +
    ProposalFactory.interface
      .encodeDeploy([
        saleHandlerAddress,
        config.saleAmount,
        config.rateLowLimit,
        config.saleDiscount,
        config.uniswapTornPoolSwappingFee,
        config.uniswapTimePeriod,
      ])
      .slice(2)

  const proposalAddress = ethers.utils.getCreate2Address(
    config.singletonFactory,
    config.salt,
    ethers.utils.keccak256(deploymentBytecodeProposal),
  )

  return {
    saleHandlerContract: {
      address: saleHandlerAddress,
      bytecode: deploymentBytecodeSaleHandler,
      isProxy: false,
    },
    proposalContract: {
      address: proposalAddress,
      bytecode: deploymentBytecodeProposal,
      isProxy: false,
    },
  }
}

async function generateWithLog() {
  const contracts = await generate()
  console.log('Sale Handler contract: ', contracts.saleHandlerContract.address)
  console.log('Treasury Diversification Proposal contract: ', contracts.proposalContract.address)
  return contracts
}

module.exports = {
  generate,
  generateWithLog,
}
