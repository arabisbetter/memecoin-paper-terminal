export const PAPER_FEE_BPS=100
export const BASE_NETWORK_FEE_SOL=0.000005
export const EXECUTION_MODEL_VERSION='v4_constant_product_slippage'

const finite=(v,f=0)=>{const n=Number(v);return Number.isFinite(n)?n:f}
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n))

export function quotePaperExecution(input){
  const side=input?.side==='sell'?'sell':'buy'
  const referencePriceUsd=finite(input?.referencePriceUsd)
  const marketCapUsd=finite(input?.marketCapUsd)
  const liquidityUsd=finite(input?.liquidityUsd)
  const referenceNotionalUsd=finite(input?.notionalUsd)
  const solUsd=finite(input?.solUsd)
  const dexFeeBps=clamp(finite(input?.dexFeeBps,30),0,500)
  const slippageLimitBps=clamp(finite(input?.slippageLimitBps,1000),10,5000)
  const priorityFeeSol=clamp(finite(input?.priorityFeeSol,0),0,.1)
  if(referencePriceUsd<=0||liquidityUsd<=0||referenceNotionalUsd<=0||solUsd<=0)throw new Error('invalid execution inputs')

  const quoteReserveUsd=Math.max(liquidityUsd/2,1)
  const dexFeeRate=dexFeeBps/10000
  const networkFeeSol=BASE_NETWORK_FEE_SOL+priorityFeeSol
  const networkFeeUsd=networkFeeSol*solUsd
  let fillPriceUsd=referencePriceUsd
  let postTradePriceUsd=referencePriceUsd
  let dexFeeUsd=0
  let poolImpactPct=0

  if(side==='buy'){
    dexFeeUsd=referenceNotionalUsd*dexFeeRate
    const swapInputUsd=Math.max(0,referenceNotionalUsd-dexFeeUsd)
    const reserveRatio=swapInputUsd/quoteReserveUsd
    const poolAveragePrice=referencePriceUsd*(1+reserveRatio)
    fillPriceUsd=poolAveragePrice/Math.max(1-dexFeeRate,.000001)
    postTradePriceUsd=referencePriceUsd*Math.pow(1+reserveRatio,2)
    poolImpactPct=(poolAveragePrice/referencePriceUsd-1)*100
  }else{
    const effectiveReferenceNotional=referenceNotionalUsd*Math.max(1-dexFeeRate,0)
    dexFeeUsd=referenceNotionalUsd*dexFeeRate
    const reserveRatio=effectiveReferenceNotional/quoteReserveUsd
    const poolAveragePrice=referencePriceUsd/(1+reserveRatio)
    fillPriceUsd=poolAveragePrice*Math.max(1-dexFeeRate,0)
    postTradePriceUsd=referencePriceUsd/Math.pow(1+reserveRatio,2)
    poolImpactPct=(1-poolAveragePrice/referencePriceUsd)*100
  }

  const effectiveSlippageBps=(side==='buy'?(fillPriceUsd/referencePriceUsd-1):(1-fillPriceUsd/referencePriceUsd))*10000
  const priceImpactPct=Math.max(0,effectiveSlippageBps/100)
  const paperFeeUsd=(side==='buy'?referenceNotionalUsd:referenceNotionalUsd*(fillPriceUsd/referencePriceUsd))*(PAPER_FEE_BPS/10000)
  const fillMarketCapUsd=marketCapUsd>0?marketCapUsd*(fillPriceUsd/referencePriceUsd):0
  const postTradeMarketCapUsd=marketCapUsd>0?marketCapUsd*(postTradePriceUsd/referencePriceUsd):0
  const rejected=effectiveSlippageBps>slippageLimitBps

  return{
    side,referencePriceUsd,referenceNotionalUsd,liquidityUsd,quoteReserveUsd,
    dexFeeBps,dexFeeUsd,slippageLimitBps,effectiveSlippageBps,priorityFeeSol,
    baseNetworkFeeSol:BASE_NETWORK_FEE_SOL,networkFeeSol,networkFeeUsd,
    fillPriceUsd,postTradePriceUsd,fillMarketCapUsd,postTradeMarketCapUsd,
    poolImpactPct,priceImpactPct,paperFeeUsd,rejected,
    rejectionCode:rejected?'SLIPPAGE_EXCEEDED':null,
    executionQuality:'modeled',
    executionModelVersion:EXECUTION_MODEL_VERSION,
  }
}
