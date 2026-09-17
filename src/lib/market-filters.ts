import type { MarketToken } from './types'

export type MarketFilters={
  include:string
  exclude:string
  minMarketCap:number
  maxMarketCap:number
  minLiquidity:number
  minVolume5m:number
  minTx5m:number
  maxAgeMinutes:number
  requireWebsite:boolean
  requireX:boolean
  requireTelegram:boolean
  positive5m:boolean
}

export const defaultMarketFilters:MarketFilters={include:'',exclude:'',minMarketCap:0,maxMarketCap:0,minLiquidity:0,minVolume5m:0,minTx5m:0,maxAgeMinutes:0,requireWebsite:false,requireX:false,requireTelegram:false,positive5m:false}

const words=(value:string)=>value.toLowerCase().split(/[\s,]+/).map(v=>v.trim()).filter(Boolean)

export function tokenMatchesFilters(token:MarketToken,filters:MarketFilters){
  const hay=`${token.symbol} ${token.name} ${token.dexId||''}`.toLowerCase(),include=words(filters.include),exclude=words(filters.exclude),tx5=Number(token.buys5m||0)+Number(token.sells5m||0)
  if(include.length&&!include.some(w=>hay.includes(w)))return false
  if(exclude.some(w=>hay.includes(w)))return false
  if(filters.minMarketCap>0&&token.marketCap<filters.minMarketCap)return false
  if(filters.maxMarketCap>0&&token.marketCap>filters.maxMarketCap)return false
  if(filters.minLiquidity>0&&token.liquidityUsd<filters.minLiquidity)return false
  if(filters.minVolume5m>0&&Number(token.volume5m||0)<filters.minVolume5m)return false
  if(filters.minTx5m>0&&tx5<filters.minTx5m)return false
  if(filters.maxAgeMinutes>0){if(!token.pairCreatedAt)return false;if(Date.now()-token.pairCreatedAt>filters.maxAgeMinutes*60_000)return false}
  if(filters.requireWebsite&&!token.website)return false
  if(filters.requireX&&!token.twitter)return false
  if(filters.requireTelegram&&!token.telegram)return false
  if(filters.positive5m&&Number(token.priceChange5m||0)<=0)return false
  return true
}

export function activeFilterCount(filters:MarketFilters){
  let count=0
  if(filters.include.trim())count++
  if(filters.exclude.trim())count++
  for(const key of ['minMarketCap','maxMarketCap','minLiquidity','minVolume5m','minTx5m','maxAgeMinutes'] as const)if(filters[key]>0)count++
  for(const key of ['requireWebsite','requireX','requireTelegram','positive5m'] as const)if(filters[key])count++
  return count
}
