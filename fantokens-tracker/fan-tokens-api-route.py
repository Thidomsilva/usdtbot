"""
ADICIONE ao final de api/index.py (antes do bloco if __name__ == "__main__":)

Adiciona o endpoint GET /api/fantokens com suporte a 11 corretoras:
Binance, Coinbase, Kraken, Bybit, BingX, Mercado Bitcoin,
OKX, KuCoin, Bitget, Novadax, Gate.io
"""

# ─── Fan Token config ─────────────────────────────────────────────────────────

FAN_TOKEN_LIST = [
    # (coingecko_id, symbol, team, tier)
    ("santos-fc-fan-token",            "SANTOS", "Santos FC",        1),
    ("og-fan-token",                   "OG",     "OG Esports",       1),
    ("fc-porto",                       "PORTO",  "FC Porto",          1),
    ("lazio-fan-token",                "LAZIO",  "SS Lazio",          1),
    ("argentina-fan-token",            "ARG",    "AFA",               1),
    ("as-roma-fan-token",              "ASR",    "AS Roma",           2),
    ("paris-saint-germain-fan-token",  "PSG",    "PSG",               2),
    ("fc-barcelona-fan-token",         "BAR",    "FC Barcelona",      2),
    ("galatasaray-fan-token",          "GAL",    "Galatasaray",       2),
    ("ac-milan-fan-token",             "ACM",    "AC Milan",          2),
    ("juventus-fan-token",             "JUV",    "Juventus",          3),
    ("manchester-city-fan-token",      "CITY",   "Man City",          3),
    ("atletico-de-madrid-fan-token",   "ATM",    "Atlético Madrid",   3),
    ("arsenal-fan-token",              "AFC",    "Arsenal",           3),
    ("inter-milan-fan-token",          "INTER",  "Inter Milan",       3),
    ("flamengo-fan-token",             "MENGO",  "Flamengo",          4),
    ("corinthians-fan-token",          "SCCP",   "Corinthians",       4),
    ("trabzonspor-fan-token",          "TRA",    "Trabzonspor",       4),
    ("alpine-f1-team-fan-token",       "ALPINE", "Alpine F1",         4),
    ("ufc-fan-token",                  "UFC",    "UFC",               4),
]

FT_EXCHANGE_META = {
    "binance":        {"label": "Binance",        "flag": "🟡", "pix": False, "accepts_brl": False, "estimated": False},
    "coinbase":       {"label": "Coinbase",        "flag": "🔵", "pix": False, "accepts_brl": False, "estimated": True },
    "kraken":         {"label": "Kraken",          "flag": "🟣", "pix": False, "accepts_brl": False, "estimated": True },
    "bybit":          {"label": "Bybit",           "flag": "🟠", "pix": False, "accepts_brl": False, "estimated": False},
    "bingx":          {"label": "BingX",           "flag": "🔷", "pix": False, "accepts_brl": False, "estimated": True },
    "mercadobitcoin": {"label": "Mercado Bitcoin", "flag": "🇧🇷", "pix": True,  "accepts_brl": True,  "estimated": False},
    "okx":            {"label": "OKX",             "flag": "⚫", "pix": False, "accepts_brl": False, "estimated": False},
    "kucoin":         {"label": "KuCoin",          "flag": "🟢", "pix": False, "accepts_brl": False, "estimated": False},
    "bitget":         {"label": "Bitget",          "flag": "🔵", "pix": False, "accepts_brl": False, "estimated": False},
    "novadax":        {"label": "Novadax",         "flag": "🇧🇷", "pix": True,  "accepts_brl": True,  "estimated": False},
    "gate":           {"label": "Gate.io",         "flag": "🌐", "pix": False, "accepts_brl": False, "estimated": False},
}

FT_TIMEOUT = 7.0


# ─── Per-exchange fetchers (SYMBOL/USDT → convertido para BRL) ───────────────

async def ftx_binance(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
    r = await client.get(f"https://api.binance.com/api/v3/ticker/24hr?symbol={symbol}USDT", timeout=FT_TIMEOUT)
    d = r.json()
    if "lastPrice" not in d:
        return None
    return {"price_usdt": float(d["lastPrice"]), "volume": float(d["quoteVolume"]), "change_24h": float(d["priceChangePercent"]), "high": float(d["highPrice"]), "low": float(d["lowPrice"])}


async def ftx_coinbase(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
    """Coinbase Advanced API — SYMBOL-USDT."""
    r = await client.get(f"https://api.coinbase.com/api/v3/brokerage/products/{symbol}-USDT", timeout=FT_TIMEOUT)
    d = r.json()
    if "price" not in d:
        return None
    return {"price_usdt": float(d["price"]), "volume": float(d.get("volume_24h", 0) or 0), "change_24h": float(d.get("price_percentage_change_24h", 0) or 0), "high": 0.0, "low": 0.0}


async def ftx_kraken(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
    """Kraken — SYMBOLUSDT pair."""
    r = await client.get(f"https://api.kraken.com/0/public/Ticker?pair={symbol}USDT", timeout=FT_TIMEOUT)
    d = r.json()
    if d.get("error") or not d.get("result"):
        return None
    key = list(d["result"].keys())[0]
    t = d["result"][key]
    last = float(t["c"][0])
    op = float(t["o"])
    change = (last - op) / op * 100 if op > 0 else 0
    return {"price_usdt": last, "volume": float(t["v"][1]), "change_24h": round(change, 4), "high": float(t["h"][1]), "low": float(t["l"][1])}


async def ftx_bybit(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
    r = await client.get(f"https://api.bybit.com/v5/market/tickers?category=spot&symbol={symbol}USDT", timeout=FT_TIMEOUT)
    d = r.json()
    items = d.get("result", {}).get("list", [])
    if not items:
        return None
    t = items[0]
    return {"price_usdt": float(t["lastPrice"]), "volume": float(t["volume24h"]), "change_24h": float(t["price24hPcnt"]) * 100, "high": float(t["highPrice24h"]), "low": float(t["lowPrice24h"])}


async def ftx_bingx(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
    """BingX spot — SYMBOL-USDT."""
    r = await client.get(f"https://open-api.bingx.com/openApi/spot/v1/ticker/24hr?symbol={symbol}-USDT", timeout=FT_TIMEOUT)
    d = r.json()
    data = d.get("data", {})
    if not data or not data.get("lastPrice"):
        return None
    return {"price_usdt": float(data["lastPrice"]), "volume": float(data.get("quoteVolume", 0) or 0), "change_24h": float(data.get("priceChangePercent", 0) or 0), "high": float(data.get("highPrice", 0) or 0), "low": float(data.get("lowPrice", 0) or 0)}


async def ftx_mercadobitcoin(client: httpx.AsyncClient, symbol: str, usd_brl: float) -> Optional[dict]:
    """Mercado Bitcoin — preço já em BRL."""
    r = await client.get(f"https://www.mercadobitcoin.net/api/{symbol}/ticker/", timeout=FT_TIMEOUT)
    d = r.json()["ticker"]
    price_brl = float(d["last"])
    price_usdt = price_brl / usd_brl
    op = float(d.get("open", price_brl) or price_brl)
    change = (price_brl - op) / op * 100 if op > 0 else 0
    return {"price_usdt": price_usdt, "price_brl_direct": price_brl, "volume": float(d.get("vol", 0) or 0) * price_brl, "change_24h": round(change, 4), "high": float(d.get("high", 0) or 0), "low": float(d.get("low", 0) or 0)}


async def ftx_okx(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
    """OKX spot — SYMBOL-USDT."""
    r = await client.get(f"https://www.okx.com/api/v5/market/ticker?instId={symbol}-USDT", timeout=FT_TIMEOUT)
    d = r.json()
    data = d.get("data", [])
    if not data:
        return None
    t = data[0]
    op = float(t.get("open24h", t["last"]) or t["last"])
    last = float(t["last"])
    change = (last - op) / op * 100 if op > 0 else 0
    return {"price_usdt": last, "volume": float(t.get("volCcy24h", 0) or 0), "change_24h": round(change, 4), "high": float(t.get("high24h", 0) or 0), "low": float(t.get("low24h", 0) or 0)}


async def ftx_kucoin(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
    """KuCoin — SYMBOL-USDT."""
    r = await client.get(f"https://api.kucoin.com/api/v1/market/stats?symbol={symbol}-USDT", timeout=FT_TIMEOUT)
    d = r.json().get("data", {})
    if not d or not d.get("last"):
        return None
    last = float(d["last"])
    op = float(d.get("open", last) or last)
    change = (last - op) / op * 100 if op > 0 else 0
    return {"price_usdt": last, "volume": float(d.get("volValue", 0) or 0), "change_24h": round(change, 4), "high": float(d.get("high", 0) or 0), "low": float(d.get("low", 0) or 0)}


async def ftx_bitget(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
    """Bitget spot — SYMBOLUSDT."""
    r = await client.get(f"https://api.bitget.com/api/v2/spot/market/tickers?symbol={symbol}USDT", timeout=FT_TIMEOUT)
    d = r.json()
    data = d.get("data", [])
    if not data:
        return None
    t = data[0]
    return {"price_usdt": float(t["lastPr"]), "volume": float(t.get("quoteVolume", 0) or 0), "change_24h": float(t.get("change24h", 0) or 0) * 100, "high": float(t.get("high24h", 0) or 0), "low": float(t.get("low24h", 0) or 0)}


async def ftx_novadax(client: httpx.AsyncClient, symbol: str, usd_brl: float) -> Optional[dict]:
    """Novadax — SYMBOL_BRL, convertido a USDT."""
    r = await client.get(f"https://api.novadax.com/v1/market/ticker?symbol={symbol}_BRL", timeout=FT_TIMEOUT)
    d = r.json().get("data", {})
    if not d or not d.get("lastPrice"):
        return None
    price_brl = float(d["lastPrice"])
    price_usdt = price_brl / usd_brl
    op = float(d.get("open24h", price_brl) or price_brl)
    change = (price_brl - op) / op * 100 if op > 0 else 0
    return {"price_usdt": price_usdt, "price_brl_direct": price_brl, "volume": float(d.get("volume24h", 0) or 0) * price_brl, "change_24h": round(change, 4), "high": float(d.get("high24h", 0) or 0) / usd_brl, "low": float(d.get("low24h", 0) or 0) / usd_brl}


async def ftx_gate(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
    """Gate.io — SYMBOL_USDT."""
    r = await client.get(f"https://api.gateio.ws/api/v4/spot/tickers?currency_pair={symbol}_USDT", timeout=FT_TIMEOUT)
    d = r.json()
    if not d or not isinstance(d, list):
        return None
    t = d[0]
    last = float(t["last"])
    op = float(t.get("open_24h", last) or last)
    change = (last - op) / op * 100 if op > 0 else 0
    return {"price_usdt": last, "volume": float(t.get("quote_volume", 0) or 0), "change_24h": round(change, 4), "high": float(t.get("high_24h", 0) or 0), "low": float(t.get("low_24h", 0) or 0)}


# ─── Dispatch per exchange ────────────────────────────────────────────────────

FT_FETCHERS = {
    "binance":        (ftx_binance,        False),
    "coinbase":       (ftx_coinbase,       False),
    "kraken":         (ftx_kraken,         False),
    "bybit":          (ftx_bybit,          False),
    "bingx":          (ftx_bingx,          False),
    "mercadobitcoin": (ftx_mercadobitcoin, True ),
    "okx":            (ftx_okx,            False),
    "kucoin":         (ftx_kucoin,         False),
    "bitget":         (ftx_bitget,         False),
    "novadax":        (ftx_novadax,        True ),
    "gate":           (ftx_gate,           False),
}


async def fetch_token_on_exchange(
    client: httpx.AsyncClient,
    ex_id: str,
    symbol: str,
    usd_brl: float,
) -> dict:
    fn, needs_brl = FT_FETCHERS[ex_id]
    meta = FT_EXCHANGE_META[ex_id]
    try:
        raw = await (fn(client, symbol, usd_brl) if needs_brl else fn(client, symbol))
        if not raw:
            return {**meta, "exchange": ex_id, "status": "not_listed"}
        price_usdt = raw["price_usdt"]
        price_brl = raw.get("price_brl_direct") or price_usdt * usd_brl
        high_brl = raw["high"] * usd_brl if raw["high"] else price_brl
        low_brl = raw["low"] * usd_brl if raw["low"] else price_brl
        return {
            **meta,
            "exchange": ex_id,
            "status": "ok",
            "price_usdt": round(price_usdt, 6),
            "price_brl": round(price_brl, 4),
            "volume_24h_brl": round(raw["volume"] * usd_brl if not raw.get("price_brl_direct") else raw["volume"], 2),
            "change_24h": round(raw["change_24h"], 4),
            "high_24h_brl": round(high_brl, 4),
            "low_24h_brl": round(low_brl, 4),
        }
    except Exception as e:
        return {**meta, "exchange": ex_id, "status": "error", "error": str(e)}


def ft_best_arb(exchange_data: list[dict]) -> Optional[dict]:
    ok = [e for e in exchange_data if e.get("status") == "ok" and e.get("price_brl", 0) > 0]
    if len(ok) < 2:
        return None
    best = None
    for b in ok:
        for s in ok:
            if b["exchange"] == s["exchange"]:
                continue
            if s["price_brl"] <= b["price_brl"]:
                continue
            spread = (s["price_brl"] - b["price_brl"]) / b["price_brl"] * 100
            if best is None or spread > best["spread_pct"]:
                best = {
                    "buy_exchange": b["exchange"],
                    "buy_exchange_label": b["label"],
                    "sell_exchange": s["exchange"],
                    "sell_exchange_label": s["label"],
                    "buy_price_brl": b["price_brl"],
                    "sell_price_brl": s["price_brl"],
                    "spread_pct": round(spread, 4),
                    "profit_est_brl_per_100": round((100 / b["price_brl"]) * (s["price_brl"] - b["price_brl"]), 4),
                }
    return best


# ─── Route ────────────────────────────────────────────────────────────────────

@app.get("/api/fantokens")
async def get_fan_tokens():
    async with httpx.AsyncClient() as client:
        usd_brl = await get_usd_brl(client)

        async def fetch_one_token(cg_id: str, symbol: str, team: str, tier: int) -> dict:
            try:
                tasks = [
                    fetch_token_on_exchange(client, ex_id, symbol, usd_brl)
                    for ex_id in FT_FETCHERS
                ]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                exchange_data = []
                for r in results:
                    if isinstance(r, Exception):
                        continue
                    exchange_data.append(r)

                ok = [e for e in exchange_data if e.get("status") == "ok"]
                prices = [e["price_brl"] for e in ok]
                avg = round(sum(prices) / len(prices), 4) if prices else None

                return {
                    "id": cg_id,
                    "symbol": symbol,
                    "team": team,
                    "tier": tier,
                    "status": "ok",
                    "avg_price_brl": avg,
                    "exchanges_available": len(ok),
                    "exchanges": exchange_data,
                    "best_arb": ft_best_arb(exchange_data),
                }
            except Exception as e:
                return {"id": cg_id, "symbol": symbol, "team": team, "tier": tier, "status": "error", "error": str(e)}

        all_tasks = [fetch_one_token(cg, sym, team, tier) for cg, sym, team, tier in FAN_TOKEN_LIST]
        tokens = await asyncio.gather(*all_tasks)

    with_arb = [t for t in tokens if t.get("best_arb")]
    above_1 = [t for t in with_arb if t["best_arb"]["spread_pct"] >= 1]
    above_3 = [t for t in with_arb if t["best_arb"]["spread_pct"] >= 3]
    best = max(with_arb, key=lambda t: t["best_arb"]["spread_pct"], default=None)

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "usd_brl": usd_brl,
        "exchanges_monitored": list(FT_EXCHANGE_META.keys()),
        "summary": {
            "total_tokens": len(tokens),
            "with_arbitrage": len(with_arb),
            "above_1_pct": len(above_1),
            "above_3_pct": len(above_3),
            "usd_brl": usd_brl,
            "best_opportunity": {
                "symbol": best["symbol"],
                "team": best["team"],
                "spread_pct": best["best_arb"]["spread_pct"],
                "buy": best["best_arb"]["buy_exchange_label"],
                "sell": best["best_arb"]["sell_exchange_label"],
            } if best else None,
        },
        "tokens": list(tokens),
    }
