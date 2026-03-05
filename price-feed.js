const API_SOURCES = {
  bitcoin: [
    {
      url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      read: (data) => data?.bitcoin?.usd
    },
    {
      url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',
      read: (data) => Number(data?.data?.amount)
    }
  ],
  gold: [
    {
      url: 'https://api.exchangerate.host/latest?base=XAU&symbols=USD',
      read: (data) => data?.rates?.USD
    },
    {
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

async function fetchFromSources(sources, label) {
  let lastError;

  for (const source of sources) {
    try {
      const response = await fetch(source.url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`${label} request failed (${response.status}).`);
      }

      const data = await response.json();
      const value = Number(source.read(data));

      if (hasValidPrice(value)) {
        return value;
      }

      throw new Error(`${label} response did not include a valid price.`);
    } catch (error) {
      lastError = error;
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
  refreshMs = 60000
}) {
  const bitcoinElement = document.querySelector(bitcoinSelector);
  const goldElement = document.querySelector(goldSelector);
  const updatedAtElement = updatedAtSelector
    ? document.querySelector(updatedAtSelector)
    : null;

  if (!bitcoinElement || !goldElement) {
    return;
  }

  const renderUnavailable = () => {
    bitcoinElement.textContent = 'Unavailable';
    goldElement.textContent = 'Unavailable';
    if (updatedAtElement) {
      updatedAtElement.textContent = 'Last updated: unavailable';
    }
  };

  const refresh = async () => {
    try {
      const [bitcoin, gold] = await Promise.all([
        fetchFromSources(API_SOURCES.bitcoin, 'Bitcoin'),
        fetchFromSources(API_SOURCES.gold, 'Gold')
      ]);

      updateValue(bitcoinElement, bitcoin);
      updateValue(goldElement, gold);

      if (updatedAtElement) {
        updatedAtElement.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
      }
    } catch (error) {
      renderUnavailable();
      console.error('Unable to load live prices:', error);
    }
  };

  await refresh();

  if (Number.isFinite(refreshMs) && refreshMs > 0) {
    window.setInterval(refresh, refreshMs);
  }
}
