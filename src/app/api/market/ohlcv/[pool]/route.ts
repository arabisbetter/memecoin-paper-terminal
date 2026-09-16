import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type GeckoResponse = {
  data?: {
    attributes?: {
      ohlcv_list?: Array<[number, number, number, number, number, number]>
    }
  }
}

const validTimeframes = new Map([
  ['1m', ['minute', '1']],
  ['5m', ['minute', '5']],
  ['15m', ['minute', '15']],
  ['30m', ['minute', '30']],
  ['1h', ['hour', '1']],
] as const)

export async function GET(req: NextRequest, ctx: { params: Promise<{ pool: string }> }) {
  const { pool } = await ctx.params
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,60}$/.test(pool)) {
    return NextResponse.json({ error: 'Invalid pool address' }, { status: 400 })
  }

  const tf = req.nextUrl.searchParams.get('tf') || '1m'
  const config = validTimeframes.get(tf as '1m' | '5m' | '15m' | '30m' | '1h') || validTimeframes.get('1m')!
  const [timeframe, aggregate] = config

  try {
    const url = new URL(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(pool)}/ohlcv/${timeframe}`)
    url.searchParams.set('aggregate', aggregate)
    url.searchParams.set('limit', '180')
    url.searchParams.set('currency', 'usd')
    url.searchParams.set('token', 'base')
    url.searchParams.set('include_empty_intervals', 'false')

    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`OHLCV ${response.status}`)

    const json = (await response.json()) as GeckoResponse
    const raw = json.data?.attributes?.ohlcv_list || []
    const candles = raw
      .map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }))
      .filter((c) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite))
      .sort((a, b) => a.time - b.time)

    return NextResponse.json({ candles, timeframe: tf, source: 'geckoterminal', live: true })
  } catch (error) {
    console.error('ohlcv_feed_error', { pool, tf, error })
    return NextResponse.json(
      { candles: [], error: error instanceof Error ? error.message : 'chart unavailable' },
      { status: 502 },
    )
  }
}
