async function completeOnboarding(page,prefix='e2e'){
  const profile=page.getByRole('heading',{name:'Create your trader profile'})
  const profileVisible=await profile.waitFor({state:'visible',timeout:10000}).then(()=>true).catch(()=>false)
  if(profileVisible){
    const suffix=String(Date.now()).slice(-8)
    await page.getByLabel('Username').fill((prefix+'_'+suffix).slice(0,24))
    const display=page.getByLabel(/Display name/i)
    if(await display.isVisible().catch(()=>false))await display.fill('PAPER E2E')
    await page.getByRole('button',{name:'Continue',exact:true}).click()
    await profile.waitFor({state:'hidden',timeout:20000})
  }
  const legal=page.getByRole('heading',{name:'Current PAPER terms'})
  const legalVisible=await legal.waitFor({state:'visible',timeout:10000}).then(()=>true).catch(()=>false)
  if(legalVisible){
    await page.getByRole('checkbox').check()
    await page.getByRole('button',{name:'Accept & enter PAPER',exact:true}).click()
    await legal.waitFor({state:'hidden',timeout:20000})
  }
}
async function liveToken(request){
  const response=await request.get('/api/market/latest')
  if(!response.ok())throw new Error('market feed '+response.status())
  const body=await response.json()
  const tokens=(body.tokens||[]).filter(t=>t&&t.mint&&t.pairAddress&&Number(t.priceUsd)>0&&Number(t.liquidityUsd)>0)
  tokens.sort((a,b)=>Number(b.liquidityUsd||0)-Number(a.liquidityUsd||0))
  if(!tokens.length)throw new Error('no liquid live token')
  return tokens[0]
}
function relativeDiff(a,b){return Math.abs(Number(a)-Number(b))/Math.max(1e-12,Math.abs(Number(b)))}
module.exports={completeOnboarding,liveToken,relativeDiff}
