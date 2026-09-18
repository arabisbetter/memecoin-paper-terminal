# PAPER Parts 4–5 status

## Part 4 — compliance and custody foundation

- Sumsub KYC WebSDK session endpoint is implemented.
- Sumsub webhook verification uses the raw request body and the provider HMAC digest algorithm.
- PAPER stores KYC state/reference data only; identity-document media, raw document numbers and private identity files are not copied into the application database.
- KYC, age, AML, sanctions, jurisdiction and tax-readiness states are persisted separately.
- Jurisdictions fail closed until affirmatively approved by counsel.
- Payout-wallet ownership is verified with a signed Solana challenge.
- Turnkey custody provisioning is admin-only and AAL2 protected.
- One PAPER-controlled Solana custody wallet is modeled per funded account.
- Database constraints keep key export, arbitrary transfer and principal withdrawal disabled.
- Real funded activation remains behind independent legal/KYC/AML/jurisdiction/custody/treasury feature gates.

## Part 5 — funded execution and payout engine

- Initial funded capital: $1,000.
- Scaling tiers: $1,000 -> $2,500 -> $5,000 -> $10,000 -> $25,000 after two consecutive profitable payout cycles.
- Continuous funded risk: 15% trailing drawdown and 5% funded-capital UTC daily loss.
- Breach closes the funded account, queues remaining positions for controlled liquidation and sets a 14-day requalification cooldown.
- Funded preflight enforces 25% single-trade/token concentration, five open positions, 3% default / 5% max slippage, live risk data, custody readiness and all launch gates.
- Funded execution route uses Turnkey signing and Jupiter order/execute with Pump/PumpSwap-only route labels.
- 1% PAPER protocol fee is recorded separately from network fees; PAPER pays network fees.
- Funded monitor runs every 30 seconds in staging.
- Friday 17:00 UTC settlement cron is active.
- Settlement requires flat positions, uses the high-water mark, enforces the $25 minimum and computes 90% trader / 10% PAPER.
- Every payout requires admin approval; amounts above $2,000 require a second different admin.
- Dedicated Turnkey payout-treasury route supports USDC and SOL payouts.
- Payout signing is separated from trader custody through TURNKEY_PAYOUT_* configuration.
- The exact signed payout transaction and expected signature are stored server-only before broadcast. Retries check/rebroadcast the same signed transaction while its blockhash is valid and will not silently create a second payment.
- Confirmed payout finalization rechecks compliance, verified payout-wallet ownership, tax readiness, abuse-review state, active funded-account state and flat positions.
- Post-payout capital resets to the funded scale tier rather than compounding.
- Admin UI now exposes settlement approval, second approval, execution and transaction status.

## Staging acceptance evidence

Rollback-only tests passed for:
- funded activation at $1,000;
- $850 initial 15% trailing floor;
- 5% daily-loss configuration;
- a $250 buy preflight at exactly 25% equity;
- rejection of a $251 buy with SINGLE_TRADE_LIMIT;
- $100 eligible weekly profit -> $90 trader / $10 PAPER;
- successful payout finalization/reset to $1,000 after one profitable cycle;
- second-admin requirement on a $2,700 payout;
- immediate close at $849 against a $1,000 peak / $850 floor;
- immediate close at $949 from a $1,000 UTC daily anchor ($51 loss);
- service-role-only access to payout broadcast artifact RPCs.

Staging was verified clean after tests:
- funded accounts: 0
- settlements: 0
- payout broadcast artifacts: 0
- all legal/KYC/custody/treasury/real-funded/payout feature flags: false

## External configuration still intentionally absent

Real provider execution cannot be enabled until reviewed staging/production credentials are supplied:
- Sumsub app token / secret / webhook secret / level
- Turnkey API keys and custody policy
- dedicated Turnkey payout treasury wallet and payout policy
- Helius / private Solana RPC
- Jupiter API key
- server kill switch PAPER_REAL_MONEY_SERVER_ENABLED=true

Those values must be stored only in server-side secret managers. No production credentials or real-money feature flags are enabled by this branch.
