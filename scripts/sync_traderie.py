#!/usr/bin/env python3
"""Sync Blox Fruits items/values/images from Traderie."""

from __future__ import annotations

import json
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
API = "https://traderie.com/api/bloxfruits/items/values"
RAW = ROOT / "scripts" / "_traderie_raw.json"
OUT_ITEMS = ROOT / "src" / "data" / "items.json"
OUT_ITEMS_PUBLIC = ROOT / "public" / "data" / "items.json"
IMG_DIR = ROOT / "public" / "items"
COOKIE_JAR = ROOT / "scripts" / "_traderie_cookies.txt"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"
)
REFERER = "https://traderie.com/bloxfruits/values"

# Treasure Trade–ish rarity accents (game popup uses green name / magenta price)
RARITY_COLORS = {
    "Common": "#9ca3af",
    "Uncommon": "#4ade80",
    "Rare": "#60a5fa",
    "Legendary": "#fbbf24",
    "Mythical": "#c084fc",
    "Premium": "#f472b6",
    "Limited": "#fb7185",
    "Gamepass": "#facc15",
    "Misc": "#a3a3a3",
}


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "item"


def curl_bin() -> str:
    for name in ("curl", "curl.exe"):
        try:
            subprocess.run([name, "--version"], capture_output=True, check=True)
            return name
        except Exception:
            continue
    return "curl"


def curl_get(
    url: str,
    out: Path | None = None,
    *,
    use_cookies: bool = True,
    accept: str = "*/*",
) -> bytes:
    cmd = [
        curl_bin(),
        "-sS",
        "-L",
        "--compressed",
        "--max-time",
        "60",
        "-A",
        UA,
        "-H",
        f"Referer: {REFERER}",
        "-H",
        f"Accept: {accept}",
        "-H",
        "Accept-Language: en-US,en;q=0.9",
        "-H",
        "Origin: https://traderie.com",
        "-w",
        "\n__HTTP_STATUS__:%{http_code}",
    ]
    if use_cookies:
        COOKIE_JAR.parent.mkdir(parents=True, exist_ok=True)
        cmd += ["-c", str(COOKIE_JAR), "-b", str(COOKIE_JAR)]
    if out is not None:
        cmd += ["-o", str(out)]
    else:
        cmd += ["--output", "-"]
    cmd.append(url)
    proc = subprocess.run(cmd, capture_output=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", errors="replace") or "curl failed")

    if out is not None:
        status_blob = proc.stdout.decode("utf-8", errors="replace")
        body = out.read_bytes()
    else:
        raw = proc.stdout
        marker = b"\n__HTTP_STATUS__:"
        idx = raw.rfind(marker)
        if idx >= 0:
            body = raw[:idx]
            status_blob = raw[idx + 1 :].decode("utf-8", errors="replace")
        else:
            body = raw
            status_blob = ""

    status = "0"
    if "__HTTP_STATUS__:" in status_blob:
        status = status_blob.strip().split("__HTTP_STATUS__:")[-1].strip()[:3]

    if status and status not in {"200", "0"}:
        preview = body[:200].decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {status} from {url} body={preview!r}")
    return body


def warmup_session() -> None:
    try:
        curl_get(REFERER, use_cookies=True, accept="text/html,application/xhtml+xml,*/*")
    except Exception as exc:
        print(f"  warmup warning: {exc}")


def fetch_api_playwright() -> dict | None:
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except Exception:
        return None

    print("  using Playwright Chromium…")
    eval_js = """
    async (api) => {
      const res = await fetch(api, {
        headers: { Accept: 'application/json', Referer: location.href },
        credentials: 'include',
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error('HTTP ' + res.status + ' ' + t.slice(0, 160));
      }
      return await res.json();
    }
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent=UA,
            locale="en-US",
            extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
        )
        page = context.new_page()
        page.goto(REFERER, wait_until="domcontentloaded", timeout=90_000)
        for _ in range(40):
            title = (page.title() or "").lower()
            if "just a moment" not in title:
                break
            page.wait_for_timeout(1000)
        else:
            browser.close()
            raise RuntimeError("Cloudflare challenge did not clear")

        payload = page.evaluate(eval_js, API)
        browser.close()

    if not isinstance(payload, dict) or not isinstance(payload.get("prices"), list):
        raise RuntimeError("Unexpected Traderie payload (playwright)")
    RAW.write_text(json.dumps(payload), encoding="utf-8")
    print(f"  {len(payload['prices'])} prices (version {payload.get('version')})")
    return payload


def fetch_api_cffi() -> dict | None:
    try:
        from curl_cffi import requests as cffi_requests  # type: ignore
    except Exception:
        return None

    print("  using curl_cffi chrome impersonation…")
    session = cffi_requests.Session()
    session.get(REFERER, impersonate="chrome124", timeout=45)
    resp = session.get(
        API,
        impersonate="chrome124",
        headers={
            "Referer": REFERER,
            "Accept": "application/json,text/plain,*/*",
            "Origin": "https://traderie.com",
        },
        timeout=60,
    )
    if resp.status_code != 200:
        preview = (resp.text or "")[:180]
        raise RuntimeError(f"HTTP {resp.status_code} via cffi body={preview!r}")
    payload = resp.json()
    if not isinstance(payload.get("prices"), list):
        raise RuntimeError("Unexpected Traderie payload (cffi)")
    RAW.write_bytes(resp.content)
    print(f"  {len(payload['prices'])} prices (version {payload.get('version')})")
    return payload


def fetch_api() -> dict:
    print("Fetching Traderie Blox Fruits values API…")
    for label, fn in (
        ("playwright", fetch_api_playwright),
        ("curl_cffi", fetch_api_cffi),
    ):
        try:
            via = fn()
            if via is not None:
                return via
        except Exception as exc:
            print(f"  {label} failed: {exc}")

    warmup_session()
    last_err: Exception | None = None
    for attempt in range(1, 4):
        try:
            data = curl_get(API, RAW, accept="application/json,text/plain,*/*")
            text = data.decode("utf-8", errors="replace").strip()
            if not text:
                raise RuntimeError("empty response body (likely blocked CI IP)")
            if text.lstrip().startswith("<!"):
                raise RuntimeError("got Cloudflare challenge HTML instead of JSON")
            payload = json.loads(text)
            if not isinstance(payload.get("prices"), list):
                raise RuntimeError("Unexpected Traderie payload")
            print(f"  {len(payload['prices'])} prices (version {payload.get('version')})")
            return payload
        except Exception as exc:
            last_err = exc
            print(f"  attempt {attempt}/3 failed: {exc}")
            time.sleep(2 * attempt)
    raise RuntimeError(f"Traderie API failed after retries: {last_err}")


def encode_cdn_url(url: str) -> str:
    parts = urlsplit(url)
    path = quote(parts.path, safe="/%")
    return urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))


def prefer_128(url: str) -> str:
    if "/128x128/" in url:
        return url
    if "cdn.nookazon.com/bloxfruits/" in url:
        return url.replace(
            "cdn.nookazon.com/bloxfruits/", "cdn.nookazon.com/128x128/bloxfruits/", 1
        )
    if "cdn.nookazon.com/" in url and "/128x128/" not in url:
        # generic: insert 128 after host
        return url.replace("cdn.nookazon.com/", "cdn.nookazon.com/128x128/", 1)
    return url


def tag_map(tags: list[dict] | None) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for t in tags or []:
        cat = str(t.get("category") or "").strip()
        tag = str(t.get("tag") or "").strip()
        if not tag:
            continue
        out.setdefault(cat, []).append(tag)
    return out


def resolve_rarity(raw_type: str, tags: dict[str, list[str]]) -> str:
    for cat in ("rarity", "Rarity", "type", "Type"):
        for t in tags.get(cat, []):
            if t in RARITY_COLORS:
                return t
    if raw_type in RARITY_COLORS:
        return raw_type
    # Traderie BF often uses type as category (Fruits, Gamepasses, …)
    for vals in tags.values():
        for t in vals:
            if t in RARITY_COLORS:
                return t
    return "Misc"


def resolve_item_type(raw_type: str, tags: dict[str, list[str]], name: str) -> str:
    raw_l = raw_type.lower().replace(" ", "")
    type_tags = [t.lower() for t in tags.get("type", [])]
    blob = " ".join(type_tags + [raw_type.lower(), name.lower()])
    if "gamepass" in raw_l or "gamepass" in blob:
        return "Gamepass"
    if raw_l in {"fruits", "fruit"} or "fruit" in blob:
        return "Fruit"
    if raw_l in {"items", "item"}:
        return "Item"
    if raw_type in RARITY_COLORS:
        return "Fruit"
    return raw_type if raw_type else "Misc"


def normalize(payload: dict) -> list[dict]:
    items: list[dict] = []

    for p in payload["prices"]:
        name = str(p.get("name") or "").strip()
        if not name:
            continue

        raw_type = str(p.get("type") or "Misc")
        tags = tag_map(p.get("tags"))
        rarity = resolve_rarity(raw_type, tags)
        item_type = resolve_item_type(raw_type, tags, name)

        values = p.get("values") or []
        primary = values[0] if values else {}
        value = float(primary.get("user_value") or 0)
        demand = int(primary.get("demand") or 0)

        slug = slugify(str(p.get("slug") or name))
        img = str(p.get("img") or "").strip()

        items.append(
            {
                "id": slug,
                "traderieId": str(p.get("id") or p.get("item_id") or ""),
                "name": name,
                "value": value,
                "demand": demand,
                "rarity": rarity,
                "rarityColor": RARITY_COLORS.get(rarity, "#a3a3a3"),
                "type": item_type,
                "imageUrl": prefer_128(img) if img else "",
            }
        )

    items.sort(key=lambda x: x["value"], reverse=True)
    return items


def download_one(item: dict) -> str:
    url = item.pop("imageUrl", "") or ""
    item_id = slugify(str(item["id"]))
    if not url:
        item["image"] = ""
        return item_id

    lower = url.lower()
    if ".png" in lower:
        ext = ".png"
    elif ".jpg" in lower or ".jpeg" in lower:
        ext = ".jpg"
    elif ".webp" in lower:
        ext = ".webp"
    else:
        ext = ".png"

    path = IMG_DIR / f"{item_id}{ext}"
    rel = f"/items/{item_id}{ext}"
    if path.exists() and path.stat().st_size > 100:
        item["image"] = rel
        return item_id

    try:
        encoded = encode_cdn_url(url)
        data = curl_get(encoded)
        if len(data) < 80 or data[:5] == b"<?xml":
            if "/128x128/" in encoded:
                data = curl_get(encode_cdn_url(url.replace("/128x128", "")))
            if len(data) < 80 or data[:5] == b"<?xml":
                item["image"] = ""
                return item_id
        path.write_bytes(data)
        item["image"] = rel
    except Exception:
        item["image"] = ""
    return item_id


def download_all(rows: list[dict]) -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading up to {len(rows)} images…")
    done = 0
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = [pool.submit(download_one, row) for row in rows]
        for fut in as_completed(futures):
            fut.result()
            done += 1
            if done % 50 == 0:
                print(f"  {done}/{len(rows)}")
    ok = sum(1 for r in rows if r.get("image"))
    print(f"  images ok: {ok}/{len(rows)}")


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    t0 = time.time()
    payload = fetch_api()
    items = normalize(payload)
    download_all(items)

    for row in items:
        row.pop("traderieId", None)

    items.sort(key=lambda x: x["value"], reverse=True)
    updated = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    items_payload = {
        "updatedAt": updated,
        "source": "traderie",
        "game": "bloxfruits",
        "count": len(items),
        "rarityColors": RARITY_COLORS,
        "items": items,
    }
    write_json(OUT_ITEMS, items_payload)
    write_json(OUT_ITEMS_PUBLIC, items_payload)
    print(f"Wrote {len(items)} items in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
