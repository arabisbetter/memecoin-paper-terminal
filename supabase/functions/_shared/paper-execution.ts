export const finite=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?n:fallback}

export function constantProductBuy(referencePrice,liquidityUsd,notionalUsd){
  const price=finite(referencePrice),liquidity=finite(liquidityUsd),notional=finite(notionalUsd)
  if(price<=0||liquidity<=0||notional<=0)throw new Error('invalid constant-product buy inputs')
  const quote=Math.max(liquidity/2,1),token=quote/price,k=quote*token,newQuote=quote+notional,newToken=k/newQuote,out=token-newToken
  if(out<=0)throw new Error('execution model could not produce a buy fill')
  const fillPrice=notional/out,impactPct=(fillPrice/price-1)*100
  return{fillPrice,impactPct,tokenOut:out}
}

export function constantProductSell(referencePrice,liquidityUsd,sellQty){
  const price=finite(referencePrice),liquidity=finite(liquidityUsd),qty=finite(sellQty)
  if(price<=0||liquidity<=0||qty<=0)throw new Error('invalid constant-product sell inputs')
  const quote=Math.max(liquidity/2,1),token=quote/price,k=quote*token,newToken=token+qty,newQuote=k/newToken,out=quote-newQuote
  if(out<=0)throw new Error('execution model could not produce a sell fill')
  const fillPrice=out/qty,impactPct=(1-fillPrice/price)*100
  return{fillPrice,impactPct,grossFillUsd:out}
}

export function deterministicLatencyMs(key){
  const input=String(key||'')
  let h=0
  for(let i=0;i<input.length;i++)h=(h*31+input.charCodeAt(i))>>>0
  return 180+(h%520)
}
