const { expect, test } = require('@playwright/test')

test('desktop PAPER terminal exposes Axiom-style chart and Part 7 controls',async({page})=>{
  await page.goto('/spot',{waitUntil:'domcontentloaded'})
  await expect(page.getByText('LIVE MEMECOINS')).toBeVisible()
  await expect(page.getByRole('button',{name:'1s'})).toBeVisible()
  await expect(page.getByRole('button',{name:/MarketCap \/ Price|Price \/ MarketCap/})).toBeVisible()
  await expect(page.getByTitle('Trend line')).toBeVisible()
  await expect(page.getByTitle('Ray')).toBeVisible()
  await expect(page.getByTitle('Rectangle')).toBeVisible()
  await expect(page.getByTitle('Fibonacci retracement')).toBeVisible()
  await expect(page.getByLabel('Resize token list')).toBeVisible()
  await expect(page.getByLabel('Resize trade panel')).toBeVisible()
  await page.getByRole('button',{name:/Display/}).first().click()
  await expect(page.getByText('PAPER trade markers')).toBeVisible()
  await expect(page.getByRole('button',{name:'Limit',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Stop',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Take Profit',exact:true})).toBeVisible()
})

test('mobile terminal uses dedicated chart trade positions and info panes',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.goto('/spot',{waitUntil:'domcontentloaded'})
  const terminal=page.locator('main.parts23-terminal')
  await expect(page.getByRole('button',{name:'Chart',exact:true})).toBeVisible()

  await page.getByRole('button',{name:'Trade',exact:true}).evaluate(el=>el.click())
  await expect(terminal).toHaveAttribute('data-mobile-pane','trade')
  await expect(page.locator('.p23-trade-panel')).toBeVisible()
  await expect(page.getByRole('button',{name:'Limit',exact:true})).toBeVisible()

  await page.getByRole('button',{name:'Positions',exact:true}).evaluate(el=>el.click())
  await expect(terminal).toHaveAttribute('data-mobile-pane','positions')
  await expect(page.locator('.positions-panel')).toBeVisible()

  await page.getByRole('button',{name:'Info',exact:true}).evaluate(el=>el.click())
  await expect(terminal).toHaveAttribute('data-mobile-pane','info')
  await expect(page.locator('.token-intel-card')).toBeVisible()
})
test('Pulse workspace and Watchlist alert center render',async({page})=>{
  await page.goto('/pulse',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:'Pulse'})).toBeVisible()
  await expect(page.getByRole('button',{name:/Filters/})).toBeVisible()
  await page.goto('/watchlist',{waitUntil:'domcontentloaded'})
  await expect(page.getByText('ALERT EVENTS')).toBeVisible()
})


test('Part 8 research tools and command palette render',async({page})=>{
  await page.goto('/scanner',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:/Filter velocity, then verify concentration/})).toBeVisible()

  await page.goto('/heatmap',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:/Where attention is moving/})).toBeVisible()

  await page.goto('/compare',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:/Compare up to four markets/})).toBeVisible()

  await page.goto('/workspaces',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:/Watch the market your way/})).toBeVisible()

  await page.goto('/journal',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:/Record why you took the trade/})).toBeVisible()

  await page.goto('/replay',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:'Trade Replay'})).toBeVisible()

  await page.keyboard.press('Control+k')
  await expect(page.getByPlaceholder(/Search token, CA, scanner/)).toBeVisible()
  await expect(page.getByText('Launch scanner',{exact:true})).toBeVisible()
  await expect(page.getByText('Trading journal',{exact:true})).toBeVisible()
})


test('Part 9 live intelligence surfaces render against live APIs',async({page,request})=>{
  const marketRes=await request.get('/api/market/latest')
  expect(marketRes.ok()).toBeTruthy()
  const market=await marketRes.json()
  const tokens=(market.tokens||[]).filter(t=>t&&t.mint&&t.pairAddress).slice(0,12)
  expect(tokens.length).toBeGreaterThan(0)
  let token=null
  for(const candidate of tokens){
    const intel=await request.get('/api/intelligence/token/'+encodeURIComponent(candidate.mint))
    if(intel.ok()){const body=await intel.json();if(Array.isArray(body.distribution?.holders)&&body.distribution.holders.length){token=candidate;break}}
  }
  expect(token).toBeTruthy()

  await page.goto('/scanner',{waitUntil:'domcontentloaded'})
  const deepButton=page.getByRole('button',{name:/Deep scan top 6/i})
  await expect(deepButton).toBeVisible()
  await deepButton.click()
  await expect(page.getByText(/Deep data refreshed/i)).toBeVisible({timeout:30000})
  await expect(page.getByText(/Require mint authority revoked/i)).toBeVisible()

  await page.goto('/smart-money',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:/Score wallets without pretending/i})).toBeVisible()

  await page.goto('/token/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/intelligence',{waitUntil:'domcontentloaded'})
  await expect(page.getByText('TOP HOLDER BUBBLES')).toBeVisible({timeout:20000})
  await expect(page.getByText('LIVE LIFECYCLE')).toBeVisible()

  await page.goto('/spot?mint='+encodeURIComponent(token.mint),{waitUntil:'domcontentloaded'})
  await expect(page.getByText('MAX SLIPPAGE')).toBeVisible()
  await expect(page.getByLabel('Custom max slippage')).toBeVisible()
})


test('Part 10 community rewards leaderboards status and server indicators render',async({page,request})=>{
  const marketRes=await request.get('/api/market/latest')
  expect(marketRes.ok()).toBeTruthy()
  const market=await marketRes.json()
  const token=(market.tokens||[]).find(t=>t&&t.mint&&t.pairAddress&&Number(t.priceUsd)>0)
  expect(token).toBeTruthy()

  await page.goto('/community',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:'Trader feed'})).toBeVisible()
  await expect(page.getByText('POST TO PAPER',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'GLOBAL',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'FOLLOWING',exact:true})).toBeVisible()

  await page.goto('/leaderboards',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:/Performance, not one lucky click/})).toBeVisible()
  for(const name of ['TODAY','WEEK','MONTH','ALL TIME'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Consistency',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Low Drawdown',exact:true})).toBeVisible()

  await page.goto('/rewards',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:/Levels, badges, and points/})).toBeVisible()
  await expect(page.getByText('MILESTONE BADGES',{exact:true})).toBeVisible()
  await expect(page.getByText('First Fill',{exact:true})).toBeVisible()

  await page.goto('/status',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:/Live provider and monitor health/})).toBeVisible()
  await expect(page.getByText('MARKET PROVIDERS',{exact:true})).toBeVisible()
  await expect(page.getByText('BACKGROUND COMPONENTS',{exact:true})).toBeVisible()

  await page.goto('/spot?mint='+encodeURIComponent(token.mint),{waitUntil:'domcontentloaded'})
  await expect(page.locator('.server-indicator-strip')).toBeVisible({timeout:20000})
  await expect(page.getByText('RSI 14',{exact:true})).toBeVisible()
  await expect(page.getByText('MACD HIST',{exact:true})).toBeVisible()
})
