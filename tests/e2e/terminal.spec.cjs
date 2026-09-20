const { expect, test } = require('@playwright/test')
const { completeOnboarding, liveToken, relativeDiff } = require('./helpers.cjs')

test('landing page and terminal navigation stay connected',async({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('link',{name:'Trade',exact:true})).toBeVisible()
  await expect(page.getByRole('link',{name:'Pulse',exact:true})).toBeVisible()
  await expect(page.getByRole('link',{name:'Launch PAPER',exact:true})).toBeVisible()

  await page.getByRole('link',{name:'Launch PAPER',exact:true}).click()
  await expect(page).toHaveURL(/\/spot/)
  await completeOnboarding(page,'home')
  const primaryNav=page.getByRole('navigation',{name:'Primary navigation'})
  for(const label of ['Discover','Trade','Evaluation','Funded','Pulse','Chains','Portfolio']){
    await expect(primaryNav.getByRole('link',{name:label,exact:true})).toBeVisible()
  }
  await expect(page.getByRole('link',{name:'Profile',exact:true})).toBeVisible()
  await expect(page.getByLabel('Search tokens')).toBeVisible()
  await expect(page.locator('a[href="/profile"]')).toHaveCount(1)
  await expect(page.locator('.token-row-shell').first()).toBeVisible({timeout:25000})
  await expect(page.locator('.lw-chart-canvas').first()).toBeVisible({timeout:25000})

  const searchBox=await page.getByLabel('Search tokens').boundingBox()
  const profileBox=await page.getByRole('link',{name:'Profile',exact:true}).boundingBox()
  expect(searchBox&&profileBox).toBeTruthy()
  const overlap=!(searchBox.x+searchBox.width<=profileBox.x||profileBox.x+profileBox.width<=searchBox.x||searchBox.y+searchBox.height<=profileBox.y||profileBox.y+profileBox.height<=searchBox.y)
  expect(overlap).toBeFalsy()

  const nameless=await page.locator('button:visible').evaluateAll(buttons=>buttons.filter(b=>!((b.getAttribute('aria-label')||b.getAttribute('title')||b.textContent||'').trim())).map(b=>b.outerHTML.slice(0,160)))
  expect(nameless,nameless.join('\n')).toEqual([])
})

test('presets save, reload, instant buy, and percentage sell work for a fresh anonymous PAPER user',async({page,request})=>{
  const token=await liveToken(request)
  await page.goto('/spot?mint='+encodeURIComponent(token.mint),{waitUntil:'domcontentloaded'})
  await completeOnboarding(page,'trade')
  await expect(page.getByText('INSTANT BUY',{exact:true})).toBeVisible({timeout:25000})
  await page.getByRole('button',{name:'Edit presets',exact:true}).click()
  const p1=page.getByLabel('Preset P1 SOL')
  await p1.fill('0.01')
  await page.getByRole('button',{name:'Save presets',exact:true}).click()
  await expect(page.getByText('Quick-buy presets saved.')).toBeVisible()

  await page.reload({waitUntil:'domcontentloaded'})
  await completeOnboarding(page,'trade')
  await page.getByRole('button',{name:'Edit presets',exact:true}).click()
  await expect(page.getByLabel('Preset P1 SOL')).toHaveValue('0.01')
  await page.getByRole('button',{name:'Done',exact:true}).click()

  const p1Buy=page.locator('.instant-buy-preset').filter({hasText:'P1'}).first()
  await expect(p1Buy).toBeEnabled({timeout:25000})
  await p1Buy.click()
  await expect(page.locator('.trade-message').filter({hasText:/^PAPER BUY FILLED$/})).toBeVisible({timeout:30000})

  const sell25=page.locator('.percentage-sell-button').filter({hasText:'25%'}).first()
  await expect(sell25).toBeEnabled({timeout:25000})
  await sell25.click()
  await expect(page.locator('.trade-message').filter({hasText:/^PAPER SELL FILLED$/})).toBeVisible({timeout:30000})
  await expect(page.locator('a[href="/profile"]')).toHaveCount(1)
})

test('candle API fills gaps and chart survives repeated timeframe changes',async({page,request})=>{
  test.setTimeout(120000)
  const token=await liveToken(request)
  for(const [tf,seconds] of [['1m',60],['1s',1]]){
    const response=await request.get('/api/market/ohlcv/'+encodeURIComponent(token.pairAddress)+'?tf='+tf)
    expect(response.ok()).toBeTruthy()
    const body=await response.json()
    expect(body.candles.length).toBeGreaterThan(0)
    for(let i=1;i<body.candles.length;i++){
      const prev=body.candles[i-1],cur=body.candles[i]
      expect(Number(cur.time)-Number(prev.time)).toBe(seconds)
      expect(relativeDiff(cur.open,prev.close)).toBeLessThan(1e-9)
      if(Number(cur.volume)===0){
        expect(relativeDiff(cur.open,cur.high)).toBeLessThan(1e-12)
        expect(relativeDiff(cur.open,cur.low)).toBeLessThan(1e-12)
        expect(relativeDiff(cur.open,cur.close)).toBeLessThan(1e-12)
      }
    }
  }

  await page.goto('/spot?mint='+encodeURIComponent(token.mint),{waitUntil:'domcontentloaded'})
  await completeOnboarding(page,'chart')
  const quickTimeframes=page.locator('.axiom-quick-tfs')
  await expect(quickTimeframes).toBeVisible()
  for(const timeframe of ['1s','5s','1m','5m']){
    const button=quickTimeframes.getByRole('button',{name:'Chart timeframe '+timeframe,exact:true})
    await expect(button).toBeVisible()
    await button.click()
    await expect(button).toHaveClass(/active/)
    await expect(page.locator('.lw-chart-canvas canvas').first()).toBeVisible({timeout:25000})
    await expect(page.getByText(/chart unavailable/i)).toHaveCount(0)
  }
})

test('token search history persists and full Pulse boards remain available',async({page,request})=>{
  const token=await liveToken(request)
  await page.goto('/spot',{waitUntil:'domcontentloaded'})
  await completeOnboarding(page,'search')
  const search=page.getByLabel('Search tokens')
  await search.fill(token.symbol)
  await expect(page.locator('.header-search-results a').first()).toBeVisible({timeout:20000})
  await page.locator('.header-search-results a').first().click()
  await expect(page).toHaveURL(/\/spot\?mint=/)

  await search.click()
  await expect(page.getByText('RECENT',{exact:true})).toBeVisible()
  await expect(page.locator('.header-search-results')).toContainText(token.symbol)
  await page.getByRole('button',{name:'Clear history',exact:true}).click()
  await expect(page.getByText('No search history yet.')).toBeVisible()

  await page.goto('/pulse',{waitUntil:'domcontentloaded'})
  await completeOnboarding(page,'search')
  for(const title of ['New Pairs','Final Stretch','Migrated','Trending','High Volume'])await expect(page.locator('.pulse-board-head').filter({hasText:title})).toHaveCount(1)
  await expect(page.locator('.pulse-five-grid .pulse-board-column')).toHaveCount(5)
  await expect(page.getByRole('button',{name:'$25',exact:true})).toBeVisible()
  await expect(page.getByText(/INSTANT (ON|OFF)/)).toBeVisible()
  const pulseOverflow=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth}))
  expect(pulseOverflow.scrollWidth).toBeLessThanOrEqual(pulseOverflow.innerWidth+2)
})

test('feedback and core Part 10 public surfaces remain available',async({page,request})=>{
  await page.goto('/spot',{waitUntil:'domcontentloaded'})
  await completeOnboarding(page,'feedback')
  await page.getByRole('button',{name:'Feedback',exact:true}).click()
  await page.getByPlaceholder('What happened?').fill('Automated PAPER feedback flow verification.')
  await page.getByRole('button',{name:'Send feedback',exact:true}).click()
  await expect(page.getByText('Sent. Thank you.')).toBeVisible()

  for(const route of ['/community','/status','/rewards','/leaderboards']){
    const response=await request.get(route)
    expect(response.ok(),route).toBeTruthy()
  }
  const status=await request.get('/api/status')
  expect(status.ok()).toBeTruthy()
  expect((await status.json()).status).toBe('ok')
})
