import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

type Pair={chainId?:string;baseToken?:{address?:string};priceUsd?:string;liquidity?:{usd?:number}}
type Mark={mint:string;priceUsd:number;source:string}
const finite=(v:unknown,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback}
const chunks=<T,>(items:T[],size:number)=>Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size))
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})

function envKeys(){
  const url=Deno.env.get('SUPABASE_URL')
  const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
  const secret=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!secret)throw new Error('server auth configuration missing')
  return{url,secret}
}
async function fetchJson(url:string,init:RequestInit={},timeoutMs=8000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs)
  try{
    const r=await fetch(url,{...init,signal:controller.signal,headers:{Accept:'application/json',...(init.headers||{})}})
    if(!r.ok)throw new Error(`${new URL(url).hostname} ${r.status}`)
    return await r.json()
  }finally{clearTimeout(timer)}
}
async function dexMarks(mints:string[],marks:Map<string,Mark>){
  for(const group of chunks(mints,30)){
    try{
      const body=await fetchJson(`https://api.dexscreener.com/tokens/v1/solana/${group.map(encodeURIComponent).join(',')}`)
      const pairs=(Array.isArray(body)?body:[]) as Pair[]
      const best=new Map<string,Pair>()
      for(const p of pairs){
        const mint=String(p.baseToken?.address||''),price=finite(p.priceUsd),liq=finite(p.liquidity?.usd)
        if(p.chainId!=='solana'||!group.includes(mint)||price<=0)continue
        const prev=best.get(mint)
        if(!prev||liq>finite(prev.liquidity?.usd))best.set(mint,p)
      }
      for(const [mint,p] of best)marks.set(mint,{mint,priceUsd:finite(p.priceUsd),source:'dexscreener'})
    }catch{/* next fallback */}
  }
}
async function jupiterMarks(mints:string[],marks:Map<string,Mark>){
  const key=Deno.env.get('JUPITER_API_KEY')
  if(!key)return
  for(const group of chunks(mints.filter(m=>!marks.has(m)),50)){
    if(!group.length)continue
    try{
      const body=await fetchJson(`https://api.jup.ag/price/v3?ids=${group.map(encodeURIComponent).join(',')}`,{headers:{'x-api-key':key}})
      for(const mint of group){
        const price=finite((body as Record<string,any>)?.[mint]?.usdPrice)
        if(price>0)marks.set(mint,{mint,priceUsd:price,source:'jupiter_price_v3'})
      }
    }catch{/* unavailable */}
  }
}
async function geckoMarks(mints:string[],marks:Map<string,Mark>){
  for(const mint of mints.filter(m=>!marks.has(m)).slice(0,30)){
    try{
      const body=await fetchJson(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${encodeURIComponent(mint)}/pools?page=1`)
      const pools=Array.isArray((body as any)?.data)?(body as any).data:[]
      let chosen:any=null
      for(const pool of pools){
        const a=pool?.attributes||{},price=finite(a.base_token_price_usd),liq=finite(a.reserve_in_usd)
        if(price>0&&(!chosen||liq>finite(chosen?.attributes?.reserve_in_usd)))chosen=pool
      }
      if(chosen)marks.set(mint,{mint,priceUsd:finite(chosen.attributes.base_token_price_usd),source:'geckoterminal'})
    }catch{/* unavailable */}
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return reply({error:'method not allowed'},405)
  try{
    const {url,secret}=envKeys()
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    const token=req.headers.get('x-paper-internal-token')||''
    const {data:valid}=await admin.rpc('paper_verify_internal_token',{p_token:token})
    if(valid!==true)return reply({error:'unauthorized'},401)

    const {data:accounts,error:accountError}=await admin.from('paper_funded_accounts')
      .select('id,user_id,status,cash_usd,current_equity_usd,last_mark_at')
      .eq('status','active').order('last_mark_at',{ascending:true,nullsFirst:true}).limit(250)
    if(accountError)throw new Error(accountError.message)
    if(!accounts?.length)return reply({ok:true,activeAccounts:0,markedLive:0,markedUnavailable:0,breaches:0})

    const accountIds=accounts.map((a:any)=>a.id)
    const {data:positions,error:positionError}=await admin.from('paper_funded_positions')
      .select('id,funded_account_id,user_id,token_address,quantity_tokens')
      .in('funded_account_id',accountIds).eq('status','open').gt('quantity_tokens',0)
    if(positionError)throw new Error(positionError.message)

    const mints=[...new Set((positions||[]).map((p:any)=>String(p.token_address)).filter(Boolean))]
    const marks=new Map<string,Mark>()
    await dexMarks(mints,marks);await jupiterMarks(mints,marks);await geckoMarks(mints,marks)

    const positionsByAccount=new Map<string,any[]>()
    for(const p of positions||[]){
      const id=String((p as any).funded_account_id),arr=positionsByAccount.get(id)||[]
      arr.push(p);positionsByAccount.set(id,arr)
    }

    let markedLive=0,markedUnavailable=0,breaches=0
    const errors:Record<string,string>={}
    for(const a of accounts as any[]){
      const open=positionsByAccount.get(String(a.id))||[]
      let openValue=0,complete=true
      for(const p of open){
        const mark=marks.get(String(p.token_address))
        if(!mark){complete=false;break}
        openValue+=finite(p.quantity_tokens)*mark.priceUsd
      }
      const equity=complete?finite(a.cash_usd)+openValue:finite(a.current_equity_usd)
      const {data:result,error}=await admin.rpc('paper_record_funded_mark_v1',{
        p_funded_account_id:a.id,p_equity_usd:equity,p_open_value_usd:complete?openValue:0,
        p_source:complete?'funded_monitor_live_marks':'funded_monitor_missing_mark',
        p_data_status:complete?'LIVE':'UNAVAILABLE'
      })
      if(error){errors[String(a.id)]=error.message;continue}
      if(complete)markedLive++;else markedUnavailable++
      if(result?.status==='closed'&&result?.breach_reason)breaches++
    }

    // Keep the leaderboard's funded P&L current without exposing privileged writes to clients.
    try{await admin.rpc('paper_refresh_leaderboards_v2')}catch{}
    return reply({ok:true,activeAccounts:accounts.length,markedLive,markedUnavailable,breaches,markCount:marks.size,errors})
  }catch(error){
    return reply({error:error instanceof Error?error.message:'funded monitor failed'},500)
  }
})
