# Orion — PayPal vérifié + notification Discord (Netlify)

Ce projet conserve la page Orion et ajoute des Netlify Functions. Les secrets PayPal et Discord ne sont jamais placés dans le HTML ou dans le dépôt.

## Ce qui se passe

1. Le navigateur envoie les réponses du formulaire et les options à `POST /api/create-order`.
2. La fonction recalcule le prix côté serveur et crée une commande PayPal `CAPTURE`.
3. Le client approuve le paiement sur PayPal puis revient sur Orion.
4. `POST /api/capture-order` capture le paiement via l'API PayPal et vérifie le statut, la devise et le montant.
5. PayPal envoie `PAYMENT.CAPTURE.COMPLETED` à `/api/paypal-webhook`. La fonction vérifie la signature auprès de PayPal, compare la capture au total stocké et seulement ensuite envoie les options et toutes les réponses dans le webhook Discord.
6. Les commandes sont stockées dans Netlify Blobs pour que les données restent disponibles entre les fonctions. Les notifications trop longues sont réparties en plusieurs messages Discord.

Le retour navigateur seul ne déclenche jamais la notification Discord. Le webhook PayPal signé et le montant vérifié sont la source de vérité pour la notification.

## 1. Déployer sur Netlify

- Décompressez ce dossier et importez-le dans un dépôt Git (ou déployez le dossier avec Netlify CLI).
- Dans Netlify, liez le dépôt au site Orion. Le répertoire de publication est `.` et les fonctions sont dans `netlify/functions` (déjà configuré dans `netlify.toml`).
- Déclenchez un déploiement après avoir défini les variables d'environnement.

Netlify Functions et Netlify Blobs doivent être disponibles pour le site. N'essayez pas de tester le paiement réel en ouvrant `index.html` directement depuis votre ordinateur (`file://`) : utilisez un déploiement Netlify ou `netlify dev`.

## 2. Configurer PayPal en mode test

Dans [PayPal Developer](https://developer.paypal.com/), créez une application REST **Sandbox** et récupérez son Client ID et son Secret.

Dans Netlify : **Project configuration → Environment variables**, ajoutez les variables suivantes (scope Functions, si ce choix est proposé) :

- `PAYPAL_ENV` = `sandbox`
- `PAYPAL_CLIENT_ID` = votre Client ID Sandbox
- `PAYPAL_CLIENT_SECRET` = votre Secret Sandbox
- `PAYPAL_WEBHOOK_ID` = l'identifiant du webhook créé à l'étape suivante
- `DISCORD_WEBHOOK_URL` = l'URL complète du webhook Discord privé

Ajoutez-les dans l'interface Netlify, pas dans `netlify.toml`, `index.html`, Git, ou un message Discord. Après modification, relancez un déploiement pour que les fonctions reçoivent les variables mises à jour.

## 3. Créer le webhook PayPal

Dans les paramètres de la même application REST Sandbox, créez un webhook avec l'URL exacte :

`https://VOTRE-SITE.netlify.app/api/paypal-webhook`

Remplacez l'hôte par le domaine Netlify de votre site. Abonnez-vous à l'événement **`PAYMENT.CAPTURE.COMPLETED`**. Copiez le **Webhook ID** généré dans `PAYPAL_WEBHOOK_ID` sur Netlify, puis redéployez.

Le code demande à l'API PayPal de vérifier la signature de chaque événement. Ne désactivez pas cette vérification.

## 4. Créer le webhook Discord

Dans le canal Discord réservé à l'équipe Orion : **Modifier le salon → Intégrations → Webhooks → Nouveau webhook**. Copiez l'URL du webhook et enregistrez-la dans `DISCORD_WEBHOOK_URL` sur Netlify. Ne la publiez pas et ne l'ajoutez pas au JavaScript du navigateur.

Les messages contiennent les coordonnées et les réponses de projet du client. Limitez l'accès au canal aux personnes qui en ont besoin et mettez à jour la politique de confidentialité pour informer les clients de ce transfert.

## 5. Tester en Sandbox

- Utilisez un compte acheteur PayPal Sandbox et l'application Sandbox.
- Passez une commande avec des options variées et remplissez toutes les parties du formulaire.
- Approuvez le paiement dans PayPal Sandbox.
- Vérifiez dans Netlify Functions logs que les fonctions n'ont pas d'erreur, puis vérifiez le canal Discord : les messages doivent contenir le total payé, les options et toutes les réponses.
- Testez aussi une annulation et une notification PayPal simulée. Une commande annulée ou un événement avec signature invalide ne doit pas produire de notification payée.

Ne passez en production qu'après les tests : configurez `PAYPAL_ENV=live`, les identifiants de l'application **Live**, un webhook **Live** avec son propre ID et l'URL de production. Ne mélangez jamais les identifiants Sandbox et Live.

## Notes importantes

- Le serveur recalcule les prix à partir des options autorisées ; il ne fait pas confiance au total affiché par le navigateur. Un total à 0,00 € est refusé, car PayPal ne peut pas encaisser une commande gratuite via ce flux.
- Le webhook Discord est déclenché uniquement après un événement PayPal `PAYMENT.CAPTURE.COMPLETED` dont la signature et le montant ont été vérifiés.
- Les commandes et réponses sont conservées dans Netlify Blobs. Définissez une durée de conservation adaptée et ajoutez un processus de suppression si nécessaire.
- Ce paquet est un socle d'intégration, pas une garantie de conformité juridique. Avant le lancement, vérifiez la politique de confidentialité, les mentions légales, la fiscalité et les conditions de vente applicables.
