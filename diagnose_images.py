import json
import sys
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

API_URL = 'https://script.google.com/macros/s/AKfycbzAXbuROmepx2ZwMM3vyj3wOivE5EOVlbsn59KAosQZPn3qoB0mFIgVWu-TeuJht3j1ng/exec'
DEFAULT_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960"%3E%3Crect width="720" height="960" fill="%23F5EFE6"/%3E%3Ctext x="50%25" y="48%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="%23A67D5A"%3EImage+Not+Available%3C/text%3E%3C/svg%3E'


def normalize_image_url(url):
    if not url or not isinstance(url, str):
        return ''
    trimmed = url.strip()
    if not trimmed:
        return ''
    if trimmed.startswith('data:') or trimmed.startswith('blob:'):
        return trimmed
    lower = trimmed.lower()
    if 'googleusercontent.com' in lower or 'photos.app.goo.gl' in lower:
        return trimmed
    if 'drive.google.com/thumbnail' in lower or 'drive.google.com/uc?export=view&id=' in lower:
        return trimmed
    if 'drive.google.com' in lower or 'docs.google.com' in lower:
        m = None
        for pat in ['id=', 'file/d/', '/d/', '/document/d/']:
            if pat in trimmed:
                m = trimmed.split(pat, 1)[1].split('&', 1)[0].split('/', 1)[0]
                break
        if m:
            return f'https://drive.google.com/uc?export=view&id={m}'
    try:
        parsed = urlparse(trimmed)
        if parsed.hostname and ('drive.google.com' in parsed.hostname or 'docs.google.com' in parsed.hostname):
            q = parse_qs(parsed.query)
            if 'id' in q and q['id']:
                return f'https://drive.google.com/uc?export=view&id={q['id'][0]}'
        return trimmed
    except Exception:
        return trimmed


def fetch_json(url):
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def http_info(url):
    req = Request(url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urlopen(req, timeout=20) as resp:
            return resp.status, resp.getheader('Content-Type'), resp.geturl()
    except HTTPError as e:
        return e.code, e.headers.get('Content-Type'), e.geturl() if hasattr(e, 'geturl') else url
    except URLError as e:
        return None, str(e.reason), url


def http_get_info(url):
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urlopen(req, timeout=20) as resp:
            data = resp.read(1024)
            return resp.status, resp.getheader('Content-Type'), len(data), resp.geturl()
    except HTTPError as e:
        return e.code, e.headers.get('Content-Type'), 0, url
    except URLError as e:
        return None, str(e.reason), 0, url


print('Fetching API feed...')
try:
    data = fetch_json(API_URL)
except Exception as exc:
    print('Fetch failed:', exc)
    sys.exit(1)

print('items total', len(data))

url_entries = []
for idx, item in enumerate(data[:100], 1):
    raw_image = str(item.get('image link') or item.get('imageLink') or '').strip()
    raw_thumb = str(item.get('thumbnail') or item.get('') or '').strip()
    if raw_image:
        url_entries.append(('image link', idx, raw_image))
    if raw_thumb:
        url_entries.append(('thumbnail', idx, raw_thumb))

unique_urls = []
seen = set()
for label, idx, raw in url_entries:
    if raw in seen:
        continue
    seen.add(raw)
    norm = normalize_image_url(raw)
    unique_urls.append((label, idx, raw, norm))
    if len(unique_urls) >= 40:
        break

print('\nSample normalized URLs:')
for label, idx, raw, norm in unique_urls[:20]:
    p = urlparse(raw)
    print(f'[{idx}] {label} raw={raw}')
    print(f'     normalized={norm}')
    print(f'     host={p.netloc} path={p.path} query={p.query}')

print('\nTesting URL HTTP access...')
for label, idx, raw, norm in unique_urls[:20]:
    if norm.startswith('data:') or norm.startswith('blob:'):
        print(f'[{idx}] {label} SKIP data/blob {norm[:60]}')
        continue
    head_status, head_type, head_final = http_info(norm)
    print(f'[{idx}] {label} HEAD status={head_status} type={head_type} final={head_final}')
    get_status, get_type, get_len, get_final = http_get_info(norm)
    print(f'      GET status={get_status} type={get_type} len={get_len} final={get_final}')
    print('')

print('Done.')
