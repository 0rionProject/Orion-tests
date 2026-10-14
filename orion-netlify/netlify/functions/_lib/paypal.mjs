export function paypalBase() {
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export async function paypalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Configuration PayPal manquante côté serveur.");

  const response = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    console.error("Échec OAuth PayPal", response.status, data.error || data.name || "erreur inconnue");
    throw new Error("Impossible de s'authentifier auprès de PayPal.");
  }
  return data.access_token;
}

export async function paypalRequest(path, { method = "GET", body, requestId } = {}) {
  const token = await paypalAccessToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (requestId) headers["PayPal-Request-Id"] = requestId;
  const response = await fetch(`${paypalBase()}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Erreur API PayPal", response.status, data.name || "erreur inconnue", data.message || "");
    const error = new Error("PayPal n'a pas accepté cette opération.");
    error.status = response.status;
    throw error;
  }
  return data;
}
