import { paypalRequest } from "./_lib/paypal.mjs";
import { orderStore, orderKey, paypalKey, euro, json } from "./_lib/orders.mjs";

function buildOrderText(record, event) {
  const a = record.answers || {};
  const options = record.options || {};
  const lines = [
    "🌌 ORION — NOUVELLE COMMANDE PAYÉE",
    `Commande : ${record.orderId}`,
    `Statut : PAYÉ / CONFIRMÉ PAR PAYPAL`,
    `Montant confirmé : ${euro(record.total)}`,
    `Capture PayPal : ${event.resource?.id || record.captureId || "—"}`,
    `Date de confirmation : ${new Date().toISOString()}`,
    "",
    "OPTIONS COMMANDÉES",
    ...((options.lines || []).map(line => `• ${line.label} : ${euro(line.price)}`)),
    `TOTAL : ${euro(record.total)}`,
    "",
    "RÉPONSES DU FORMULAIRE"
  ];
  const labels = {
    firstName: "Prénom", lastName: "Nom", email: "Adresse e-mail", phone: "Téléphone",
    discord: "Nom d'utilisateur Discord", hasTeam: "Avez-vous une équipe ?", teamCount: "Taille de l'équipe",
    experience: "Expérience / parcours", category: "Domaine du projet", projectName: "Nom du projet",
    description: "Description du projet", audience: "Public cible", progress: "Avancement du projet",
    users: "Utilisateurs ou clients existants", identity: "Identité visuelle", value: "Valeur apportée",
    competitors: "Projets similaires / différenciation", goal6: "Objectifs à 6 mois", goal12: "Objectifs à un an",
    motivation: "Motivation", discovery: "Comment avez-vous découvert Orion ?", extra: "Informations complémentaires",
    privacyConsent: "Consentement confidentialité"
  };
  for (const [key, value] of Object.entries(a)) {
    const rendered = typeof value === "string" ? value : JSON.stringify(value);
    lines.push(`${labels[key] || key} : ${rendered || "—"}`);
  }
  return lines.join("\n");
}

function splitMessage(text, limit = 1750) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut < Math.floor(limit * 0.6)) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n/, "");
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function verifyWebhook(request, event) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID n'est pas configuré.");
  const header = name => request.headers.get(name);
  const required = {
    transmission_id: header("paypal-transmission-id"),
    transmission_time: header("paypal-transmission-time"),
    cert_url: header("paypal-cert-url"),
    auth_algo: header("paypal-auth-algo"),
    transmission_sig: header("paypal-transmission-sig")
  };
  if (Object.values(required).some(value => !value)) throw new Error("En-têtes de signature PayPal manquants.");
  const result = await paypalRequest("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: { ...required, webhook_id: webhookId, webhook_event: event }
  });
  return result.verification_status === "SUCCESS";
}

async function notifyDiscord(record, event) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) throw new Error("DISCORD_WEBHOOK_URL n'est pas configuré.");
  const store = orderStore();
  const current = await store.get(orderKey(record.orderId), { type: "json" });
  if (!current) throw new Error("Commande introuvable dans le stockage.");
  const chunks = splitMessage(buildOrderText(current, event));
  let sent = Number(current.discordChunksSent || 0);
  for (; sent < chunks.length; sent++) {
    const prefix = chunks.length > 1 ? `[Orion • ${current.orderId.slice(0, 8)} • partie ${sent + 1}/${chunks.length}]\n` : "";
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `${prefix}${chunks[sent]}`, allowed_mentions: { parse: [] } })
    });
    if (!response.ok) throw new Error(`Discord a répondu HTTP ${response.status}.`);
    current.discordChunksSent = sent + 1;
    await store.setJSON(orderKey(current.orderId), current);
  }
  current.discordSentAt = new Date().toISOString();
  await store.setJSON(orderKey(current.orderId), current);
}

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  let event;
  try {
    event = await request.json();
    const verified = await verifyWebhook(request, event);
    if (!verified) {
      console.warn("Webhook PayPal rejeté : signature invalide.");
      return json({ error: "Signature PayPal invalide." }, 400);
    }
    if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") return json({ received: true, ignored: true });
    const capture = event.resource;
    if (capture?.status !== "COMPLETED" || !capture?.id) return json({ received: true, ignored: true });
    const paypalOrderId = capture.supplementary_data?.related_ids?.order_id;
    if (!paypalOrderId) return json({ received: true, ignored: true });

    const store = orderStore();
    const mapping = await store.get(paypalKey(paypalOrderId), { type: "json" });
    if (!mapping?.orderId) {
      console.warn("Capture PayPal sans commande Orion correspondante.", paypalOrderId);
      return json({ received: true, unmatched: true });
    }
    const record = await store.get(orderKey(mapping.orderId), { type: "json" });
    if (!record) return json({ received: true, unmatched: true });
    const amount = capture.amount;
    if (amount?.currency_code !== "EUR" || Number(amount.value) !== Number(record.total) || capture.status !== "COMPLETED") {
      console.error("Montant de webhook différent de la commande attendue.", { orderId: record.orderId, expected: record.total, received: amount });
      return json({ error: "Montant de capture non conforme." }, 409);
    }
    if (record.status !== "paid") {
      record.status = "paid";
      record.captureId = capture.id;
      record.paidAt = event.create_time || new Date().toISOString();
      await store.setJSON(orderKey(record.orderId), record);
    }
    if (!record.discordSentAt) await notifyDiscord(record, event);
    return json({ received: true, paid: true, notified: true });
  } catch (error) {
    console.error("Traitement du webhook PayPal échoué", error.message);
    // 500 permet à PayPal de réessayer l'événement en cas d'erreur temporaire.
    return json({ error: "Le webhook n'a pas pu être traité; PayPal pourra réessayer." }, 500);
  }
};
