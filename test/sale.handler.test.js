const { ethers, waffle } = require('hardhat')
const { loadFixture } = waffle
const { expect } = require('chai')
const { bufferToHex } = require('ethereumjs-util')
const ethSigUtil = require('eth-sig-util')
const { buildOrderData } = require('./helpers/orderUtils')
const { BigNumber } = require('@ethersproject/bignumber')

const config = require('../config')
const { getSignerFromAddress } = require('./helpers/utils')
const { generate } = require('../src/generateAddresses')

const OneInchAbi = require('./abi/oneInch.json')
const SingletonFactoryAbi = require('./abi/singletonFactoryAbi.json')

const ProposalState = {
  Pending: 0,
  Active: 1,
  Defeated: 2,
  Timelocked: 3,
  AwaitingExecution: 4,
  Executed: 5,
  Expired: 6,
}

describe('Treasury Diversification Tests', () => {
  let minewait = async (time) => {
    await ethers.provider.send('evm_increaseTime', [time])
    await ethers.provider.send('evm_mine', [])
  }

  async function buildOrder(
    exchange,
    saleHandler,
    takerAsset,
    makerAmount,
    takerAmount,
    endSaleDate,
    salt = 1,
  ) {
    const getMakerAmountTx = await exchange.populateTransaction.getMakerAmount(makerAmount, takerAmount, 1)
    const getTakerAmountTx = await exchange.populateTransaction.getTakerAmount(makerAmount, takerAmount, 1)
    const predicateTx = await exchange.populateTransaction.timestampBelow(endSaleDate)
    return {
      salt: salt,
      makerAsset: saleHandler.address,
      takerAsset: takerAsset.address,
      maker: saleHandler.address,
      receiver: config.governance,
      allowedSender: ethers.constants.AddressZero,
      makingAmount: makerAmount.toString(),
      takingAmount: takerAmount.toString(),
      makerAssetData: '0x',
      takerAssetData: '0x',
      getMakerAmount: getMakerAmountTx.data.slice(0, 138), // cut last parameter
      getTakerAmount: getTakerAmountTx.data.slice(0, 138), // cut last parameter
      predicate: predicateTx.data,
      permit: '0x',
      interaction: '0x',
    }
  }

  async function fixture() {
    // mock signature
    const signature = '0x'

    // prepare addresses ------------------------------------------------------
    // ------------------------------------------------------------------------
    const [sender, deployer] = await ethers.getSigners()

    const tornWhale = await getSignerFromAddress(config.tornWhale)

    const wethWhale = await getSignerFromAddress(config.wethWhale)

    let gov = await ethers.getContractAt('GovernanceStakingUpgrade', config.governance)

    const tornToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
      config.TORN,
    )

    const weth = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
      config.WETH,
    )

    await weth.connect(wethWhale).transfer(sender.address, ethers.utils.parseEther('10000'))

    const oneInch = await ethers.getContractAt(OneInchAbi, config.oneInchLimitOrderProtocol)
    // const oneInch = await ethers.getVerifiedContractAt(config.oneInchLimitOrderProtocol)

    // deploy with CREATE2 ----------------------------------------------------
    // ------------------------------------------------------------------------
    const singletonFactory = await ethers.getContractAt(SingletonFactoryAbi, config.singletonFactory)
    // const singletonFactory = await ethers.getVerifiedContractAt(config.singletonFactory)
    const contracts = await generate()

    // deploy SaleHandler
    if ((await ethers.provider.getCode(contracts.saleHandlerContract.address)) == '0x') {
      await singletonFactory.deploy(contracts.saleHandlerContract.bytecode, config.salt, {
        gasLimit: config.deployGasLimit,
      })
    }
    const saleHandler = await ethers.getContractAt('SaleHandler', contracts.saleHandlerContract.address)
    const vestingToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20',
      contracts.saleHandlerContract.address,
    )

    // deploy TreasuryDiversificationProposal
    if ((await ethers.provider.getCode(contracts.proposalContract.address)) == '0x') {
      await singletonFactory.deploy(contracts.proposalContract.bytecode, config.salt, {
        gasLimit: config.deployGasLimit,
      })
    }
    const proposal = await ethers.getContractAt(
      'TreasuryDiversificationProposal',
      contracts.proposalContract.address,
    )

    // execute TreasuryDiversificationProposal on governance ------------------
    // ------------------------------------------------------------------------
    const beforeStaking = await gov.Staking()
    const beforeGasCompensationVault = await gov.gasCompensationVault()
    const beforeUserVault = await gov.userVault()

    await tornToken.connect(tornWhale).approve(gov.address, ethers.utils.parseEther('1000000'))
    await gov.connect(tornWhale).lockWithApproval(ethers.utils.parseEther('26000'))

    let response = await gov.connect(tornWhale).propose(proposal.address, 'Treasury Diversification Proposal')
    let id = await gov.latestProposalIds(tornWhale.address)
    let state = await gov.state(id)

    const { events } = await response.wait()
    const args = events.find(({ event }) => event == 'ProposalCreated').args
    expect(args.id).to.be.equal(id)
    expect(args.proposer).to.be.equal(tornWhale.address)
    expect(args.target).to.be.equal(proposal.address)
    expect(args.description).to.be.equal('Treasury Diversification Proposal')
    expect(state).to.be.equal(ProposalState.Pending)

    await minewait((await gov.VOTING_DELAY()).add(1).toNumber())
    await expect(gov.connect(tornWhale).castVote(id, true)).to.not.be.reverted
    expect(await gov.state(id)).to.be.equal(ProposalState.Active)

    await minewait(
      (
        await gov.VOTING_PERIOD()
      )
        .add(await gov.EXECUTION_DELAY())
        .add(96400)
        .toNumber(),
    )
    expect(await gov.state(id)).to.be.equal(ProposalState.AwaitingExecution)

    await gov.execute(id)
    expect(await gov.state(id)).to.be.equal(ProposalState.Executed)

    // check gov constructor addreesses
    expect(await gov.Staking()).to.be.equal(beforeStaking)
    expect(await gov.gasCompensationVault()).to.be.equal(beforeGasCompensationVault)
    expect(await gov.userVault()).to.be.equal(beforeUserVault)

    // update gov abi
    gov = await ethers.getContractAt('GovernanceDiversificationUpgrade', config.governance)

    return {
      sender,
      deployer,
      tornWhale,
      gov,
      tornToken,
      weth,
      saleHandler,
      vestingToken,
      oneInch,
      signature,
    }
  }

  describe('Governance functionality', () => {
    it('should be able to lock/unlock torn in governance', async () => {
      const { sender, tornToken, gov, tornWhale } = await loadFixture(fixture)

      const value = ethers.utils.parseEther('1000')

      await tornToken.connect(tornWhale).transfer(sender.address, value)
      await tornToken.connect(sender).approve(gov.address, value)

      const ethBalanceBeforeLock = await ethers.provider.getBalance(sender.address)
      const tokenBalanceBeforeLock = await tornToken.balanceOf(sender.address)
      let tx = await gov.connect(sender).lockWithApproval(value)

      let receipt = await tx.wait()
      let txFee = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)
      const ethBalanceAfterLock = await ethers.provider.getBalance(sender.address)
      const tokenBalanceAfterLock = await tornToken.balanceOf(sender.address)
      expect(ethBalanceAfterLock).to.be.equal(ethBalanceBeforeLock.sub(txFee))
      expect(tokenBalanceAfterLock).to.be.equal(tokenBalanceBeforeLock.sub(value))

      const lockedBalanceAfterLock = await gov.lockedBalance(sender.address)
      expect(lockedBalanceAfterLock).to.be.equal(value)

      tx = await gov.connect(sender).unlock(value)

      receipt = await tx.wait()
      txFee = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)
      const ethBalanceAfterUnlock = await ethers.provider.getBalance(sender.address)
      const tokenBalanceAfterUnlock = await tornToken.balanceOf(sender.address)
      expect(ethBalanceAfterUnlock).to.be.equal(ethBalanceAfterLock.sub(txFee))
      expect(tokenBalanceAfterUnlock).to.be.equal(tokenBalanceBeforeLock)

      const lockedBalanceAfterUnlock = await gov.lockedBalance(sender.address)
      expect(lockedBalanceAfterUnlock).to.be.equal(0)
    })

    it('not sale handler should not lock TORN with vesting for any address', async () => {
      const { sender, gov, tornWhale } = await loadFixture(fixture)

      const curTimestamp = Math.trunc(new Date().getTime() / 1000)
      const value = ethers.utils.parseEther('1000')

      expect(await gov.lockedBalance(sender.address)).to.be.equal(0)

      await expect(gov.connect(tornWhale).lockWithVestingTo(sender.address, value, curTimestamp + 1000)).to.be
        .reverted

      expect(await gov.lockedBalance(sender.address)).to.be.equal(0)
    })

    it('gov upgrade with new vestingHandler should work', async () => {
      const { gov, tornWhale } = await loadFixture(fixture)

      // add some vestingHandler address to the gov storage and check it after the proposal passed
      // deploy
      const Proposal = await ethers.getContractFactory('TestProposal')
      const proposal = await Proposal.deploy()

      // execute proposal
      let response = await gov.connect(tornWhale).propose(proposal.address, 'Test Proposal')
      let id = await gov.latestProposalIds(tornWhale.address)
      let state = await gov.state(id)

      const { events } = await response.wait()
      const args = events.find(({ event }) => event == 'ProposalCreated').args
      expect(args.id).to.be.equal(id)
      expect(args.proposer).to.be.equal(tornWhale.address)
      expect(args.target).to.be.equal(proposal.address)
      expect(args.description).to.be.equal('Test Proposal')
      expect(state).to.be.equal(ProposalState.Pending)

      await minewait((await gov.VOTING_DELAY()).add(1).toNumber())
      await expect(gov.connect(tornWhale).castVote(id, true)).to.not.be.reverted
      state = await gov.state(id)
      expect(state).to.be.equal(ProposalState.Active)
      await minewait(
        (
          await gov.VOTING_PERIOD()
        )
          .add(await gov.EXECUTION_DELAY())
          .add(96400)
          .toNumber(),
      )
      state = await gov.state(id)
      expect(state).to.be.equal(ProposalState.AwaitingExecution)
      expect(await gov.isVestingHandler(gov.address)).to.be.equal(false)

      await gov.execute(id)

      state = await gov.state(id)
      expect(state).to.be.equal(ProposalState.Executed)

      expect(await gov.isVestingHandler(gov.address)).to.be.equal(true)
    })
  })

  describe('Limit order functionality', () => {
    it('isValidSignature/happy path', async function () {
      const { oneInch, saleHandler, weth, signature } = await loadFixture(fixture)

      const wethAmount = await saleHandler.wethAmount()
      const endSaleDate = await saleHandler.endSaleDate()
      const order = await buildOrder(oneInch, saleHandler, weth, config.saleAmount, wethAmount, endSaleDate)
      const data = buildOrderData(config.chainId, oneInch.address, order)
      const orderHash = bufferToHex(ethSigUtil.TypedDataUtils.sign(data))
      const result = await saleHandler.callStatic.isValidSignature(orderHash, signature)

      expect(result).equal('0x1626ba7e')
    })

    it('isValidSignature/invalid hash', async function () {
      const { oneInch, saleHandler, weth, signature } = await loadFixture(fixture)

      const wethAmount = await saleHandler.wethAmount()
      const endSaleDate = await saleHandler.endSaleDate()
      const order = await buildOrder(oneInch, saleHandler, weth, config.saleAmount, wethAmount, endSaleDate)
      const data = buildOrderData(config.chainId + 1, oneInch.address, order)
      const orderHash = bufferToHex(ethSigUtil.TypedDataUtils.sign(data))
      await expect(saleHandler.callStatic.isValidSignature(orderHash, signature)).to.be.revertedWith(
        'SH: invalid signature',
      )
    })

    it('isValidSignature/invalid maker asset', async function () {
      await assertInvalidSignatureThrows((order) => {
        order.makerAsset = order.takerAsset
      })
    })

    it('isValidSignature/invalid taker asset', async function () {
      await assertInvalidSignatureThrows((order) => {
        order.takerAsset = order.makerAsset
      })
    })

    it('isValidSignature/invalid tokens destination', async function () {
      const { sender, weth } = await loadFixture(fixture)
      const takerAssetDataTx = await weth.populateTransaction.transferFrom(sender.address, sender.address, 1)
      await assertInvalidSignatureThrows((order) => {
        order.takerAssetData = takerAssetDataTx.data
      })
    })

    it('isValidSignature/getMakerAmount', async function () {
      const { oneInch } = await loadFixture(fixture)
      const getMakerAmountTx = await oneInch.populateTransaction.getMakerAmount(12345, 12345, 1)
      await assertInvalidSignatureThrows((order) => {
        order.getMakerAmount = getMakerAmountTx.data.slice(0, 138)
      })
    })

    it('isValidSignature/getTakerAmount', async function () {
      const { oneInch } = await loadFixture(fixture)
      const getTakerAmountTx = await oneInch.populateTransaction.getTakerAmount(12345, 12345, 1)
      await assertInvalidSignatureThrows((order) => {
        order.getTakerAmount = getTakerAmountTx.data.slice(0, 138)
      })
    })

    it('should fill valid order', async function () {
      const { sender, oneInch, saleHandler, weth, signature } = await loadFixture(fixture)

      await weth.connect(sender).approve(oneInch.address, config.saleAmount)

      const wethAmount = await saleHandler.wethAmount()
      const endSaleDate = await saleHandler.endSaleDate()
      const order = await buildOrder(oneInch, saleHandler, weth, config.saleAmount, wethAmount, endSaleDate)

      expect(await weth.balanceOf(config.governance)).to.be.equal(0)
      const wethBalanceBefore = await weth.balanceOf(sender.address)

      await expect(() =>
        oneInch.fillOrder(order, signature, config.saleAmount, 0, config.saleAmount),
      ).to.changeTokenBalances(
        saleHandler,
        [saleHandler, sender],
        [BigNumber.from(0).sub(config.saleAmount), config.saleAmount],
      )

      expect(await weth.balanceOf(sender.address)).to.be.equal(wethBalanceBefore.sub(wethAmount))
      expect(await weth.balanceOf(saleHandler.address)).to.be.equal(0)
      expect(await weth.balanceOf(config.governance)).to.be.equal(wethAmount)
    })

    it('should not fill order after endSaleDate', async function () {
      const { sender, oneInch, saleHandler, weth, signature } = await loadFixture(fixture)

      await weth.connect(sender).approve(oneInch.address, config.saleAmount)

      const wethAmount = await saleHandler.wethAmount()
      const endSaleDate = await saleHandler.endSaleDate()
      const order = await buildOrder(oneInch, saleHandler, weth, config.saleAmount, wethAmount, endSaleDate)

      await minewait(config.saleDuration + 1)

      await expect(
        oneInch.fillOrder(order, signature, config.saleAmount, 0, config.saleAmount),
      ).to.be.revertedWith('LOP: predicate returned false')
    })

    async function assertInvalidSignatureThrows(orderUpdateFunc) {
      const { oneInch, saleHandler, weth, signature } = await loadFixture(fixture)

      const wethAmount = await saleHandler.wethAmount()
      const endSaleDate = await saleHandler.endSaleDate()
      const order = await buildOrder(oneInch, saleHandler, weth, config.saleAmount, wethAmount, endSaleDate)
      orderUpdateFunc(order)
      const data = buildOrderData(config.chainId, oneInch.address, order)
      const orderHash = bufferToHex(ethSigUtil.TypedDataUtils.sign(data))
      await expect(saleHandler.callStatic.isValidSignature(orderHash, signature)).to.be.revertedWith(
        'SH: invalid signature',
      )
    }
  })

  describe('Sale functionality', () => {
    it('sale should be initialized correctly', async () => {
      const { saleHandler, tornToken, oneInch } = await loadFixture(fixture)

      // check balances
      expect(await tornToken.balanceOf(saleHandler.address)).to.be.equal(config.saleAmount)
      expect(await saleHandler.balanceOf(saleHandler.address)).to.be.equal(config.saleAmount)

      // check sale params
      expect(await saleHandler.oneInch()).to.be.equal(oneInch.address)
      expect(await saleHandler.saleAmount()).to.be.equal(config.saleAmount)
      expect(await saleHandler.finalized()).to.be.equal(false)

      // check sale rate
      expect(await saleHandler.wethAmount()).to.be.gte(
        config.rateLowLimit.mul(config.saleAmount).div(ethers.utils.parseEther('1')),
      )
    })

    it('should be able to buy on sale, recieve vote power on governance and withdraw TORN after vesting period', async () => {
      const { sender, oneInch, saleHandler, weth, gov, tornToken, signature } = await loadFixture(fixture)

      // buy on sale ----------------------------------------------------------
      await weth.connect(sender).approve(oneInch.address, config.saleAmount)

      const wethAmount = await saleHandler.wethAmount()
      const endSaleDate = await saleHandler.endSaleDate()
      const order = await buildOrder(oneInch, saleHandler, weth, config.saleAmount, wethAmount, endSaleDate)

      expect(await weth.balanceOf(config.governance)).to.be.equal(0)
      const wethBalanceBefore = await weth.balanceOf(sender.address)

      await expect(() =>
        oneInch.fillOrder(order, signature, config.saleAmount, 0, wethAmount),
      ).to.changeTokenBalances(
        saleHandler,
        [saleHandler, sender],
        [BigNumber.from(0).sub(config.saleAmount), config.saleAmount],
      )

      expect(await weth.balanceOf(sender.address)).to.be.equal(wethBalanceBefore.sub(wethAmount))
      expect(await weth.balanceOf(saleHandler.address)).to.be.equal(0)
      expect(await weth.balanceOf(config.governance)).to.be.equal(wethAmount)

      // lock VTORN on governance and recieve vote power
      expect(await gov.lockedBalance(sender.address)).to.be.equal(0)

      await expect(() => saleHandler.transfer(gov.address, config.saleAmount)).to.changeTokenBalances(
        saleHandler,
        [sender, saleHandler],
        [BigNumber.from(0).sub(config.saleAmount), 0],
      )

      expect(await tornToken.balanceOf(saleHandler.address)).to.be.equal(0)
      expect(await gov.lockedBalance(sender.address)).to.be.equal(config.saleAmount)

      const endVestingData = await saleHandler.endVestingDate()
      expect(await gov.canWithdrawAfter(sender.address)).to.be.equal(endVestingData)

      // withdraw TORN after vesting period -----------------------------------
      await minewait(config.vestingDuration + config.saleDuration)

      await gov.connect(sender).unlock(config.saleAmount)

      expect(await tornToken.balanceOf(sender.address)).to.be.equal(config.saleAmount)
    })

    it('should be able to swap VTORN to TORN after vesting end date', async () => {
      const { sender, oneInch, saleHandler, weth, tornToken, gov, signature } = await loadFixture(fixture)

      // buy on sale ----------------------------------------------------------
      await weth.connect(sender).approve(oneInch.address, config.saleAmount)

      const wethAmount = await saleHandler.wethAmount()
      const endSaleDate = await saleHandler.endSaleDate()
      const order = await buildOrder(oneInch, saleHandler, weth, config.saleAmount, wethAmount, endSaleDate)

      expect(await weth.balanceOf(config.governance)).to.be.equal(0)
      const wethBalanceBefore = await weth.balanceOf(sender.address)

      await expect(() =>
        oneInch.fillOrder(order, signature, config.saleAmount, 0, wethAmount),
      ).to.changeTokenBalances(
        saleHandler,
        [saleHandler, sender],
        [BigNumber.from(0).sub(config.saleAmount), config.saleAmount],
      )

      expect(await weth.balanceOf(sender.address)).to.be.equal(wethBalanceBefore.sub(wethAmount))
      expect(await weth.balanceOf(saleHandler.address)).to.be.equal(0)
      expect(await weth.balanceOf(config.governance)).to.be.equal(wethAmount)

      // swap VTORN to TORN after vesting end date ----------------------------
      await minewait(config.vestingDuration + config.saleDuration)

      expect(await tornToken.balanceOf(saleHandler.address)).to.be.equal(config.saleAmount)

      await expect(() => saleHandler.transfer(gov.address, config.saleAmount)).to.changeTokenBalances(
        saleHandler,
        [sender, saleHandler],
        [BigNumber.from(0).sub(config.saleAmount), 0],
      )

      expect(await tornToken.balanceOf(sender.address)).to.be.equal(config.saleAmount)
      expect(await tornToken.balanceOf(saleHandler.address)).to.be.equal(0)
    })

    it('should finalize sale', async () => {
      const { sender, tornToken, gov, weth, oneInch, saleHandler, signature } = await loadFixture(fixture)

      // buy on sale ----------------------------------------------------------
      const buyAmount = config.saleAmount.div(2)
      await weth.connect(sender).approve(oneInch.address, config.saleAmount)

      const wethAmount = await saleHandler.wethAmount()
      const endSaleDate = await saleHandler.endSaleDate()
      const order = await buildOrder(oneInch, saleHandler, weth, config.saleAmount, wethAmount, endSaleDate)

      expect(await weth.balanceOf(config.governance)).to.be.equal(0)
      const wethBalanceBefore = await weth.balanceOf(sender.address)

      await expect(() =>
        oneInch.fillOrder(order, signature, buyAmount, 0, wethAmount),
      ).to.changeTokenBalances(
        saleHandler,
        [saleHandler, sender],
        [BigNumber.from(0).sub(buyAmount), buyAmount],
      )

      expect(await weth.balanceOf(sender.address)).to.be.equal(wethBalanceBefore.sub(wethAmount.div(2)))
      expect(await weth.balanceOf(saleHandler.address)).to.be.equal(0)
      expect(await weth.balanceOf(config.governance)).to.be.equal(wethAmount.div(2))

      // finalize sale --------------------------------------------------------
      await minewait(config.saleDuration + 1)

      expect(await saleHandler.finalized()).to.be.equal(false)

      await expect(() => saleHandler.finalizeSale()).to.changeTokenBalances(
        tornToken,
        [saleHandler, gov],
        [BigNumber.from(0).sub(config.saleAmount.sub(buyAmount)), config.saleAmount.sub(buyAmount)],
      )

      expect(await saleHandler.finalized()).to.be.equal(true)
    })
  })
})
