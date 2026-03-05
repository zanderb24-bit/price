const API_SOURCES = {
  bitcoin: [
    {
      name: 'CoinGecko',
      url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      read: (data) => data?.bitcoin?.usd
    },
    {
      name: 'Coinbase',
      url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',
      read: (data) => data?.data?.amount
    },
    {
      name: 'Binance',
      url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
      read: (data) => data?.price
    }
  ],
  gold: [
    {
      name: 'Metals.live',
      url: 'https://api.metals.live/v1/spot/gold',
      read: (data) => {
        if (!Array.isArray(data) || data.length === 0) {
          return null;
        }

        const latest = data[data.length - 1];
        if (typeof latest === 'number') {
          return latest;
        }

        if (Array.isArray(latest)) {
          return latest[1];
        }

        return latest?.gold ?? null;
      }
    },
    {
      name: 'Coinbase',
      url: 'https://api.coinbase.com/v2/prices/XAU-USD/spot',
      read: (data) => data?.data?.amount
    },
    {
      name: 'GoldPrice',
      url: 'https://data-asg.goldprice.org/dbXRates/USD',
      read: (data) => data?.items?.[0]?.xauPrice
    }
  ]
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value);

const hasValidPrice = (value) => Number.isFinite(value) && value > 0;

async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchFromSources(sources, label, debug = false) {
  let lastError;

  for (const source of sources) {
    try {
      const response = await fetchWithTimeout(source.url);
      if (!response.ok) {
        throw new Error(`${label} request failed (${response.status}) from ${source.name}.`);
      }

      const data = await response.json();
      const value = Number(source.read(data));

      if (hasValidPrice(value)) {
        if (debug) {
          console.info(`${label} loaded from ${source.name}:`, value);
        }

        return { value, source: source.name };
      }

      throw new Error(`${label} response from ${source.name} did not include a valid price.`);
    } catch (error) {
      lastError = error;
      if (debug) {
        console.warn(`${label} source failed: ${source.name}`, error);
      }
    }
  }

  throw lastError ?? new Error(`No ${label} price source available.`);
}

function updateValue(element, value) {
  element.textContent = hasValidPrice(value) ? formatCurrency(value) : 'Unavailable';
}

export async function loadLivePrices({
  bitcoinSelector,
  goldSelector,
  updatedAtSelector,
  refreshButtonSelector,
  refreshMs = 60000,
  debug = false
}) {
  const bitcoinElement = document.querySelector(bitcoinSelector);
  const goldElement = document.querySelector(goldSelector);
  const updatedAtElement = updatedAtSelector
    ? document.querySelector(updatedAtSelector)
    : null;
  const refreshButtonElement = refreshButtonSelector
    ? document.querySelector(refreshButtonSelector)
    : null;

  if (!bitcoinElement || !goldElement) {
    return;
  }

  const refresh = async () => {
    if (refreshButtonElement) {
      refreshButtonElement.disabled = true;
    }

    const [bitcoinResult, goldResult] = await Promise.allSettled([
      fetchFromSources(API_SOURCES.bitcoin, 'Bitcoin', debug),
      fetchFromSources(API_SOURCES.gold, 'Gold', debug)
    ]);

    let successfulUpdates = 0;

    if (bitcoinResult.status === 'fulfilled') {
      updateValue(bitcoinElement, bitcoinResult.value.value);
      successfulUpdates += 1;
    } else {
      bitcoinElement.textContent = 'Unavailable';
      console.error('Unable to load Bitcoin price:', bitcoinResult.reason);
    }

    if (goldResult.status === 'fulfilled') {
      updateValue(goldElement, goldResult.value.value);
      successfulUpdates += 1;
    } else {
      goldElement.textContent = 'Unavailable';
      console.error('Unable to load Gold price:', goldResult.reason);
    }

    if (updatedAtElement) {
      updatedAtElement.textContent = successfulUpdates > 0
        ? `Last updated: ${new Date().toLocaleTimeString()}`
        : 'Last updated: unavailable';
    }

    if (refreshButtonElement) {
      refreshButtonElement.disabled = false;
    }
  };

  if (refreshButtonElement) {
    refreshButtonElement.addEventListener('click', () => {
      refresh();
    });
  }

  await refresh();

  if (Number.isFinite(refreshMs) && refreshMs > 0) {
    window.setInterval(refresh, refreshMs);
  }

  return {
    refreshNow: refresh
  };
}
