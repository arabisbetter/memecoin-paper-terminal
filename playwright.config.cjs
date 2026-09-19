const { defineConfig, devices } = require('@playwright/test')

module.exports = defineConfig({
  testDir:'./tests/e2e',
  timeout:60000,
  expect:{timeout:15000},
  fullyParallel:false,
  retries:1,
  reporter:[['list']],
  use:{
    baseURL:'http://127.0.0.1:3000',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off',
  },
  projects:[
    {name:'desktop-chromium',testMatch:/terminal\.spec\.cjs/,use:{...devices['Desktop Chrome']}},
    {name:'mobile-chromium',testMatch:/mobile\.spec\.cjs/,use:{...devices['Pixel 5']}},
    {name:'mobile-webkit',testMatch:/mobile\.spec\.cjs/,use:{...devices['iPhone 13']}},
  ],
  webServer:{
    command:'npm start -- -p 3000',
    url:'http://127.0.0.1:3000',
    reuseExistingServer:true,
    timeout:30000,
  },
})
