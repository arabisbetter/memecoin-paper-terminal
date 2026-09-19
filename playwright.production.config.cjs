const { defineConfig, devices } = require('@playwright/test')

module.exports=defineConfig({
  testDir:'./tests/e2e',
  testMatch:/production-smoke\.spec\.cjs/,
  timeout:90000,
  expect:{timeout:20000},
  fullyParallel:false,
  retries:1,
  reporter:[['list']],
  use:{
    baseURL:process.env.PAPER_PRODUCTION_URL||'https://memecoin-paper-terminal.vercel.app',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off',
  },
  projects:[{name:'production-chromium',use:{...devices['Desktop Chrome']}}],
})
