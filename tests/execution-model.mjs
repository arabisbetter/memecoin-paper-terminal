import assert from 'node:assert/strict'
import {quotePaperExecution,BASE_NETWORK_FEE_SOL,EXECUTION_MODEL_VERSION} from '../supabase/functions/_shared/execution-model.mjs'

const base={referencePriceUsd:1,marketCapUsd:1_000_000,liquidityUsd:100_000,notionalUsd:1000,solUsd:200,dexFeeBps:30,slippageLimitBps:1000,priorityFeeSol:.0001}
const buy=quotePaperExecution({...base,side:'buy'})
assert.equal(buy.rejected,false)
assert.ok(buy.fillPriceUsd>1)
assert.ok(buy.postTradePriceUsd>buy.fillPriceUsd)
assert.ok(buy.dexFeeUsd>0)
assert.ok(buy.networkFeeSol>BASE_NETWORK_FEE_SOL)
assert.equal(buy.executionModelVersion,EXECUTION_MODEL_VERSION)

const sell=quotePaperExecution({...base,side:'sell'})
assert.equal(sell.rejected,false)
assert.ok(sell.fillPriceUsd<1)
assert.ok(sell.postTradePriceUsd<sell.fillPriceUsd)

const tight=quotePaperExecution({...base,side:'buy',slippageLimitBps:10})
assert.equal(tight.rejected,true)
assert.equal(tight.rejectionCode,'SLIPPAGE_EXCEEDED')

const tiny=quotePaperExecution({...base,side:'buy',notionalUsd:1,priorityFeeSol:0})
assert.ok(tiny.effectiveSlippageBps<buy.effectiveSlippageBps)
assert.ok(Math.abs(tiny.networkFeeSol-BASE_NETWORK_FEE_SOL)<1e-12)

console.log('execution model ok',JSON.stringify({buySlippageBps:buy.effectiveSlippageBps,sellSlippageBps:sell.effectiveSlippageBps}))
