import { randomUUID } from "node:crypto";
import { paypalRequest } from "./_lib/paypal.mjs";
import { orderStore, orderKey, paypalKey, priceOptions, cleanAnswers, json } from "./_lib/orders.mjs";

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  try {
    const payload = await request.json();
    const answers = cleanAnswers(payload.answers);
    const options = priceOptions(payload.options);
    if (options.total <= 0) throw new Error("Le total est de 0,00 €. Sélectionnez au moins une option payante pour continuer vers PayPal.");
    const orderId = randomUUID();
    const siteUrl = process.env.URL || new URL(request.url).origin;
    const store = orderStore();
    const record = {
      orderId,
      createdAt: new Date().toISOString(),
      status: "pending",
      answers,
      options,
      total: options.total,
      currency: "EUR",
      paypalOrderId: null,
      captureId: null,
      discordChunksSent: 0
    };

    // Écrire d'abord la commande pour que le webhook puisse la retrouver immédiatement.
    await store.setJSON(orderKey(orderId), record);
    const paypalOrder = await paypalRequest("/v2/checkout/orders", {
      method: "POST",
      requestId: orderId,
      body: {
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: orderId,
          custom_id: orderId,
          description: `Commande Orion ${orderId.slice(0, 8)}`,
          amount: { currency_code: "EUR", value: options.total.toFixed(2) }
        }],
        application_context: {
          brand_name: "Orion",
          user_action: "PAY_NOW",
          return_url: `${siteUrl}/?payment=success&orderId=${encodeURIComponent(orderId)}`,
          cancel_url: `${siteUrl}/?payment=cancelled&orderId=${encodeURIComponent(orderId)}`
        }
      }
    });
    const approveUrl = paypalOrder.links?.find(link => link.rel === "approve")?.href;
    if (!paypalOrder.id || !approveUrl) throw new Error("PayPal n'a pas renvoyé de lien d'approbation.");
    record.paypalOrderId = paypalOrder.id;
    await store.setJSON(orderKey(orderId), record);
    await store.setJSON(paypalKey(paypalOrder.id), { orderId });
    return json({ orderId, paypalOrderId: paypalOrder.id, approveUrl, total: options.total });
  } catch (error) {
    console.error("Création de commande impossible", error.message);
    return json({ error: error.message || "Impossible de créer la commande." }, 400);
  }
};
