# PAPER — Compliance Notes (Pre-launch Working Analysis)

**Last updated:** 2026-09-17  
**Status:** NOT LEGALLY CLEARED FOR REAL FUNDED TRADING OR PAYOUTS  
**Purpose:** Engineering/compliance issue-spotting only. This document is not legal advice and must not be treated as a legal opinion.

## 1. Product facts this analysis assumes

PAPER is planned as a Texas-operated product available globally except restricted jurisdictions, including all 50 U.S. states. V1 public access may include anonymous PAPER-only use and a free evaluation. Evaluation trades use simulated capital against live Solana market data. Current evaluation rules are $1,000 starting PAPER, +$5,000 target, 10% continuously trailing drawdown, $50 UTC daily-loss cap, 30-day window, 25% single-token/single-entry cap, five open positions max, and one minimum trade.

Passing the evaluation is intended to be rule-based. A future real-funded phase would allocate PAPER-controlled capital through one Turnkey-controlled Solana wallet per funded trader. The trader would be able to request approved buys/sells but would not receive keys or arbitrary withdrawal authority. Planned funded economics are 90% of eligible realized profit to the trader and 10% to PAPER, with Friday 17:00 UTC settlement, USDC by default and SOL optional. PAPER would maintain a 40% treasury reserve and deploy no more than 60% of available treasury. Real funded activation and real payouts are feature-flagged OFF until KYC, legal, security, custody, and capital requirements are complete.

The evaluation is currently free. If PAPER later charges an evaluation fee, counsel must re-review the analysis before enabling that fee.

## 2. My Forex Funds / CFTC comparison — relevant, but not a clean precedent

The CFTC's FY2023 enforcement summary stated that it charged defendants doing business as **My Forex Funds** with fraudulently soliciting at least **$310 million in fees from more than 135,000 customers** to trade leveraged/margined retail forex and leveraged retail commodity transactions. PAPER should treat the matter as an important regulatory warning because the business model included an evaluation/simulated environment followed by a purported funded-trading opportunity and profit participation.

However, the case is **not a clean final precedent against all funded-trader models**. In May 2025 the U.S. District Court for the District of New Jersey dismissed the CFTC complaint with prejudice as a sanction for agency misconduct; in July 2025 the court awarded the defendants approximately $3.148 million in fees and costs and closed the matter. PAPER's compliance materials must state both sides of that history rather than citing only the 2023 allegations.

Also, My Forex Funds involved leveraged/margined retail forex and commodities. PAPER's proposed funded execution is spot Solana-token trading. That factual difference can materially change which CFTC registration provisions apply. Counsel still needs to analyze whether any PAPER product feature creates a commodity-interest, retail-commodity, leveraged, financed, or otherwise regulated transaction.

**Primary / court sources:**
- CFTC FY2023 enforcement results: https://www.cftc.gov/PressRoom/PressReleases/8822-23
- CFTC court order from the 2023 case: https://www.cftc.gov/media/9191/enftradersglobalgrouporder082923/download
- CFTC 2025 statement acknowledging court sanctions: https://www.cftc.gov/PressRoom/PressReleases/9074-25
- May 13, 2025 dismissal order: https://docs.justia.com/cases/federal/district-courts/new-jersey/njdce/1%3A2023cv11808/545238/260
- July 2025 fee/closure order: https://law.justia.com/cases/federal/district-courts/new-jersey/njdce/1%3A2023cv11808/545238/269/

## 3. Securities / broker-dealer / dealer issues

The SEC's March 2026 interpretation states that many crypto assets are not themselves securities, while a crypto asset can still be offered or sold as part of an **investment contract** depending on the facts and representations. PAPER therefore cannot assume that every memecoin available through a Solana router is outside the securities laws merely because the token trades on-chain.

PAPER v1 should not issue its own token, promise token appreciation, pool customer investment capital, or market evaluation participation as an investment. The current `$PAPER` token/buyback idea is deferred and must receive a separate securities analysis before implementation.

A future funded account is intended to use PAPER's own allocated capital, with the trader providing trading decisions and receiving a contractual share of realized profit. Whether that arrangement creates securities, broker/dealer, investment-adviser, commodity, employment/contractor, or other regulated status is a fact-specific legal question. Engineering must not label it legally safe merely because PAPER owns the wallet.

Before real activation, U.S. counsel should specifically analyze:
1. whether any supported token/transaction is a security or part of an investment contract;
2. whether PAPER is effecting transactions in securities for others or acting as a dealer;
3. whether public social/leaderboard features cross into regulated recommendations, solicitation, or advisory activity;
4. whether the funded profit-sharing contract itself creates a security or other regulated financial arrangement.

**SEC sources:**
- 2026 interpretive release: https://www.sec.gov/rules-regulations/2026/03/s7-2026-09
- SEC small-business explanation of crypto/investment-contract analysis: https://www.sec.gov/resources-small-businesses/capital-raising-building-blocks/transactions-involving-crypto-assets

## 4. Gambling / wagering / prize-promotion analysis

The current evaluation is **free**, which removes a user-paid entry fee from the model and may reduce risk under laws that require consideration as an element of gambling. That does not settle the issue nationwide. State definitions of wager, prize, consideration, skill contest, and gambling vary, and the later funded-account/profit-sharing contract has real economic value.

Engineering assumption: PAPER must not charge an evaluation fee, sell extra attempts, sell drawdown resets, or otherwise introduce paid consideration without a fresh legal review. The 24-hour retry cooldown is a product/risk rule, not a purchasable bypass.

Counsel should review the free evaluation and funded payout model state-by-state before the funded program is offered to all 50 states. International availability requires separate country restrictions.

## 5. Money transmission / custody

FinCEN's 2013 convertible-virtual-currency guidance says a person who is only a **user** of virtual currency is not an MSB on that basis, while an **administrator or exchanger** that accepts and transmits convertible virtual currency, or buys/sells it as a business, can be a money transmitter unless an exemption or limitation applies. The exact facts of PAPER's custody, routing, treasury ownership, payout flow, and relationship to traders require counsel analysis.

Planned funded wallets materially increase this issue because PAPER would control wallets, move real crypto, and send payouts to user-controlled wallets. Calling the capital “PAPER's own money” does not by itself resolve federal or state money-transmission analysis.

Texas Department of Banking states that Chapter 152 generally requires a license to engage in money-services business in Texas and that a business engaging in money transmission must have a money-transmission license unless an exemption applies. PAPER should obtain a written legal analysis and, if appropriate, a regulator determination or licensing strategy before custody/payout activation.

**Sources:**
- FinCEN FIN-2013-G001: https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-persons-administering
- Texas Department of Banking — Notice to Applicants: https://www.dob.texas.gov/applications-forms-publications/notice-applicants
- Texas Department of Banking — Money Services Businesses: https://dob.texas.gov/money-services-businesses

## 6. AML/KYC timing

### Current free PAPER-only / evaluation phase
PAPER-only trading uses simulated money and should not collect identity documents merely to make the demo/evaluation look “compliant.” A recoverable email or configured X identity is required before evaluation entry for account continuity and abuse controls; that is not represented as KYC.

### Before real funded activation
KYC/AML must be implemented and legally reviewed before `real_funded_activation` is enabled. At minimum the production design should support identity verification, sanctions screening, duplicate-identity controls, age eligibility, jurisdiction restrictions, and ongoing risk review appropriate to the final legal classification.

### Before payout
No real payout should be signed unless the funded account satisfies the required KYC/AML state, payout-wallet ownership is cryptographically verified, sanctions/jurisdiction checks are current, account abuse controls pass, and any required tax-information workflow is complete.

### If a paid evaluation is introduced later
Move KYC/AML/legal review earlier. Taking money from users to enter an evaluation changes the risk profile and should not inherit the free-evaluation assumptions in this document.

## 7. Custody and signing controls

Planned architecture assumptions requiring legal/security approval before activation:
- one Turnkey-controlled Solana wallet per funded account;
- no private-key export to traders;
- no arbitrary transfer or principal-withdrawal capability for traders;
- server-authorized transaction policy with allowlisted programs;
- 25% concentration/transaction limits, 3% default and 5% maximum slippage, risk blocklist, and emergency pause;
- no plaintext custody private keys in GitHub, Vercel client variables, Supabase public tables, logs, analytics, or source control;
- weekly payout calculation is automatic but a human admin approves the transfer;
- second approver required above the configured large-transfer threshold (initial product target: $2,000);
- immutable audit record of the request, approvals, signer action, chain signature, confirmation, retries, and final status.

These controls mitigate operational risk; they do **not** determine whether PAPER is legally a custodian, money transmitter, broker, dealer, adviser, or other regulated entity.

## 8. Tax / reporting

V1 should retain authoritative trade, settlement, payout, wallet, and transaction-signature records sufficient to support later tax/reporting integration. Actual U.S. information-return obligations and international reporting are deferred pending entity formation, payout classification, user residency rules, and counsel/tax-adviser review.

## 9. International restrictions

“Global except restricted jurisdictions” is a product goal, not a compliance determination. Before real-money launch PAPER needs a jurisdiction matrix covering at least sanctions, crypto custody/trading restrictions, marketing restrictions, age rules, payout restrictions, privacy, tax/reporting, and local licensing. The default real-funded state must remain unavailable in a jurisdiction until that jurisdiction is affirmatively approved.

## 10. Engineering launch gates

Real funded trading and payouts must remain disabled unless all applicable launch gates are true:

- `legal_review_complete`
- `legal_entity_ready`
- `kyc_provider_configured`
- `aml_sanctions_controls_ready`
- `jurisdiction_allowlist_ready`
- `turnkey_signing_enabled`
- `custody_security_review_complete`
- `treasury_capital_available`
- `real_funded_activation`
- `real_payouts_enabled`

The current database intentionally defaults real-funded activation, real payouts, KYC-provider configured, and Turnkey signing to **false**. No UI state, admin click, leaderboard rank, or evaluation pass may silently bypass those server-controlled gates.

## 11. Legal assumptions that must remain visible in code/review

1. Free simulated PAPER trading is not being treated as custody or a real trade.
2. Evaluation marks and pass/fail decisions must be server-authoritative; client portfolio snapshots are analytics only.
3. Passing an evaluation is not a promise or debt for a funded account.
4. KYC is deferred only because real funding is disabled; it is not a conclusion that KYC is unnecessary for the eventual funded product.
5. PAPER's proposed ownership of funded wallets is not a conclusion that money-transmission/custody law does not apply.
6. Supporting a token is not a legal determination that the token is not a security or otherwise unrestricted.
7. A free evaluation reduces but does not resolve gambling/contest-law questions.
8. My Forex Funds is a cautionary comparison, not a dispositive legal holding on PAPER's spot-Solana model, and its 2025 dismissal/sanctions history must be acknowledged.

## 12. Required professional review before real launch

Because the planned operator is in Texas, intends all 50 states plus international users, and plans custody-controlled real trading plus performance-based payouts, PAPER should retain U.S. counsel with crypto/fintech, commodities/securities, payments/MSB, and state-regulatory experience **before any real funded wallet is activated or any real payout is promised**. International rollout should be limited to jurisdictions affirmatively approved by counsel.


## 13. Part 4 implementation state — Sumsub and Turnkey

Engineering now has a provider-neutral compliance data model plus a Sumsub adapter. The adapter generates short-lived applicant WebSDK tokens server-side and accepts only HMAC-verified Sumsub webhook payloads. PAPER stores the provider applicant/reference ID, review state, reject labels, country/region needed for jurisdiction screening, and an age-18-or-older boolean. PAPER does **not** copy identity-document images, document numbers, selfie media, raw DOB, or other KYC source files into the application database.

An approved KYC result does not activate a funded account. Separate AML/sanctions, age, jurisdiction, custody, treasury, legal, and server feature gates must also pass. Jurisdictions fail closed: a country/region is not real-funded eligible unless a rule has been affirmatively approved by counsel and is effective.

The Turnkey adapter provisions one Solana wallet per eligible funded user only after the legal/KYC/AML/jurisdiction/custody-review gates are open. PAPER stores only the Turnkey organization/wallet identifiers, public Solana address, and approved policy reference. Database constraints prohibit marking a custody wallet as exportable, arbitrary-transfer capable, or principal-withdrawable.

The staging environment intentionally has no Sumsub or Turnkey production credentials configured, and all real-money database gates remain false.

## 14. Part 5 implementation state — funded risk and settlement

The funded-account engine is installed in isolated staging with real execution disabled. Server/database controls now encode:
- $1,000 initial funded capital, followed by $2,500 / $5,000 / $10,000 / $25,000 scale tiers;
- 15% continuously trailing funded drawdown;
- 5% funded-capital UTC daily-loss limit;
- immediate account closure and a 14-day requalification cooldown on breach;
- 25% funded-entry and token concentration limits and five open positions maximum;
- 1% PAPER protocol fee;
- 3% default / 5% hard maximum slippage;
- fresh risk data required before a future funded buy;
- future funded buys blocked by the risk engine while PAPER simulation remains separate;
- Friday 17:00 UTC settlement;
- flat positions before settlement;
- high-water-mark profit calculation;
- $25 minimum trader payout;
- 90% trader / 10% PAPER split;
- USDC default or SOL payout preference;
- PAPER network fees recorded separately and not deducted from trader equity;
- post-payout reset to the funded scale amount rather than compounding;
- first admin approval for every payout and a distinct second admin above $2,000;
- server-side confirmation/finalization records.

Continuous funded risk monitoring is active in staging. Breaches queue any remaining open funded positions for controlled liquidation processing. The real transaction-signing/broadcast adapter is implemented in the branch but is not deployed or enabled while launch gates and the independent server kill switch remain off.

## 15. Secret/data handling rules

The following values are server-only secrets and must never be exposed through browser bundles, `NEXT_PUBLIC_*` variables, analytics, logs, screenshots, or repository commits:
- Sumsub app token, API secret, and webhook secret;
- Turnkey API private key and signing configuration;
- Supabase service-role key;
- private Solana RPC credentials;
- any future payout-treasury signing material.

Provider API public identifiers may still be operationally sensitive and should be kept in the same secret manager unless a provider explicitly requires client exposure.

The application-level `PAPER_REAL_MONEY_SERVER_ENABLED` switch defaults to false. Even when that switch is eventually enabled, all database launch gates in Section 10 must independently be true before real-money execution can proceed.
