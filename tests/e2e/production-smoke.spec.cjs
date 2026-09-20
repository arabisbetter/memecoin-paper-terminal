const { expect, test } = require('@playwright/test')
const { completeOnboarding, liveToken } = require('./helpers.cjs')

test('exact deployed release works on the public PAPER hostname',async({page,request})=>{
  const expected=process.env.EXPECTED_COMMIT
  expect(expected).toBeTruthy()
  const version=await request.get('/api/version')
  expect(version.ok()).toBeTruthy()
  expect((await version.json()).commit).toBe(expected)

  const market=await request.get('/api/market/latest')
  expect(market.ok()).toBeTruthy()
  const marketBody=await market.json()
  expect(Array.isArray(marketBody.tokens)).toBeTruthy()
  expect(marketBody.tokens.length).toBeGreaterThan(0)
  expect(marketBody.live).toBe(true)

  for(const chain of ['base','ethereum']){
    const response=await request.get('/api/market/chain/'+chain)
    expect(response.ok()).toBeTruthy()
    const body=await response.json()
    expect(body.tokens.length).toBeGreaterThan(0)
  }
  const status=await request.get('/api/status')
  expect(status.ok()).toBeTruthy()
  expect((await status.json()).status).toBe('ok')

  const token=await liveToken(request)
  await page.goto('/spot?mint='+encodeURIComponent(token.mint),{waitUntil:'domcontentloaded'})
  await completeOnboarding(page,'prod')
  await expect(page.getByText(/LIVE MEMECOINS/)).toBeVisible({timeout:25000})
  await expect(page.locator('.token-row-shell,.spot-list-row').first()).toBeVisible({timeout:25000}).catch(async()=>{await expect(page.locator('.spot-token-list').getByText(token.symbol).first()).toBeVisible()})
  await expect(page.getByText('INSTANT BUY',{exact:true})).toBeVisible()
  await expect(page.locator('a[href="/profile"]')).toHaveCount(1)

  await page.getByRole('button',{name:'Edit presets',exact:true}).click()
  await page.getByLabel('Preset P1 SOL').fill('0.01')
  await page.getByRole('button',{name:'Save presets',exact:true}).click()
  await expect(page.getByText('Quick-buy presets saved.')).toBeVisible()
  await page.reload({waitUntil:'domcontentloaded'})
  await completeOnboarding(page,'prod')
  await page.getByRole('button',{name:'Edit presets',exact:true}).click()
  await expect(page.getByLabel('Preset P1 SOL')).toHaveValue('0.01')
  await page.getByRole('button',{name:'Done',exact:true}).click()

  const buy=page.locator('.instant-buy-preset').filter({hasText:'P1'}).first()
  await expect(buy).toBeEnabled({timeout:25000})
  await buy.click()
  await expect(page.getByText('PAPER BUY FILLED',{exact:true})).toBeVisible({timeout:30000})
  const sell=page.locator('.percentage-sell-button').filter({hasText:'25%'}).first()
  await expect(sell).toBeEnabled({timeout:25000})
  await sell.click()
  await expect(page.getByText('PAPER SELL FILLED',{exact:true})).toBeVisible({timeout:30000})

  const quickTimeframes=page.locator('.axiom-quick-tfs')
  for(const timeframe of ['1s','5s','1m','5m']){
    const button=quickTimeframes.getByRole('button',{name:'Chart timeframe '+timeframe,exact:true})
    await expect(button).toBeVisible()
    await button.click()
    await expect(page.locator('.lw-chart-canvas canvas').first()).toBeVisible({timeout:25000})
  }

  const search=page.getByLabel('Search tokens')
  await search.fill(token.symbol)
  await expect(page.locator('.header-search-results a').first()).toBeVisible({timeout:20000})
  await page.locator('.header-search-results a').first().click()
  await search.click()
  await expect(page.getByText('RECENT',{exact:true})).toBeVisible()

  await page.goto('/pulse',{waitUntil:'domcontentloaded'})
  for(const title of ['New Pairs','Final Stretch','Migrated','Trending','High Volume'])await expect(page.locator('.pulse-board-head').filter({hasText:title})).toHaveCount(1)
})
