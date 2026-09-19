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
  await expect(page.getByRole('heading',{name:/Filter the launch/})).toBeVisible()

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


test('Part 9 first four controls render and are interactive',async({page})=>{
  await page.goto('/smart-money',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:/Score what can actually be observed/})).toBeVisible()
  await expect(page.getByRole('button',{name:/Discover from live tapes/})).toBeVisible()
  await expect(page.getByText('No wealth bonus. No invented win rate.')).toBeVisible()

  await page.goto('/scanner',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('button',{name:/Deep scan top 20/})).toBeVisible()
  await expect(page.getByText('Max top-10 %')).toBeVisible()
  await expect(page.getByText('Authorities')).toBeVisible()

  await page.goto('/spot',{waitUntil:'domcontentloaded'})
  await expect(page.getByLabel('Slippage limit')).toBeVisible()
  await expect(page.getByLabel('Priority fee')).toBeVisible()
  await expect(page.getByLabel('Assumed DEX fee')).toBeVisible()
  await page.getByLabel('Slippage limit').selectOption('500')
  await expect(page.getByLabel('Slippage limit')).toHaveValue('500')
})
