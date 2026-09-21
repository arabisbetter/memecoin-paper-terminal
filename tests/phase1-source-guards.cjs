const fs=require('fs')
const assert=require('assert')

const trade=fs.readFileSync('supabase/functions/paper-trade/index.ts','utf8')
assert.match(trade,/LIQUIDITY_UNAVAILABLE/)
assert.match(trade,/RISK_UNVERIFIED/)
assert.match(trade,/TOKEN_RISK_BLOCK/)
assert.match(trade,/market-risk-scan/)
assert.doesNotMatch(trade,/live_requote_price_only/)

for(const p of ['src/app/api/funded/execute/route.ts','src/app/api/funded/payout/route.ts']){
  const text=fs.readFileSync(p,'utf8')
  assert.match(text,/REAL_MONEY_DISABLED_PAPER_BETA/)
  assert.doesNotMatch(text,/Turnkey|sendRawTransaction|VersionedTransaction/)
}
const migration=fs.readFileSync('supabase/migrations/20260921033000_phase1_trade_eligibility.sql','utf8')
assert.match(migration,/paper_token_leaderboard_eligible/)
assert.match(migration,/funded_buy_blocked/)
console.log('phase1 source guards ok')
