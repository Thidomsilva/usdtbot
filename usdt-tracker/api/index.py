from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx
import asyncio
from datetime import datetime, timezone
import time
from typing import Optional

app = FastAPI(title="USDT Price Tracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

TIMEOUT = 8.0
CACHE_TTL_SECONDS = 10
_CACHE = {"at": 0.0, "payload": None}
_FX_CACHE = {"at": 0.0, "usd_brl": None}


async def fetch_json(client: httpx.AsyncClient, url: str) -> dict:
    """Perform a GET request and return a JSON object with basic validation."""
    r = await client.get(url, timeout=TIMEOUT)
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, dict):
        raise ValueError("Unexpected JSON payload")
    return data


async def get_usd_brl(client: httpx.AsyncClient) -> float:
    now = time.time()
    cached = _FX_CACHE.get("usd_brl")
    if cached and (now - float(_FX_CACHE.get("at", 0.0))) < 60:
        return float(cached)

    payload = await fetch_json(client, "https://api.frankfurter.app/latest?from=USD&to=BRL")
    rate = float(payload.get("rates", {}).get("BRL", 0) or 0)
    if rate <= 0:
        raise ValueError("USD/BRL indisponivel")

    _FX_CACHE["usd_brl"] = rate
    _FX_CACHE["at"] = now
    return rate


# ── exchange fetchers ─────────────────────────────────────────────────────────

async def fetch_binance(client: httpx.AsyncClient) -> dict:
    """USDT/BRL price from Binance public API."""
    symbols = ["USDTBRL", "BRLUSDT"]
    d = None
    used_symbol = None
    for symbol in symbols:
        url = f"https://api.binance.com/api/v3/ticker/24hr?symbol={symbol}"
        candidate = await fetch_json(client, url)
        if isinstance(candidate, dict) and "lastPrice" in candidate:
            d = candidate
            used_symbol = symbol
            break

    if not d:
        raise ValueError("Binance ticker not available")

    last = float(d["lastPrice"])
    high = float(d["highPrice"])
    low = float(d["lowPrice"])
    change_pct = float(d["priceChangePercent"])

    # If only BRLUSDT exists, invert to represent USDT in BRL.
    if used_symbol == "BRLUSDT":
        if last <= 0 or high <= 0 or low <= 0:
            raise ValueError("Invalid Binance inverted ticker")
        price_brl = 1 / last
        high_24h = 1 / low
        low_24h = 1 / high
        change_24h = -change_pct
    else:
        price_brl = last
        high_24h = high
        low_24h = low
        change_24h = change_pct

    return {
        "price_brl": round(price_brl, 4),
        "volume_24h": float(d["quoteVolume"]),
        "change_24h": round(change_24h, 4),
        "high_24h": round(high_24h, 4),
        "low_24h": round(low_24h, 4),
        "pair": "USDT/BRL",
        "source_url": "https://www.binance.com/en/trade/USDT_BRL",
    }


async def fetch_novadax(client: httpx.AsyncClient) -> dict:
    """USDT/BRL from Novadax."""
    url = "https://api.novadax.com/v1/market/ticker?symbol=USDT_BRL"
    payload = await fetch_json(client, url)
    d = payload["data"]
    price_brl = float(d["lastPrice"])
    vol_brl = float(d.get("volume24h", 0) or 0)
    open_brl = float(d.get("open24h", price_brl) or price_brl)
    change = (price_brl - open_brl) / open_brl * 100 if open_brl > 0 else 0
    return {
        "price_brl": round(price_brl, 4),
        "volume_24h": vol_brl,
        "change_24h": round(change, 4),
        "high_24h": round(float(d.get("high24h", 0) or 0), 4),
        "low_24h": round(float(d.get("low24h", 0) or 0), 4),
        "pair": "USDT/BRL",
        "source_url": "https://novadax.com/pt-BR/trade/USDT-BRL",
    }


async def fetch_kucoin(client: httpx.AsyncClient) -> dict:
    """USDT/BRL from KuCoin public API."""
    url = "https://api.kucoin.com/api/v1/market/stats?symbol=USDT-BRL"
    payload = await fetch_json(client, url)
    data = payload.get("data", {})

    last = float(data.get("last") or 0)
    if last <= 0:
        raise ValueError("KuCoin ticker not available")

    change_rate = float(data.get("changeRate") or 0)

    return {
        "price_brl": round(last, 4),
        "volume_24h": float(data.get("volValue") or 0),
        "change_24h": round(change_rate * 100, 4),
        "high_24h": round(float(data.get("high") or 0), 4),
        "low_24h": round(float(data.get("low") or 0), 4),
        "pair": "USDT/BRL",
        "source_url": "https://www.kucoin.com/trade/USDT-BRL",
    }


async def fetch_mercadobitcoin(client: httpx.AsyncClient) -> dict:
    """USDT/BRL from Mercado Bitcoin."""
    url = "https://www.mercadobitcoin.net/api/USDT/ticker/"
    payload = await fetch_json(client, url)
    d = payload["ticker"]
    price_brl = float(d["last"])
    open_brl = float(d.get("open", price_brl) or price_brl)
    change = (price_brl - open_brl) / open_brl * 100 if open_brl > 0 else 0
    return {
        "price_brl": round(price_brl, 4),
        "volume_24h": float(d.get("vol", 0) or 0),
        "change_24h": round(change, 4),
        "high_24h": round(float(d.get("high", 0) or 0), 4),
        "low_24h": round(float(d.get("low", 0) or 0), 4),
        "pair": "USDT/BRL",
        "source_url": "https://www.mercadobitcoin.com.br/negociacoes/USDT",
    }


# ── route ────────────────────────────────────────────────────────────────────

EXCHANGE_FETCHERS = {
    "binance": fetch_binance,
    "kucoin": fetch_kucoin,
    "novadax": fetch_novadax,
    "mercadobitcoin": fetch_mercadobitcoin,
}

EXCHANGE_META = {
    "binance": {"label": "Binance", "flag": "🇧🇷"},
    "kucoin": {"label": "KuCoin", "flag": "🇧🇷"},
    "novadax": {"label": "Novadax", "flag": "🇧🇷"},
    "mercadobitcoin": {"label": "Mercado Bitcoin", "flag": "🇧🇷"},
}


async def safe_fetch(name, fn, client):
    try:
        data = await fn(client)
        return name, {"status": "ok", **data, **EXCHANGE_META[name]}
    except Exception as e:
        msg = str(e)
        if " 451" in msg:
            msg = "Indisponivel na regiao atual"
        elif "timed out" in msg.lower():
            msg = "Timeout na consulta da corretora"
        return name, {
            "status": "error",
            "error": msg,
            **EXCHANGE_META[name],
        }


@app.get("/api/prices")
async def get_prices():
    now = time.time()
    cached_payload = _CACHE.get("payload")
    cache_at = float(_CACHE.get("at", 0.0) or 0.0)
    if cached_payload and now - cache_at < CACHE_TTL_SECONDS:
        return cached_payload

    async with httpx.AsyncClient() as client:
        tasks = [
            safe_fetch(name, fn, client)
            for name, fn in EXCHANGE_FETCHERS.items()
        ]
        results_list = await asyncio.gather(*tasks)

    results = {name: data for name, data in results_list}
    ok = [r for r in results.values() if r["status"] == "ok"]
    prices = [r["price_brl"] for r in ok]

    summary = {}
    if prices:
        min_price = min(prices)
        max_price = max(prices)
        spread_pct = 0.0
        if min_price > 0:
            spread_pct = round((max_price - min_price) / min_price * 100, 5)

        summary = {
            "min": min_price,
            "max": max_price,
            "avg": round(sum(prices) / len(prices), 6),
            "spread_pct": spread_pct,
            "min_exchange": next(
                (r["label"] for r in ok if r["price_brl"] == min_price), ""
            ),
            "max_exchange": next(
                (r["label"] for r in ok if r["price_brl"] == max_price), ""
            ),
        }

    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ok_count": len(ok),
        "total_count": len(EXCHANGE_FETCHERS),
        "exchanges": results,
        "summary": summary,
    }
    _CACHE["payload"] = payload
    _CACHE["at"] = now
    return payload


@app.get("/api/health")
async def health():
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}


# Fan tokens tracker

FAN_TOKEN_LIST = [
    ("santos-fc-fan-token", "SANTOS", "Santos FC", 1),
    ("og-fan-token", "OG", "OG Esports", 1),
    ("fc-porto", "PORTO", "FC Porto", 1),
    ("lazio-fan-token", "LAZIO", "SS Lazio", 1),
    ("argentina-fan-token", "ARG", "AFA", 1),
    ("as-roma-fan-token", "ASR", "AS Roma", 2),
    ("paris-saint-germain-fan-token", "PSG", "PSG", 2),
    ("fc-barcelona-fan-token", "BAR", "FC Barcelona", 2),
    ("galatasaray-fan-token", "GAL", "Galatasaray", 2),
    ("ac-milan-fan-token", "ACM", "AC Milan", 2),
    ("juventus-fan-token", "JUV", "Juventus", 3),
    ("manchester-city-fan-token", "CITY", "Man City", 3),
    ("atletico-de-madrid-fan-token", "ATM", "Atletico Madrid", 3),
    ("arsenal-fan-token", "AFC", "Arsenal", 3),
    ("inter-milan-fan-token", "INTER", "Inter Milan", 3),
    ("flamengo-fan-token", "MENGO", "Flamengo", 4),
    ("corinthians-fan-token", "SCCP", "Corinthians", 4),
    ("trabzonspor-fan-token", "TRA", "Trabzonspor", 4),
    ("alpine-f1-team-fan-token", "ALPINE", "Alpine F1", 4),
    ("ufc-fan-token", "UFC", "UFC", 4),
]

FT_EXCHANGE_META = {
    "binance":        {"label": "Binance",        "pix": False, "accepts_brl": False, "estimated": False},
    "coinbase":       {"label": "Coinbase",       "pix": False, "accepts_brl": False, "estimated": True},
    "kraken":         {"label": "Kraken",         "pix": False, "accepts_brl": False, "estimated": True},
    "bybit":          {"label": "Bybit",          "pix": False, "accepts_brl": False, "estimated": False},
    "bingx":          {"label": "BingX",          "pix": False, "accepts_brl": False, "estimated": True},
    "mercadobitcoin": {"label": "Mercado Bitcoin", "pix": True,  "accepts_brl": True,  "estimated": False},
    "okx":            {"label": "OKX",            "pix": False, "accepts_brl": False, "estimated": False},
    "kucoin":         {"label": "KuCoin",         "pix": False, "accepts_brl": False, "estimated": False},
    "bitget":         {"label": "Bitget",         "pix": False, "accepts_brl": False, "estimated": False},
    "novadax":        {"label": "Novadax",        "pix": True,  "accepts_brl": True,  "estimated": False},
    "gate":           {"label": "Gate.io",        "pix": False, "accepts_brl": False, "estimated": False},
}

FT_TIMEOUT = 7.0


async def ftx_binance(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
    r = await client.get(f"https://api.binance.com/api/v3/ticker/24hr?symbol={symbol}USDT", timeout=FT_TIMEOUT)
    d = r.json()
    if "lastPrice" not in d:
        return None
    return {"price_usdt": float(d["lastPrice"]), "volume": float(d.get("quoteVolume", 0) or 0), "change_24h": float(d.get("priceChangePercent", 0) or 0), "high": float(d.get("highPrice", 0) or 0), "low": float(d.get("lowPrice", 0) or 0)}


async def ftx_coinbase(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
    r = await client.get(f"https://api.coinbase.com/api/v3/brokerage/products/{symbol}-USDT", timeout=FT_TIMEOUT)
    d = r.json()
    if "price" not in d:
        return None
    return {"price_usdt": float(d["price"]), "volume": float(d.get("volume_24h", 0) or 0), "change_24h": float(d.get("price_percentage_change_24h", 0) or 0), "high": 0.0, "low": 0.0}


async def ftx_kraken(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
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
    return {"price_usdt": float(t["lastPrice"]), "volume": float(t.get("volume24h", 0) or 0), "change_24h": float(t.get("price24hPcnt", 0) or 0) * 100, "high": float(t.get("highPrice24h", 0) or 0), "low": float(t.get("lowPrice24h", 0) or 0)}


async def ftx_bingx(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
    r = await client.get(f"https://open-api.bingx.com/openApi/spot/v1/ticker/24hr?symbol={symbol}-USDT", timeout=FT_TIMEOUT)
    d = r.json()
    data = d.get("data", {})
    if not data or not data.get("lastPrice"):
        return None
    return {"price_usdt": float(data["lastPrice"]), "volume": float(data.get("quoteVolume", 0) or 0), "change_24h": float(data.get("priceChangePercent", 0) or 0), "high": float(data.get("highPrice", 0) or 0), "low": float(data.get("lowPrice", 0) or 0)}


async def ftx_mercadobitcoin(client: httpx.AsyncClient, symbol: str, usd_brl: float) -> Optional[dict]:
    r = await client.get(f"https://www.mercadobitcoin.net/api/{symbol}/ticker/", timeout=FT_TIMEOUT)
    d = r.json().get("ticker", {})
    if not d.get("last"):
        return None
    price_brl = float(d["last"])
    price_usdt = price_brl / usd_brl
    op = float(d.get("open", price_brl) or price_brl)
    change = (price_brl - op) / op * 100 if op > 0 else 0
    return {"price_usdt": price_usdt, "price_brl_direct": price_brl, "volume": float(d.get("vol", 0) or 0) * price_brl, "change_24h": round(change, 4), "high": float(d.get("high", 0) or 0), "low": float(d.get("low", 0) or 0)}


async def ftx_okx(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
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
    r = await client.get(f"https://api.kucoin.com/api/v1/market/stats?symbol={symbol}-USDT", timeout=FT_TIMEOUT)
    d = r.json().get("data", {})
    if not d or not d.get("last"):
        return None
    last = float(d["last"])
    op = float(d.get("open", last) or last)
    change = (last - op) / op * 100 if op > 0 else 0
    return {"price_usdt": last, "volume": float(d.get("volValue", 0) or 0), "change_24h": round(change, 4), "high": float(d.get("high", 0) or 0), "low": float(d.get("low", 0) or 0)}


async def ftx_bitget(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
    r = await client.get(f"https://api.bitget.com/api/v2/spot/market/tickers?symbol={symbol}USDT", timeout=FT_TIMEOUT)
    d = r.json()
    data = d.get("data", [])
    if not data:
        return None
    t = data[0]
    return {"price_usdt": float(t["lastPr"]), "volume": float(t.get("quoteVolume", 0) or 0), "change_24h": float(t.get("change24h", 0) or 0) * 100, "high": float(t.get("high24h", 0) or 0), "low": float(t.get("low24h", 0) or 0)}


async def ftx_novadax(client: httpx.AsyncClient, symbol: str, usd_brl: float) -> Optional[dict]:
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
    r = await client.get(f"https://api.gateio.ws/api/v4/spot/tickers?currency_pair={symbol}_USDT", timeout=FT_TIMEOUT)
    d = r.json()
    if not d or not isinstance(d, list):
        return None
    t = d[0]
    last = float(t["last"])
    op = float(t.get("open_24h", last) or last)
    change = (last - op) / op * 100 if op > 0 else 0
    return {"price_usdt": last, "volume": float(t.get("quote_volume", 0) or 0), "change_24h": round(change, 4), "high": float(t.get("high_24h", 0) or 0), "low": float(t.get("low_24h", 0) or 0)}


FT_FETCHERS = {
    "binance":        (ftx_binance,        False),
    "coinbase":       (ftx_coinbase,       False),
    "kraken":         (ftx_kraken,         False),
    "bybit":          (ftx_bybit,          False),
    "bingx":          (ftx_bingx,          False),
    "mercadobitcoin": (ftx_mercadobitcoin, True),
    "okx":            (ftx_okx,            False),
    "kucoin":         (ftx_kucoin,         False),
    "bitget":         (ftx_bitget,         False),
    "novadax":        (ftx_novadax,        True),
    "gate":           (ftx_gate,           False),
}


def _normalize_ft_error(msg: str) -> str:
    if " 451" in msg:
        return "Indisponivel na regiao atual"
    if " 403" in msg:
        return "Bloqueado para esta regiao"
    if "timed out" in msg.lower():
        return "Timeout na consulta"
    return msg


async def fetch_token_on_exchange(client: httpx.AsyncClient, ex_id: str, symbol: str, usd_brl: float) -> dict:
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
        return {**meta, "exchange": ex_id, "status": "error", "error": _normalize_ft_error(str(e))}


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


@app.get("/api/fantokens")
async def get_fan_tokens():
    async with httpx.AsyncClient() as client:
        usd_brl = await get_usd_brl(client)

        async def fetch_one_token(cg_id: str, symbol: str, team: str, tier: int) -> dict:
            tasks = [fetch_token_on_exchange(client, ex_id, symbol, usd_brl) for ex_id in FT_FETCHERS]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            exchange_data = [r for r in results if not isinstance(r, Exception)]
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
                "exchanges": exchange_data,
                "best_arb": ft_best_arb(exchange_data),
            }

        all_tasks = [fetch_one_token(cg, sym, team, tier) for cg, sym, team, tier in FAN_TOKEN_LIST]
        tokens = await asyncio.gather(*all_tasks)

    with_arb = [t for t in tokens if t.get("best_arb")]
    above_1 = [t for t in with_arb if t["best_arb"]["spread_pct"] >= 1]
    above_3 = [t for t in with_arb if t["best_arb"]["spread_pct"] >= 3]
    best = max(with_arb, key=lambda t: t["best_arb"]["spread_pct"], default=None)

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_tokens": len(tokens),
            "with_arbitrage": len(with_arb),
            "above_1_pct": len(above_1),
            "above_3_pct": len(above_3),
            "usd_brl": round(float(usd_brl), 4),
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
