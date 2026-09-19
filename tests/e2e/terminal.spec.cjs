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
  await expect(page.getByRole('heading',{name:/Find velocity/})).toBeVisible()

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
  const token=(market.tokens||[]).find(t=>t&&t.mint&&t.pairAddress)
  expect(token).toBeTruthy()

  await page.goto('/scanner',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('button',{name:/Deep scan top 10/i})).toBeVisible()
  await expect(page.getByText(/Require mint authority revoked/i)).toBeVisible()

  await page.goto('/smart-money',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:/Score wallets without pretending/i})).toBeVisible()

  await page.goto('/token/'+encodeURIComponent(token.mint)+'/intelligence',{waitUntil:'domcontentloaded'})
  await expect(page.getByText('TOP HOLDER BUBBLES')).toBeVisible({timeout:20000})
  await expect(page.getByText('LIVE LIFECYCLE')).toBeVisible()

  await page.goto('/spot?mint='+encodeURIComponent(token.mint),{waitUntil:'domcontentloaded'})
  await expect(page.getByText('MAX SLIPPAGE')).toBeVisible()
  await expect(page.getByLabel('Custom max slippage')).toBeVisible()
})
