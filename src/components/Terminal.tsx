"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { MarketToken } from "@/lib/types";

type DbPosition = {
  id: string;
  token_id: string;
  quantity_tokens: number;
  cost_basis_sol: number;
  average_entry_price_usd: number;
  average_entry_mc_usd: number | null;
  realized_pnl_sol: number;
  opened_at: string;
  tokens: { mint_address: string; ticker: string | null; name: string | null; image_url: string | null } | null;
};

type LivePosition = DbPosition & { current?: MarketToken };

const money = (n:number) => !Number.isFinite(n) ? "—" : n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${n.toFixed(n < 1 ? 6 : 2)}`;
const pct = (n:number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const short = (s:string) => s.length > 10 ? `${s.slice(0,5)}…${s.slice(-4)}` : s;

export default function Terminal() {
  const [tokens,setTokens] = useState<MarketToken[]>([]);
  const [selected,setSelected] = useState<MarketToken|null>(null);
  const [amount,setAmount] = useState(1);
  const [sellPct,setSellPct] = useState(100);
  const [side,setSide] = useState<"buy"|"sell">("buy");
  const [positions,setPositions] = useState<LivePosition[]>([]);
  const [paperCash,setPaperCash] = useState<number|null>(null);
  const [user,setUser] = useState<User|null>(null);
  const [wallet,setWallet] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [query,setQuery] = useState("");
  const [quote,setQuote] = useState<string>("");

  const supabase = useMemo(() => {
    try { return createClient(); } catch { return null; }
  }, []);

  const loadAccount = useCallback(async () => {
    if (!supabase) return;
    const { data: { user: nextUser } } = await supabase.auth.getUser();
    setUser(nextUser ?? null);
    if (!nextUser) {
      setPaperCash(null);
      setPositions([]);
      return;
    }

    const [{ data: profile }, { data: dbPositions }] = await Promise.all([
      supabase.from("profiles").select("paper_cash_sol,wallet_address").eq("id", nextUser.id).single(),
      supabase.from("paper_positions")
        .select("id,token_id,quantity_tokens,cost_basis_sol,average_entry_price_usd,average_entry_mc_usd,realized_pnl_sol,opened_at,tokens(mint_address,ticker,name,image_url)")
        .eq("user_id", nextUser.id)
        .eq("status", "open")
        .order("opened_at", { ascending: false }),
    ]);

    if (profile) {
      setPaperCash(Number(profile.paper_cash_sol));
      setWallet(profile.wallet_address || "");
    }

    const base = (dbPositions || []) as unknown as DbPosition[];
    const live = await Promise.all(base.map(async (p) => {
      const mint = p.tokens?.mint_address;
      if (!mint) return p;
      try {
        const r = await fetch(`/api/market/token/${mint}`, { cache: "no-store" });
        if (!r.ok) return p;
        const j = await r.json();
        return { ...p, current: j.token as MarketToken };
      } catch { return p; }
    }));
    setPositions(live);
  }, [supabase]);

  async function refreshFeed(){
    try{
      const r=await fetch("/api/market/latest",{cache:"no-store"}); const j=await r.json();
      if(!r.ok) throw new Error(j.error||"feed unavailable");
      setTokens(j.tokens||[]); setError("");
      setSelected((cur)=>cur ? (j.tokens||[]).find((t:MarketToken)=>t.mint===cur.mint)||cur : (j.tokens||[])[0]||null);
    }catch(e){setError(e instanceof Error?e.message:"feed unavailable")}
  }

  useEffect(()=>{
    refreshFeed();
    const id=setInterval(refreshFeed,10000);
    return()=>clearInterval(id)
  },[]);

  useEffect(()=>{
    if(!selected)return;
    const id=setInterval(async()=>{
      try{
        const r=await fetch(`/api/market/token/${selected.mint}`,{cache:"no-store"});
        if(!r.ok)return;
        const j=await r.json();
        if(j.token)setSelected(j.token)
      }catch{}
    },3000);
    return()=>clearInterval(id)
  },[selected?.mint]);

  useEffect(() => {
    if (!supabase) return;
    loadAccount();
    const { data: listener } = supabase.auth.onAuthStateChange(() => { void loadAccount(); });
    return () => listener.subscription.unsubscribe();
  }, [supabase, loadAccount]);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => { void loadAccount(); }, 15000);
    return () => clearInterval(id);
  }, [user, loadAccount]);

  const visible=useMemo(()=>tokens.filter(t=>!query||t.symbol.toLowerCase().includes(query.toLowerCase())||t.name.toLowerCase().includes(query.toLowerCase())||t.mint.includes(query)),[tokens,query]);

  async function connectWallet(){
    if (!supabase) { setQuote("Supabase environment is not configured yet."); return; }
    try {
      setBusy(true); setQuote("");
      const provider = (window as unknown as { solana?: { connect: () => Promise<{ publicKey?: { toString: () => string } }> } }).solana;
      if (!provider) throw new Error("Install or open a Solana wallet such as Phantom or Backpack.");
      const connection = await provider.connect();
      const walletAddress = connection?.publicKey?.toString?.() || "";
      const { data, error: signInError } = await supabase.auth.signInWithWeb3({
        chain: "solana",
        statement: "Sign in to the memecoin PAPER trading terminal. No real token trade is submitted by this app.",
      });
      if (signInError) throw signInError;
      const authUser = data.user;
      if (authUser && walletAddress) {
        await supabase.from("profiles").update({ wallet_address: walletAddress, updated_at: new Date().toISOString() }).eq("id", authUser.id);
      }
      await loadAccount();
    } catch(e) {
      setQuote(e instanceof Error ? e.message : "Wallet sign-in failed");
    } finally { setBusy(false); }
  }

  async function disconnect(){
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null); setWallet(""); setPaperCash(null); setPositions([]);
  }

  async function executePaperTrade(){
    if(!selected || !supabase)return;
    if(!user){ setQuote("Connect your Solana wallet first."); return; }
    setBusy(true); setQuote("");
    try {
      const payload = side === "buy"
        ? { mint:selected.mint, side:"buy", amountSol:amount }
        : { mint:selected.mint, side:"sell", sellPct };
      const { data, error: fnError } = await supabase.functions.invoke("paper-trade", { body: payload });
      if(fnError) throw fnError;
      if(data?.error) throw new Error(data.error);
      const impact = Number(data?.fill?.priceImpactPct || 0);
      const fillMc = Number(data?.fill?.simulatedFillMcUsd || 0);
      const fee = Number(data?.fill?.feeSol || 0);
      setQuote(`${side === "buy" ? "PAPER BUY" : "PAPER SELL"} FILLED • impact ${impact.toFixed(2)}% • fill MC ${money(fillMc)} • fee ${fee.toFixed(4)} PAPER SOL`);
      await loadAccount();
    } catch(e) {
      setQuote(e instanceof Error ? e.message : "PAPER order rejected");
    } finally { setBusy(false); }
  }

  const selectedPosition = selected ? positions.find(p=>p.tokens?.mint_address===selected.mint) : undefined;
  const portfolioUsd = useMemo(() => {
    const cashUsd = (paperCash ?? 0) * 200;
    const positionUsd = positions.reduce((sum,p)=>sum + (p.current ? Number(p.quantity_tokens)*p.current.priceUsd : Number(p.cost_basis_sol)*200),0);
    return cashUsd + positionUsd;
  },[paperCash,positions]);

  return <div className="shell">
    <header className="topbar">
      <div className="brand">PAPER<span>.FUN</span></div><div className="paper-pill">PAPER ONLY</div>
      <nav className="nav"><Link className="active" href="/">Terminal</Link><Link href="/leaderboards">Leaderboards</Link><Link href="/challenges">Challenges</Link><Link href="/profile">Profile</Link></nav>
      <div className="spacer"/><input className="search" placeholder="Ticker / mint" value={query} onChange={e=>setQuery(e.target.value)}/>
      <div className="balance">Portfolio <b>{user ? `${money(portfolioUsd)} PAPER` : "SIGN IN"}</b></div>
      {user ? <button className="connect" onClick={disconnect} title={wallet || user.id}>{wallet ? short(wallet) : "Disconnect"}</button> : <button className="connect" onClick={connectWallet} disabled={busy}>{busy?"Connecting…":"Connect Wallet"}</button>}
    </header>

    <main className="terminal">
      <aside className="feed">
        <div className="section-head"><span className="dot"/>LIVE MEMECOINS</div>
        <div className="tabs"><button className="tab active">New</button><button className="tab">Trending</button><button className="tab">Final Stretch</button><button className="tab">Migrated</button></div>
        {error&&<div className="error">Live feed: {error}</div>}
        <div className="token-list">
          {!tokens.length&&!error&&<div className="loading">Loading real Solana market data…</div>}
          {visible.map(t=><button key={t.mint} className={`token-row ${selected?.mint===t.mint?"selected":""}`} onClick={()=>setSelected(t)}>
            <div className="avatar">{t.image?<img src={t.image} alt=""/>:t.symbol.slice(0,2)}</div>
            <div><div className="token-name">${t.symbol} <span style={{color:'#59655e',fontWeight:500}}>{t.name}</span></div><div className="token-meta">MC {money(t.marketCap)} · LIQ {money(t.liquidityUsd)} · {t.dexId||"Solana"}</div></div>
            <div className="price"><div>{money(t.priceUsd)}</div><div className={t.priceChange24h>=0?"gain":"loss"}>{pct(t.priceChange24h)}</div></div>
          </button>)}
        </div>
      </aside>

      <section className="center">
        <div className="token-head">{selected?<><div className="avatar" style={{width:26,height:26}}>{selected.image?<img src={selected.image} alt=""/>:selected.symbol.slice(0,2)}</div><span className="symbol">${selected.symbol}</span><span className="meta">{selected.name} · {short(selected.mint)}</span><span className="spacer"/><strong>{money(selected.marketCap)} MC</strong></>:<span>Select a live memecoin</span>}</div>
        <div className="chart"><div className="chart-grid"/><div className="chart-empty">{selected?<div><strong style={{fontSize:24,color:'white'}}>{money(selected.priceUsd)}</strong><br/><span className={selected.priceChange24h>=0?"gain":"loss"}>{pct(selected.priceChange24h)} 24H</span><br/><br/>Live token pricing refreshes every 3 seconds.<br/>Full live candles are the next market-ingestion step.</div>:"Choose a token from the feed"}</div></div>
        <div>
          <div className="metrics">{[["Market Cap",selected?money(selected.marketCap):"—"],["Liquidity",selected?money(selected.liquidityUsd):"—"],["24H Volume",selected?money(selected.volume24h):"—"],["24H Trades",selected?`${selected.buys24h+selected.sells24h}`:"—"]].map(([l,v])=><div className="metric" key={l}><label>{l}</label><strong>{v}</strong></div>)}</div>
          <div className="positions"><div className="pos-head"><span>Paper Position</span><span>Cost</span><span>Entry MC</span><span>Current MC</span><span>PAPER P&L</span></div>
            {!user?<div className="loading">Connect a wallet to save PAPER positions.</div>:positions.length===0?<div className="loading">No open PAPER positions yet.</div>:positions.map(p=>{
              const currentPrice=p.current?.priceUsd || Number(p.average_entry_price_usd);
              const roi=(currentPrice/Number(p.average_entry_price_usd)-1)*100;
              return <div className="pos-row" key={p.id}><b>${p.tokens?.ticker||"MEME"}</b><span>{Number(p.cost_basis_sol).toFixed(3)} PAPER SOL</span><span>{money(Number(p.average_entry_mc_usd||0))}</span><span>{money(p.current?.marketCap||0)}</span><span className={roi>=0?"gain":"loss"}>{pct(roi)} PAPER</span></div>
            })}
          </div>
        </div>
      </section>

      <aside className="trade-panel">
        <div className="section-head">INSTANT PAPER TRADE</div>
        <div className="panel-body">
          <div className="side-switch"><button className={side==="buy"?"buy":""} onClick={()=>setSide("buy")}>BUY PAPER</button><button className={side==="sell"?"sell":""} onClick={()=>setSide("sell")}>SELL PAPER</button></div>
          {side==="buy"?<>
            <label style={{fontSize:10,color:'#748078'}}>SIZE (PAPER SOL)</label>
            <input className="amount" type="number" min="0.001" value={amount} onChange={e=>setAmount(Math.max(.001,Number(e.target.value)||0))}/>
            <div className="preset-grid">{[.1,.5,1,5].map(n=><button key={n} className="preset" onClick={()=>setAmount(n)}>{n} PAPER SOL</button>)}</div>
          </>:<>
            <label style={{fontSize:10,color:'#748078'}}>SELL PAPER POSITION</label>
            <div className="preset-grid">{[25,50,75,100].map(n=><button key={n} className={`preset ${sellPct===n?"selected":""}`} onClick={()=>setSellPct(n)}>{n}%</button>)}</div>
            {!selectedPosition&&<div className="disclaimer">No open PAPER position in this token.</div>}
          </>}
          <button className="paper-buy" onClick={executePaperTrade} disabled={!selected||busy||(side==="sell"&&!selectedPosition)}>{busy?"VERIFYING LIVE MARKET…":`${side==="buy"?"PAPER BUY":"PAPER SELL"} ${selected?`$${selected.symbol}`:"TOKEN"}`}</button>
          {quote&&<div className="disclaimer">{quote}</div>}
          <div className="disclaimer"><b>PAPER TRADE</b><br/>No real token order is submitted. The server re-checks the real market and simulates liquidity impact before recording the PAPER fill.</div>
          <div className="challenge"><h4>$100K → $10M CHALLENGE</h4><p>Start with $100,000 PAPER. Reach $10,000,000 using live memecoins.</p><div className="progress"><div/></div><p>$100K / $10M · <b style={{color:'#f7c95f'}}>0.1 REAL SOL weekly pool</b></p></div>
        </div>
      </aside>
    </main>
    <footer className="footer"><span className="status">● REAL MARKET DATA</span><span>All balances, orders and P&L on this terminal are PAPER.</span><span className="spacer"/><span>{paperCash===null?"No PAPER account loaded":`${paperCash.toFixed(3)} PAPER SOL cash`}</span></footer>
  </div>
}
