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
  const primaryNav=page.getByRole('navigation',{name:'Primary navigation'})
  await expect(primaryNav.getByRole('link',{name:'Funded',exact:true})).toHaveCount(0)
  for(const name of ['Discover','Spot','Pulse','Evaluation','Chains','Portfolio','Watchlist','Leaderboard'])await expect(primaryNav.getByRole('link',{name,exact:true})).toBeVisible()
  await expect(page.locator('.ax-profile-entry')).toHaveCount(1)
  await expect(page.locator('.restored-feature-dock a[href="/profile"]')).toHaveCount(1)

  for(const route of ['/discover','/portfolio','/chains','/watchlist','/scanner','/smart-money','/heatmap','/compare','/workspaces','/journal','/replay','/community','/leaderboards','/status','/wallets','/evaluation','/rewards','/charity']){
    const restored=await request.get(route,{maxRedirects:0})
    expect(restored.status(),route).toBe(200)
  }
  for(const route of ['/funded','/coin']){
    const blocked=await request.get(route,{maxRedirects:0})
    expect(blocked.status(),route).toBe(307)
    expect(blocked.headers().location).toBe('/spot')
  }
  const intel=await request.get('/token/'+encodeURIComponent(token.mint)+'/intelligence',{maxRedirects:0})
  expect(intel.status()).toBe(200)
  const trader=await request.get('/trader/00000000-0000-0000-0000-000000000000',{maxRedirects:0})
  expect(trader.status()).toBe(200)

  await page.getByRole('button',{name:'More',exact:true}).click()
  const moreMenu=page.getByRole('menu',{name:'More PAPER tools'})
  for(const name of ['Rewards','Wallet Tracker','Charity'])await expect(moreMenu.getByRole('menuitem',{name,exact:true})).toBeVisible()
  await page.keyboard.press('Escape')

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
  await expect(page.locator('.trade-message').filter({hasText:/^PAPER BUY FILLED$/})).toBeVisible({timeout:30000})
  const sell=page.locator('.percentage-sell-button').filter({hasText:'25%'}).first()
  await expect(sell).toBeEnabled({timeout:25000})
  await sell.click()
  await expect(page.locator('.trade-message').filter({hasText:/^PAPER SELL FILLED$/})).toBeVisible({timeout:30000})

  await page.getByRole('button',{name:'Indicators',exact:true}).click()
  for(const name of ['EMA 50','SMA 20','SMA 50','Bollinger 20']){
    const box=page.getByRole('checkbox',{name,exact:true})
    await expect(box).toBeVisible()
    await box.check()
  }
  await page.keyboard.press('Escape')

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
