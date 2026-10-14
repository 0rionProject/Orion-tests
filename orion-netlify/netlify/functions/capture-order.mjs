import { paypalRequest } from "./_lib/paypal.mjs";
import { orderStore, orderKey, paypalKey, json } from "./_lib/orders.mjs";

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  try {
    const { orderId, paypalOrderId } = await request.json();
    if (typeof orderId !== "string" || typeof paypalOrderId !== "string") return json({ error: "Référence de commande manquante." }, 400);
    const store = orderStore();
    const record = await store.get(orderKey(orderId), { type: "json" });
    const mapping = await store.get(paypalKey(paypalOrderId), { type: "json" });
    if (!record || !mapping || mapping.orderId !== orderId || record.paypalOrderId !== paypalOrderId) {
      return json({ error: "Cette commande ne correspond pas au paiement PayPal." }, 404);
    }
    if (record.status === "paid") return json({ status: "COMPLETED", message: "Paiement déjà confirmé." });

    const captureResult = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
      method: "POST",
      requestId: `capture-${orderId}`,
      body: {}
    });
    const unit = captureResult.purchase_units?.find(item => item.reference_id === orderId || item.custom_id === orderId) || captureResult.purchase_units?.[0];
    const capture = unit?.payments?.captures?.find(item => item.status === "COMPLETED");
    if (captureResult.status !== "COMPLETED" || !capture || capture.amount?.currency_code !== "EUR" || Number(capture.amount?.value) !== Number(record.total).toFixed(2) * 1) {
      console.error("Capture PayPal non conforme", { orderId, status: captureResult.status, captureStatus: capture?.status });
      return json({ error: "PayPal n'a pas confirmé le montant attendu. Contactez Orion avant de recommencer." }, 409);
    }
    // Relire l'enregistrement pour ne pas écraser un webhook qui aurait traité le paiement en parallèle.
    const latest = await store.get(orderKey(orderId), { type: "json" }) || record;
    latest.captureId = capture.id;
    latest.captureStatus = capture.status;
    latest.capturedAt = new Date().toISOString();
    // La notification Discord est déclenchée uniquement par le webhook PayPal signé.
    await store.setJSON(orderKey(orderId), latest);
    return json({ status: "COMPLETED", message: "Paiement confirmé par PayPal. La notification de commande sera envoyée automatiquement." });
  } catch (error) {
    console.error("Capture PayPal impossible", error.message);
    return json({ error: error.message || "Impossible de confirmer le paiement." }, error.status || 400);
  }
};
