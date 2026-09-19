const { expect, test } = require('@playwright/test')
const { completeOnboarding, liveToken } = require('./helpers.cjs')

test('mobile PAPER header, search, trade panes, and chart controls stay usable',async({page,request})=>{
  const token=await liveToken(request)
  await page.goto('/spot?mint='+encodeURIComponent(token.mint),{waitUntil:'domcontentloaded'})
  await completeOnboarding(page,'mobile')

  await expect(page.getByRole('link',{name:'Spot',exact:true})).toBeVisible()
  await expect(page.getByRole('link',{name:'Pulse',exact:true})).toBeVisible()
  await expect(page.getByRole('link',{name:'Profile',exact:true})).toBeVisible()
  const search=page.getByLabel('Search tokens')
  await expect(search).toBeVisible()
  const s=await search.boundingBox(),p=await page.getByRole('link',{name:'Profile',exact:true}).boundingBox()
  expect(s&&p).toBeTruthy()
  const overlap=!(s.x+s.width<=p.x||p.x+p.width<=s.x||s.y+s.height<=p.y||p.y+p.height<=s.y)
  expect(overlap).toBeFalsy()

  const terminal=page.locator('main.parts23-terminal')
  for(const pane of ['Chart','Trade','Positions','Info']){
    await page.getByRole('button',{name:pane,exact:true}).click()
    await expect(terminal).toHaveAttribute('data-mobile-pane',pane.toLowerCase())
  }

  await page.getByRole('button',{name:'Chart',exact:true}).click()
  const chart=page.locator('.lw-chart-canvas')
  await expect(chart).toBeVisible()
  const picker=page.locator('.tf-picker-button')
  await expect(picker).toBeVisible()
  for(const [label,expected] of [['5 minutes','5 minutes'],['1 minute','1 minute']]){
    await picker.click()
    await page.getByRole('menuitem',{name:label,exact:true}).click()
    await expect(picker).toContainText(expected)
    await expect(chart).toBeVisible()
  }

  await page.getByRole('button',{name:'Trade',exact:true}).click()
  await expect(page.getByText('INSTANT BUY',{exact:true})).toBeVisible()
  await expect(page.locator('.instant-buy-preset')).toHaveCount(4)
  await expect(page.locator('.percentage-sell-button')).toHaveCount(4)
})

test('mobile Pulse remains a readable three-board experience',async({page})=>{
  await page.goto('/pulse',{waitUntil:'domcontentloaded'})
  await completeOnboarding(page,'pulse')
  for(const title of ['New Pairs','Final Stretch','Migrated'])await expect(page.locator('.pulse-board-head').filter({hasText:title})).toHaveCount(1)
  await expect(page.getByRole('button',{name:/Filters/})).toBeVisible()
  const feedback=page.getByRole('button',{name:'Feedback',exact:true})
  await expect(feedback).toBeVisible()
  await feedback.click()
  await expect(page.getByRole('dialog',{name:'Send feedback'})).toBeVisible()
  await page.getByRole('button',{name:'Cancel',exact:true}).click()
})
