"""Read-only discovery helper for choosing the demonstration snapshot."""
import concurrent.futures
import re
import urllib.request


def inspect(wmo):
    url = f'https://data-argo.ifremer.fr/dac/incois/{wmo}/profiles/'
    with urllib.request.urlopen(url, timeout=35) as response:
        names = re.findall(r'href="([^"]+\.nc)"', response.read().decode())
    delayed = [name for name in names if name.startswith('D')]
    return wmo, len(names), delayed[-5:] if delayed else names[:5]


if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        for result in pool.map(inspect, ['1902674', '1902675', '1902676']):
            print(result, flush=True)
