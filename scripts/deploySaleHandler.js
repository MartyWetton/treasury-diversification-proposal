const { ethers } = require('hardhat')
const config = require('../config')
const { generate } = require('../src/generateAddresses')
const SingletonFactoryAbi = require('../test/abi/singletonFactoryAbi.json')

async function deploy({ address, bytecode, singletonFactory }) {
  const contractCode = await ethers.provider.getCode(address)
  if (contractCode !== '0x') {
    console.log(`Contract ${address} already deployed. Skipping...`)
    return
  }
  await singletonFactory.deploy(bytecode, config.salt, { gasLimit: config.deployGasLimit })
}

async function main() {
  const singletonFactory = await ethers.getContractAt(SingletonFactoryAbi, config.singletonFactory)
  const contracts = await generate()
  await deploy({ ...contracts.saleHandlerContract, singletonFactory })
  console.log(`SaleHandler contract have been deployed on ${contracts.saleHandlerContract.address} address`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
