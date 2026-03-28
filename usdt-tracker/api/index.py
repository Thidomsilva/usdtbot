from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx
import asyncio
from datetime import datetime, timezone

app = FastAPI(title="USDT Price Tracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

TIMEOUT = 8.0


# ── exchange fetchers ─────────────────────────────────────────────────────────

async def fetch_binance(client: httpx.AsyncClient) -> dict:
    """USDT/BRL price from Binance public API."""
    symbols = ["USDTBRL", "BRLUSDT"]
    d = None
    used_symbol = None
    for symbol in symbols:
        url = f"https://api.binance.com/api/v3/ticker/24hr?symbol={symbol}"
        r = await client.get(url, timeout=TIMEOUT)
        candidate = r.json()
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
    r = await client.get(url, timeout=TIMEOUT)
    d = r.json()["data"]
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
    r = await client.get(url, timeout=TIMEOUT)
    data = r.json().get("data", {})

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
    r = await client.get(url, timeout=TIMEOUT)
    d = r.json()["ticker"]
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
        return name, {
            "status": "error",
            "error": str(e),
            **EXCHANGE_META[name],
        }


@app.get("/api/prices")
async def get_prices():
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

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "exchanges": results,
        "summary": summary,
    }


@app.get("/api/health")
async def health():
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}
