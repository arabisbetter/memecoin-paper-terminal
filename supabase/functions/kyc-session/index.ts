const headers={'Content-Type':'application/json','Cache-Control':'no-store'}
Deno.serve((req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
  return new Response(JSON.stringify({
    ok:false,
    code:'REAL_MONEY_DISABLED_PAPER_BETA',
    error:'Real-money trading, custody, funded execution, KYC activation, wallet linking, and payouts are disabled in the PAPER-only beta.'
  }),{status:410,headers})
})
