const { ethers } = require('hardhat')

module.exports = {
  snapshotBlockNumber: 14570000,
  governance: '0x5efda50f22d34F262c29268506C5Fa42cB56A1Ce',
  tornadoProxy: '0x722122dF12D4e14e13Ac3b6895a86e84145b6967',
  TORN: '0x77777FeDdddFfC19Ff86DB637967013e6C6A116C',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  tornWhale: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
  wethWhale: '0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0',
  oneInchLimitOrderProtocol: '0x119c71D3BbAC22029622cbaEc24854d3D32D2828',
  vestingTokenName: 'Tornado Cash Vesting token 1',
  vestingTokenTiker: 'TORN-v-1',
  singletonFactory: '0xce0042B868300000d44A59004Da54A005ffdcf9f',
  singletonFactoryVerboseWrapper: '0xCEe71753C9820f063b38FDbE4cFDAf1d3D928A80',
  salt: '0x0000000000000000000000000000000000000000000000000000000047941987',
  deployGasLimit: 8000000,
  saleAmount: ethers.utils.parseEther('50000'), // 50000 TORN
  saleDiscount: 20,
  saleDuration: 1209600, // 14 days
  rateLowLimit: ethers.utils.parseEther('0.008'), // 0.008 ETH for 1 TORN
  vestingDuration: 31536000, // 365 days
  chainId: 1,
  uniswapTornPoolSwappingFee: 10000,
  uniswapTimePeriod: 5400,
}
