import { getStore } from "@netlify/blobs";

export const orderStore = () => getStore("orion-orders");
export const orderKey = id => `order:${id}`;
export const paypalKey = id => `paypal:${id}`;

export function euro(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

export function priceOptions(raw = {}) {
  const photos = integerInRange(raw.photos, 0, 10, "photos");
  const siteVideos = integerInRange(raw.siteVideos, 0, 5, "siteVideos");
  const socialVideos = integerInRange(raw.socialVideos, 0, 5, "socialVideos");
  const domainValue = Number(raw.domainValue);
  const domains = {
    0: { label: ".netlify.app — Gratuit", price: 0 },
    15: { label: ".fr — 15 €/an", price: 15 },
    20: { label: ".com — 20 €/an", price: 20 },
    13: { label: ".org — 13 €/an", price: 13 }
  };
  if (!Object.prototype.hasOwnProperty.call(domains, domainValue)) throw new Error("Option de domaine invalide.");
  const logo = raw.logo === true;
  const coaching = raw.coaching === true;
  const lines = [
    { label: "Site web de base (1 photo et 1 vidéo)", price: 0 },
    { label: `Photos supplémentaires (${photos})`, price: photos * 0.5 },
    { label: `Vidéos sur le site (${siteVideos})`, price: siteVideos * 10 },
    { label: `Domaine : ${domains[domainValue].label}`, price: domains[domainValue].price },
    { label: "Création du logo", price: logo ? 25 : 0 },
    { label: `Vidéos promotionnelles (${socialVideos})`, price: socialVideos * 5 },
    { label: "Coaching d’influenceur", price: coaching ? 25 : 0 }
  ];
  return {
    photos, siteVideos, socialVideos, domainValue,
    domain: domains[domainValue].label, logo, coaching,
    lines, total: Math.round(lines.reduce((sum, line) => sum + line.price, 0) * 100) / 100
  };
}

function integerInRange(value, min, max, key) {
  const number = Number(value ?? 0);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Option ${key} invalide.`);
  return number;
}

export function cleanAnswers(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Réponses du formulaire invalides.");
  const output = {};
  for (const [key, value] of Object.entries(input).slice(0, 80)) {
    const safeKey = String(key).slice(0, 120);
    if (typeof value === "boolean" || typeof value === "number") output[safeKey] = value;
    else if (typeof value === "string") output[safeKey] = value.slice(0, 3000);
    else if (Array.isArray(value)) output[safeKey] = value.map(v => String(v).slice(0, 300)).slice(0, 30);
  }
  if (JSON.stringify(output).length > 40000) throw new Error("Le formulaire est trop volumineux.");
  if (!String(output.firstName || "").trim() || !String(output.lastName || "").trim()) throw new Error("Le prénom et le nom sont obligatoires.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(output.email || ""))) throw new Error("Adresse e-mail invalide.");
  if (output.privacyConsent !== true) throw new Error("Le consentement de confidentialité est requis.");
  return output;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

export function errorResponse(error) {
  const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 400;
  return json({ error: error.message || "Une erreur est survenue." }, status);
}
