document.addEventListener("DOMContentLoaded", () => {
  // Année dans le pied de page
  const year = document.getElementById("year");

  if (year) {
    year.textContent = new Date().getFullYear();
  }

  // Menu mobile
  const menuToggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".main-nav");

  if (menuToggle && nav) {
    menuToggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");

      menuToggle.setAttribute("aria-expanded", String(open));
      menuToggle.textContent = open ? "✕" : "☰";
    });

    nav.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        nav.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.textContent = "☰";
      });
    });
  }

  // Options et tarifs
  const options = {
    photos: {
      value: 0,
      min: 0,
      max: 10,
      price: 0.50,
      output: "photos-count",
      label: "Photos supplémentaires"
    },

    siteVideos: {
      value: 0,
      min: 0,
      max: 5,
      price: 10,
      output: "site-videos-count",
      label: "Vidéos supplémentaires sur le site"
    },

    socialVideos: {
      value: 0,
      min: 0,
      max: 5,
      price: 5,
      output: "social-videos-count",
      label: "Vidéos promotionnelles"
    }
  };

  // Éléments du configurateur
  const domain = document.getElementById("domain");
  const logo = document.getElementById("logo");
  const coach = document.getElementById("coach");

  const totalPrice = document.getElementById("total-price");
  const summaryLines = document.getElementById("summary-lines");
  const billingCaption = document.getElementById("billing-caption");

  // Formater les montants en euros
  function money(value) {
    return value.toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR"
    });
  }

  // Ajouter une ligne au récapitulatif
  function addLine(label, amount, detail = "") {
    const line = document.createElement("div");
    line.className = "summary-line";

    if (amount === 0) {
      line.classList.add("muted");
    }

    const name = document.createElement("span");
    name.textContent = detail
      ? `${label} · ${detail}`
      : label;

    const price = document.createElement("span");
    price.textContent = money(amount);

    line.append(name, price);
    summaryLines.appendChild(line);
  }

  // Recalculer le prix total
  function renderSummary() {
    if (!summaryLines || !totalPrice) return;

    let total = 0;
    let hasAnnual = false;

    summaryLines.replaceChildren();

    // Pack de base gratuit
    addLine("Pack de base", 0, "inclus");

    // Photos et vidéos
    Object.values(options).forEach(option => {
      const amount = option.value * option.price;

      if (option.value > 0) {
        addLine(
          option.label,
          amount,
          `${option.value} × ${money(option.price)}`
        );

        total += amount;
      }
    });

    // Nom de domaine
    const domainPrice = domain
      ? Number(domain.value)
      : 0;

    if (domainPrice > 0) {
      const domainName =
        domain.options[domain.selectedIndex].text.split(" — ")[0];

      addLine(
        `Nom de domaine ${domainName}`,
        domainPrice,
        "par an"
      );

      total += domainPrice;
      hasAnnual = true;
    } else {
      addLine(
        "Hébergement / domaine Netlify",
        0,
        "inclus"
      );
    }

    // Logo à 25 €
    if (logo && logo.checked) {
      addLine("Création d'un logo", 25);
      total += 25;
    }

    // Accompagnement à 25 €
    if (coach && coach.checked) {
      addLine("Accompagnement influenceur", 25);
      total += 25;
    }

    // Affichage du total
    totalPrice.textContent = money(total);

    if (billingCaption) {
      billingCaption.textContent = hasAnnual
        ? "Total estimé, dont le nom de domaine facturé à l'année."
        : "Total estimé des options sélectionnées.";
    }
  }

  // Fonctionnement des boutons + et -
  document.querySelectorAll("[data-option]").forEach(stepper => {
    const key = stepper.dataset.option;
    const option = options[key];

    if (!option) return;

    const output = document.getElementById(option.output);
    const minus = stepper.querySelector('[data-change="-1"]');
    const plus = stepper.querySelector('[data-change="1"]');

    function update(delta) {
      option.value = Math.max(
        option.min,
        Math.min(option.max, option.value + delta)
      );

      output.textContent = option.value;

      // Désactiver les boutons aux limites
      minus.disabled = option.value === option.min;
      plus.disabled = option.value === option.max;

      renderSummary();
    }

    minus.addEventListener("click", () => update(-1));
    plus.addEventListener("click", () => update(1));

    update(0);
  });

  // Mise à jour quand une option change
  if (domain) {
    domain.addEventListener("change", renderSummary);
  }

  if (logo) {
    logo.addEventListener("change", renderSummary);
  }

  if (coach) {
    coach.addEventListener("change", renderSummary);
  }

  // Afficher le prix initial
  renderSummary();

  // Bouton de commande provisoire
  const orderButton = document.getElementById("order-button");
  const orderMessage = document.getElementById("order-message");

  if (orderButton && orderMessage) {
    orderButton.addEventListener("click", () => {
      orderMessage.textContent =
        "Merci pour ton intérêt ! La commande en ligne n'est pas encore activée. Pour le moment, contacte l'équipe Orion via notre serveur Discord.";

      orderMessage.classList.add("message-highlight");

      orderMessage.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });
    });
  }
});
