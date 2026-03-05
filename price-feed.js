const BITCOIN_API = 'https://api.coindesk.com/v1/bpi/currentprice/USD.json';
const GOLD_API = 'https://api.metals.live/v1/spot/gold';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value);

async function fetchBitcoinPrice() {
  const response = await fetch(BITCOIN_API);
  if (!response.ok) {
    throw new Error('Failed to fetch Bitcoin price.');
  }

  const data = await response.json();
  return data?.bpi?.USD?.rate_float;
}

async function fetchGoldPrice() {
  const response = await fetch(GOLD_API);
  if (!response.ok) {
    throw new Error('Failed to fetch gold price.');
  }

  const data = await response.json();
  const latest = Array.isArray(data) ? data[data.length - 1] : null;
  return latest?.gold ?? null;
}

export async function loadLivePrices({ bitcoinSelector, goldSelector }) {
  const bitcoinElement = document.querySelector(bitcoinSelector);
  const goldElement = document.querySelector(goldSelector);

  if (!bitcoinElement || !goldElement) {
    return;
  }

  try {
    const [bitcoin, gold] = await Promise.all([fetchBitcoinPrice(), fetchGoldPrice()]);

    bitcoinElement.textContent = Number.isFinite(bitcoin)
      ? formatCurrency(bitcoin)
      : 'Unavailable';

    goldElement.textContent = Number.isFinite(gold)
      ? formatCurrency(gold)
      : 'Unavailable';
  } catch (error) {
    bitcoinElement.textContent = 'Unavailable';
    goldElement.textContent = 'Unavailable';
    console.error(error);
  }
}
