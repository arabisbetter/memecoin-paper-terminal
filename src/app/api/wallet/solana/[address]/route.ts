import { NextRequest, NextResponse } from 'next/server'

export const dynamic='force-dynamic'
const RPCS=['https://solana-rpc.publicnode.com','https://api.mainnet.solana.com'],TOKEN_PROGRAM='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',valid=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/
type RpcResult<T>={result?:T;error?:{message?:string}}
type Sig={signature:string;slot:number;err:unknown;memo?:string|null;blockTime?:number|null;confirmationStatus?:string|null}
type TokenAccount={account?:{data?:{parsed?:{info?:{mint?:string;tokenAmount?:{uiAmount?:number|null;uiAmountString?:string}}}}}}
type DexPair={chainId?:string;baseToken?:{address?:string;name?:string;symbol?:string};priceUsd?:string;liquidity?:{usd?:number};info?:{imageUrl?:string}}
type Meta={symbol?:string;name?:string;image?:string;priceUsd:number;liquidity:number}
const chunks=<T,>(a:T[],n:number)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,(i+1)*n))
async function rpc<T>(method:string,params:unknown[]):Promise<{result:T;source:string}>{let last:unknown=null;for(const endpoint of RPCS){const c=new AbortController(),timer=setTimeout(()=>c.abort(),8000);try{const r=await fetch(endpoint,{method:'POST',cache:'no-store',signal:c.signal,headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});if(!r.ok)throw new Error(`Solana RPC ${r.status}`);const body=await r.json() as RpcResult<T>;if(body.error)throw new Error(body.error.message||'Solana RPC error');if(body.result===undefined)throw new Error('Solana RPC returned no result');return{result:body.result,source:endpoint.includes('publicnode')?'solana-publicnode':'solana-public-rpc'}}catch(error){last=error}finally{clearTimeout(timer)}}throw last instanceof Error?last:new Error('Solana RPC unavailable')}
async function dexMetadata(mints:string[]){const out=new Map<string,Meta>();for(const group of chunks(mints.slice(0,90),30)){try{const r=await fetch(`https://api.dexscreener.com/tokens/v1/solana/${group.join(',')}`,{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)continue;const pairs=await r.json() as DexPair[];for(const p of pairs){if(p.chainId!=='solana'||!p.baseToken?.address)continue;const key=p.baseToken.address,prev=out.get(key),liq=Number(p.liquidity?.usd||0);if(!prev||liq>prev.liquidity)out.set(key,{symbol:p.baseToken.symbol,name:p.baseToken.name,image:p.info?.imageUrl,priceUsd:Number(p.priceUsd||0),liquidity:liq})}}catch{/* metadata is best effort */}}return out}

export async function GET(_req:NextRequest,ctx:{params:Promise<{address:string}>}){
  const {address}=await ctx.params
  if(!valid.test(address))return NextResponse.json({error:'Invalid Solana wallet address'},{status:400})
  try{
    const [balanceCall,signatureCall,tokenCall]=await Promise.all([
      rpc<{value:number}>('getBalance',[address,{commitment:'confirmed'}]),
      rpc<Sig[]>('getSignaturesForAddress',[address,{limit:30,commitment:'confirmed'}]),
      rpc<{value:TokenAccount[]}>('getTokenAccountsByOwner',[address,{programId:TOKEN_PROGRAM},{encoding:'jsonParsed',commitment:'confirmed'}]),
    ])
    const balanceResult=balanceCall.result,signatures=signatureCall.result,tokenResult=tokenCall.result
    const rpcSources=[...new Set([balanceCall.source,signatureCall.source,tokenCall.source])]
    const raw=(tokenResult.value||[]).map(row=>{const info=row.account?.data?.parsed?.info,mint=String(info?.mint||''),amount=Number(info?.tokenAmount?.uiAmount??info?.tokenAmount?.uiAmountString??0);return{mint,amount}}).filter(x=>x.mint&&x.amount>0).sort((a,b)=>b.amount-a.amount).slice(0,90),meta=await dexMetadata(raw.map(x=>x.mint))
    const holdings=raw.map(h=>{const m=meta.get(h.mint),priceUsd=Number(m?.priceUsd||0);return{...h,symbol:m?.symbol||null,name:m?.name||null,image:m?.image||null,priceUsd,valueUsd:priceUsd>0?h.amount*priceUsd:null}}).sort((a,b)=>Number(b.valueUsd||0)-Number(a.valueUsd||0))
    return NextResponse.json({address,balanceSol:Number(balanceResult.value||0)/1e9,holdings,recent:(signatures||[]).map(s=>({signature:s.signature,slot:s.slot,status:s.err?'failed':'success',memo:s.memo||null,blockTime:s.blockTime||null,confirmationStatus:s.confirmationStatus||null,explorerUrl:`https://solscan.io/tx/${s.signature}`})),live:true,asOf:Date.now(),source:rpcSources.join('+')},{headers:{'Cache-Control':'private, max-age=0, no-store'}})
  }catch(error){console.error('wallet_intelligence_error',{address,error});return NextResponse.json({error:error instanceof Error?error.message:'Wallet data unavailable'},{status:502})}
}
