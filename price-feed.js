const API_SOURCES = {
  bitcoin: [
    {
      url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      read: (data) => data?.bitcoin?.usd,
    },
    {
      url: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
      read: (data) => data?.data?.amount,
    },
  ],
  gold: [
    {
      url: "https://api.exchangerate.host/latest?base=XAU&symbols=USD",
      read: (data) => {
        // exchangerate.host sometimes returns { success:false, error:... }
        if (data?.success === false) return undefined;
        return data?.rates?.USD;
      },
    },
    {
      url: "https://data-asg.goldprice.org/dbXRates/USD",
      read: (data) => data?.items?.[0]?.xauPrice,
    },
  ],
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

const hasValidPrice = (value) => Number.isFinite(value) && value > 0;

async function fetchWithTimeout(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    return res;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function fetchFromSources(sources, label) {
  let lastError;

  for (const source of sources) {
    try {
      const response = await fetchWithTimeout(source.url);

      if (!response.ok) {
        throw new Error(`${label} request failed (${response.status}).`);
      }

      const data = await response.json();
      const raw = source.read(data);
      const value = Number(raw);

      if (hasValidPrice(value)) return value;

      throw new Error(
        `${label} response did not include a valid price. Got: ${JSON.stringify(raw)}`
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error(`No ${label} price source available.`);
}

function updateValue(element, value) {
  element.textContent = hasValidPrice(value) ? formatCurrency(value) : "Unavailable";
}

export async function loadLivePrices({
  bitcoinSelector,
  goldSelector,
  updatedAtSelector,
  refreshButtonSelector,
  refreshMs = 60_000,
}) {
  // Guard for SSR/Node
  if (typeof document === "undefined") return;

  const bitcoinElement = document.querySelector(bitcoinSelector);
  const goldElement = document.querySelector(goldSelector);

  const updatedAtElement = updatedAtSelector
    ? document.querySelector(updatedAtSelector)
    : null;

  const refreshButtonElement = refreshButtonSelector
    ? document.querySelector(refreshButtonSelector)
    : null;

  if (!bitcoinElement || !goldElement) return;

  const refresh = async () => {
    if (refreshButtonElement) refreshButtonElement.disabled = true;

    try {
      const [bitcoinResult, goldResult] = await Promise.allSettled([
        fetchFromSources(API_SOURCES.bitcoin, "Bitcoin"),
        fetchFromSources(API_SOURCES.gold, "Gold"),
      ]);

      let successfulUpdates = 0;

      if (bitcoinResult.status === "fulfilled") {
        updateValue(bitcoinElement, bitcoinResult.value);
        successfulUpdates += 1;
      } else {
        bitcoinElement.textContent = "Unavailable";
        console.error("Unable to load Bitcoin price:", bitcoinResult.reason);
      }

      if (goldResult.status === "fulfilled") {
        updateValue(goldElement, goldResult.value);
        successfulUpdates += 1;
      } else {
        goldElement.textContent = "Unavailable";
        console.error("Unable to load Gold price:", goldResult.reason);
      }

      if (updatedAtElement) {
        updatedAtElement.textContent =
          successfulUpdates > 0
            ? `Last updated: ${new Date().toLocaleTimeString()}`
            : "Last updated: unavailable";
      }
    } finally {
      if (refreshButtonElement) refreshButtonElement.disabled = false;
    }
  };

  if (refreshButtonElement) {
    refreshButtonElement.addEventListener("click", refresh);
  }

  await refresh();

  if (Number.isFinite(refreshMs) && refreshMs > 0) {
    globalThis.setInterval(refresh, refreshMs);
  }

  return { refreshNow: refresh };
}
