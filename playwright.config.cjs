const { defineConfig, devices } = require('@playwright/test')

module.exports = defineConfig({
  testDir:'./tests/e2e',
  timeout:45000,
  expect:{timeout:10000},
  fullyParallel:false,
  retries:1,
  reporter:[['list']],
  use:{
    baseURL:'http://127.0.0.1:3000',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off',
  },
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:{
    command:'npm start -- -p 3000',
    url:'http://127.0.0.1:3000',
    reuseExistingServer:true,
    timeout:30000,
  },
})
