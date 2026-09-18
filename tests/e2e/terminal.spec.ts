import { expect, test } from '@playwright/test'

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

  await expect(page.getByRole('button',{name:'Limit'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Stop'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Take Profit'})).toBeVisible()
})

test('mobile terminal uses dedicated chart trade positions and info panes',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.goto('/spot',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('button',{name:'Chart',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Trade',exact:true}).click()
  await expect(page.getByRole('button',{name:'Buy',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Limit'})).toBeVisible()
  await page.getByRole('button',{name:'Positions',exact:true}).click()
  await expect(page.getByText('OPEN PAPER POSITIONS')).toBeVisible()
  await page.getByRole('button',{name:'Info',exact:true}).click()
  await expect(page.getByText(/ABOUT \$/)).toBeVisible()
})

test('Pulse workspace and Watchlist alert center render',async({page})=>{
  await page.goto('/pulse',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:'Pulse'})).toBeVisible()
  await expect(page.getByRole('button',{name:/Filters/})).toBeVisible()
  await page.goto('/watchlist',{waitUntil:'domcontentloaded'})
  await expect(page.getByText('ALERT EVENTS')).toBeVisible()
})
