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


const legalAccept=fs.readFileSync('src/app/api/legal/accept/route.ts','utf8')
assert.match(legalAccept,/x-forwarded-for/)
assert.match(legalAccept,/x-real-ip/)
assert.match(legalAccept,/ip_at_acceptance/)

const legalPage=fs.readFileSync('src/app/legal/page.tsx','utf8')
assert.match(legalPage,/DRAFT - ATTORNEY REVIEW REQUIRED/)
assert.match(legalPage,/No reimbursement or make-good/)
assert.match(legalPage,/Contest Rules — DRAFT \/ DORMANT/)

const landing=fs.readFileSync('src/components/LandingHome.tsx','utf8')
assert.doesNotMatch(landing,/EARN REAL/i)
assert.match(landing,/PAPER SOL/)
assert.match(landing,/NO REIMBURSEMENT/)

for(const p of [
  'supabase/functions/payout-wallet-link/index.ts',
  'supabase/functions/kyc-session/index.ts',
  'supabase/functions/kyc-webhook/index.ts',
  'supabase/functions/custody-provision/index.ts',
  'supabase/functions/funded-monitor/index.ts',
]){
  const text=fs.readFileSync(p,'utf8')
  assert.match(text,/REAL_MONEY_DISABLED_PAPER_BETA/)
}

const betaLock=fs.readFileSync('supabase/migrations/20260921032000_phase1_paper_only_lock.sql','utf8')
assert.match(betaLock,/real_funded_activation=false/)
assert.match(betaLock,/real_payouts_enabled=false/)
assert.match(betaLock,/turnkey_signing_enabled=false/)

const layout=fs.readFileSync('src/app/layout.tsx','utf8')
assert.doesNotMatch(layout,/EARN REAL/i)
assert.match(layout,/Solana memecoin paper trading/i)

const profile=fs.readFileSync('src/app/profile/page.tsx','utf8')
assert.doesNotMatch(profile,/payout.wallet|payout address|funded real|REAL SOL/i)
