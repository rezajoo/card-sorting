(() => {
  "use strict";

  const config = window.CARD_SORT_CONFIG || {};
  const scriptUrl = (config.scriptUrl || "").trim();

  const state = {
    study: null,
    name: "",
    email: "",
    placements: {}, // cardId -> categoryId | null
    order: [], // cardId display order (within each category / unsorted)
    selectedCardId: null,
    dragCardId: null,
  };

  const els = {
    loadingPanel: document.getElementById("loadingPanel"),
    errorPanel: document.getElementById("errorPanel"),
    errorMessage: document.getElementById("errorMessage"),
    retryBtn: document.getElementById("retryBtn"),
    introPanel: document.getElementById("introPanel"),
    studyTitle: document.getElementById("studyTitle"),
    studyInstructions: document.getElementById("studyInstructions"),
    participantForm: document.getElementById("participantForm"),
    participantName: document.getElementById("participantName"),
    participantEmail: document.getElementById("participantEmail"),
    participantError: document.getElementById("participantError"),
    sortPanel: document.getElementById("sortPanel"),
    progressLabel: document.getElementById("progressLabel"),
    unsortedList: document.getElementById("unsortedList"),
    unsortedCount: document.getElementById("unsortedCount"),
    categoriesGrid: document.getElementById("categoriesGrid"),
    sortStatus: document.getElementById("sortStatus"),
    reviewBtn: document.getElementById("reviewBtn"),
    reviewPanel: document.getElementById("reviewPanel"),
    reviewSummary: document.getElementById("reviewSummary"),
    backToSortBtn: document.getElementById("backToSortBtn"),
    submitBtn: document.getElementById("submitBtn"),
    submitError: document.getElementById("submitError"),
    successPanel: document.getElementById("successPanel"),
    successMessage: document.getElementById("successMessage"),
    pickerOverlay: document.getElementById("pickerOverlay"),
    pickerCardLabel: document.getElementById("pickerCardLabel"),
    pickerOptions: document.getElementById("pickerOptions"),
    pickerCancel: document.getElementById("pickerCancel"),
  };

  function showOnly(panel) {
    [
      els.loadingPanel,
      els.errorPanel,
      els.introPanel,
      els.sortPanel,
      els.reviewPanel,
      els.successPanel,
    ].forEach((node) => {
      node.hidden = node !== panel;
    });
  }

  const DEMO_STUDY = {
    title: "Digital Onboarding study",
    instructions:
      "This is demo data (config.js has no Apps Script URL yet).\n\nSort each feature into the category that best matches how you would prioritize it.",
    shuffleCards: "TRUE",
    categories: [
      {
        id: "must-have",
        label: "Must have",
        description: "Essential for launch",
      },
      {
        id: "nice",
        label: "Nice to have",
        description: "Useful but not critical",
      },
      {
        id: "drop",
        label: "Not needed",
        description: "Does not belong in the product",
      },
    ],
    cards: [
      { id: "search", label: "Search", description: "Find products quickly" },
      { id: "cart", label: "Cart", description: "Review items before checkout" },
      { id: "wishlist", label: "Wishlist", description: "Save items for later" },
      { id: "reviews", label: "Reviews", description: "Read ratings from other buyers" },
      { id: "chat", label: "Help chat", description: "Talk to support live" },
      { id: "compare", label: "Compare", description: "Side-by-side product comparison" },
    ],
  };

  function isConfigured() {
    return (
      scriptUrl &&
      !scriptUrl.includes("PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE") &&
      /^https:\/\/script\.google\.com\//.test(scriptUrl)
    );
  }

  async function apiGetStudy() {
    const url = `${scriptUrl}?action=getStudy`;
    const response = await fetch(url, { method: "GET", redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Could not load study (HTTP ${response.status}).`);
    }
    const data = await response.json();
    if (!data || data.ok === false) {
      throw new Error((data && data.error) || "Study response was invalid.");
    }
    return data.study || data;
  }

  async function apiSubmit(payload) {
    if (!isConfigured()) {
      // Local demo: pretend success so the flow can be reviewed without Sheets
      await new Promise((resolve) => setTimeout(resolve, 400));
      console.info("Demo submit (not saved to Google Sheets):", payload);
      return { ok: true, demo: true };
    }

    // text/plain avoids a CORS preflight that Apps Script does not handle well
    const response = await fetch(scriptUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "submit", ...payload }),
    });
    if (!response.ok) {
      throw new Error(`Submit failed (HTTP ${response.status}).`);
    }
    const data = await response.json();
    if (!data || data.ok === false) {
      throw new Error((data && data.error) || "Submit was rejected.");
    }
    return data;
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function normalizeStudy(raw) {
    const title = "Digital Onboarding study";
    const instructions = String(
      raw.instructions ||
        "Sort each card into the category that fits best. Drag cards or tap them on mobile."
    ).trim();
    const shuffleCards = String(raw.shuffleCards ?? "true").toLowerCase() !== "false";

    const categories = (raw.categories || [])
      .map((c, index) => ({
        id: String(c.id || c.categoryId || `cat-${index + 1}`).trim(),
        label: String(c.label || c.name || "").trim(),
        description: String(c.description || "").trim(),
      }))
      .filter((c) => c.label);

    let cards = (raw.cards || [])
      .map((c, index) => ({
        id: String(c.id || c.cardId || `card-${index + 1}`).trim(),
        label: String(c.label || c.name || "").trim(),
        description: String(c.description || "").trim(),
      }))
      .filter((c) => c.label);

    if (!categories.length) {
      throw new Error("No categories found in the Google Sheet.");
    }
    if (!cards.length) {
      throw new Error("No cards found in the Google Sheet.");
    }

    if (shuffleCards) {
      cards = shuffle(cards);
    }

    return { title, instructions, categories, cards };
  }

  function initPlacements() {
    state.placements = {};
    state.order = state.study.cards.map((card) => card.id);
    state.study.cards.forEach((card) => {
      state.placements[card.id] = null;
    });
  }

  function sortedCount() {
    return Object.values(state.placements).filter(Boolean).length;
  }

  function allSorted() {
    return sortedCount() === state.study.cards.length;
  }

  function getCard(cardId) {
    return state.study.cards.find((c) => c.id === cardId);
  }

  function sameBucket(a, b) {
    return (state.placements[a] || null) === (state.placements[b] || null);
  }

  function orderedCardsInBucket(categoryId) {
    return state.order
      .map((id) => getCard(id))
      .filter((card) => {
        if (!card) return false;
        const placed = state.placements[card.id];
        if (categoryId == null) return !placed;
        return placed === categoryId;
      });
  }

  function moveCard(cardId, direction) {
    const bucketIds = state.order.filter((id) => sameBucket(id, cardId));
    const index = bucketIds.indexOf(cardId);
    if (index < 0) return;

    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= bucketIds.length) return;

    const otherId = bucketIds[swapIndex];
    const iA = state.order.indexOf(cardId);
    const iB = state.order.indexOf(otherId);
    if (iA < 0 || iB < 0) return;

    state.order[iA] = otherId;
    state.order[iB] = cardId;
    renderLists();
  }

  function createCardElement(card, position) {
    const el = document.createElement("article");
    el.className = "sort-card";
    el.draggable = true;
    el.dataset.cardId = card.id;
    el.setAttribute("role", "listitem");
    el.tabIndex = 0;

    const body = document.createElement("div");
    body.className = "card-body";

    const title = document.createElement("p");
    title.className = "card-title";
    title.textContent = card.label;
    body.appendChild(title);

    if (card.description) {
      const desc = document.createElement("p");
      desc.className = "card-desc";
      desc.textContent = card.description;
      body.appendChild(desc);
    }

    const controls = document.createElement("div");
    controls.className = "card-controls";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Reorder card");

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "card-move";
    upBtn.setAttribute("aria-label", `Move ${card.label} up`);
    upBtn.title = "Move up";
    upBtn.textContent = "↑";
    upBtn.disabled = position.index === 0;

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "card-move";
    downBtn.setAttribute("aria-label", `Move ${card.label} down`);
    downBtn.title = "Move down";
    downBtn.textContent = "↓";
    downBtn.disabled = position.index >= position.total - 1;

    function stopCardGesture(event) {
      event.stopPropagation();
    }

    [upBtn, downBtn].forEach((btn) => {
      btn.addEventListener("mousedown", stopCardGesture);
      btn.addEventListener("pointerdown", stopCardGesture);
      btn.addEventListener("touchstart", stopCardGesture, { passive: true });
      btn.addEventListener("click", stopCardGesture);
    });

    upBtn.addEventListener("click", (event) => {
      event.preventDefault();
      moveCard(card.id, "up");
    });
    downBtn.addEventListener("click", (event) => {
      event.preventDefault();
      moveCard(card.id, "down");
    });

    controls.append(upBtn, downBtn);
    el.append(body, controls);

    el.addEventListener("dragstart", onDragStart);
    el.addEventListener("dragend", onDragEnd);
    el.addEventListener("click", (event) => {
      if (event.target.closest(".card-controls")) return;
      openPicker(card.id);
    });
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPicker(card.id);
      }
    });

    return el;
  }

  function renderLists() {
    const byCategory = {};
    state.study.categories.forEach((cat) => {
      byCategory[cat.id] = [];
    });
    const unsorted = [];

    state.order.forEach((cardId) => {
      const card = getCard(cardId);
      if (!card) return;
      const catId = state.placements[card.id];
      if (catId && byCategory[catId]) {
        byCategory[catId].push(card);
      } else {
        unsorted.push(card);
      }
    });

    fillList(els.unsortedList, unsorted);
    els.unsortedCount.textContent = String(unsorted.length);

    state.study.categories.forEach((cat) => {
      const list = document.querySelector(`[data-category-list="${CSS.escape(cat.id)}"]`);
      const count = document.querySelector(`[data-category-count="${CSS.escape(cat.id)}"]`);
      if (list) fillList(list, byCategory[cat.id] || []);
      if (count) count.textContent = String((byCategory[cat.id] || []).length);
    });

    const done = sortedCount();
    const total = state.study.cards.length;
    els.progressLabel.hidden = false;
    els.progressLabel.textContent = `${done} of ${total} sorted`;
    els.reviewBtn.disabled = !allSorted();
    els.sortStatus.textContent = allSorted()
      ? "All cards sorted. Ready to review."
      : `Sort every card to continue (${total - done} left).`;
  }

  function fillList(container, cards) {
    container.innerHTML = "";
    if (!cards.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Drop cards here";
      container.appendChild(empty);
      return;
    }
    cards.forEach((card, index) =>
      container.appendChild(
        createCardElement(card, { index, total: cards.length })
      )
    );
  }

  function buildCategories() {
    els.categoriesGrid.innerHTML = "";
    state.study.categories.forEach((cat) => {
      const section = document.createElement("section");
      section.className = "category";
      section.dataset.categoryId = cat.id;
      section.setAttribute("role", "listitem");

      const header = document.createElement("div");
      header.className = "category-header";

      const heading = document.createElement("h2");
      heading.textContent = cat.label;

      const count = document.createElement("span");
      count.className = "count-pill";
      count.dataset.categoryCount = cat.id;
      count.textContent = "0";

      header.append(heading, count);
      section.appendChild(header);

      if (cat.description) {
        const desc = document.createElement("p");
        desc.className = "category-desc";
        desc.textContent = cat.description;
        section.appendChild(desc);
      }

      const list = document.createElement("div");
      list.className = "card-list";
      list.dataset.categoryList = cat.id;
      list.dataset.dropCategory = cat.id;
      wireDropZone(list, cat.id);
      section.appendChild(list);

      els.categoriesGrid.appendChild(section);
    });

    wireDropZone(els.unsortedList, null);
  }

  function wireDropZone(element, categoryId) {
    element.addEventListener("dragover", (event) => {
      event.preventDefault();
      element.classList.add("drag-over");
    });
    element.addEventListener("dragleave", () => {
      element.classList.remove("drag-over");
    });
    element.addEventListener("drop", (event) => {
      event.preventDefault();
      element.classList.remove("drag-over");
      const cardId =
        event.dataTransfer.getData("text/plain") || state.dragCardId;
      if (!cardId) return;
      placeCard(cardId, categoryId);
    });
  }

  function onDragStart(event) {
    const cardId = event.currentTarget.dataset.cardId;
    state.dragCardId = cardId;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer.setData("text/plain", cardId);
    event.dataTransfer.effectAllowed = "move";
  }

  function onDragEnd(event) {
    event.currentTarget.classList.remove("dragging");
    state.dragCardId = null;
    document
      .querySelectorAll(".card-list.drag-over")
      .forEach((node) => node.classList.remove("drag-over"));
  }

  function placeCard(cardId, categoryId) {
    if (!(cardId in state.placements)) return;
    state.placements[cardId] = categoryId;
    renderLists();
  }

  function openPicker(cardId) {
    const card = getCard(cardId);
    if (!card) return;
    state.selectedCardId = cardId;
    els.pickerCardLabel.textContent = card.label;
    els.pickerOptions.innerHTML = "";

    const unsortBtn = document.createElement("button");
    unsortBtn.type = "button";
    unsortBtn.textContent = "Back to unsorted";
    unsortBtn.addEventListener("click", () => {
      placeCard(cardId, null);
      closePicker();
    });
    els.pickerOptions.appendChild(unsortBtn);

    state.study.categories.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = cat.label;
      btn.addEventListener("click", () => {
        placeCard(cardId, cat.id);
        closePicker();
      });
      els.pickerOptions.appendChild(btn);
    });

    els.pickerOverlay.hidden = false;
  }

  function closePicker() {
    state.selectedCardId = null;
    els.pickerOverlay.hidden = true;
  }

  function renderReview() {
    els.reviewSummary.innerHTML = "";
    state.study.categories.forEach((cat) => {
      const cards = orderedCardsInBucket(cat.id);
      const group = document.createElement("div");
      group.className = "review-group";
      const heading = document.createElement("h3");
      heading.textContent = `${cat.label} (${cards.length})`;
      const list = document.createElement("ul");
      if (!cards.length) {
        const li = document.createElement("li");
        li.textContent = "No cards";
        list.appendChild(li);
      } else {
        cards.forEach((card) => {
          const li = document.createElement("li");
          li.textContent = card.label;
          list.appendChild(li);
        });
      }
      group.append(heading, list);
      els.reviewSummary.appendChild(group);
    });
  }

  function buildSubmissionPayload() {
    const results = state.order
      .map((cardId) => getCard(cardId))
      .filter(Boolean)
      .map((card, index) => {
        const categoryId = state.placements[card.id];
        const category = state.study.categories.find((c) => c.id === categoryId);
        return {
          cardId: card.id,
          cardLabel: card.label,
          categoryId: categoryId || "",
          categoryLabel: category ? category.label : "",
          sortOrder: index + 1,
        };
      });

    return {
      name: state.name,
      email: state.email,
      studyTitle: state.study.title,
      results,
    };
  }

  async function loadStudy() {
    showOnly(els.loadingPanel);
    els.progressLabel.hidden = true;

    try {
      let raw;
      if (!isConfigured()) {
        raw = DEMO_STUDY;
      } else {
        raw = await apiGetStudy();
      }
      state.study = normalizeStudy(raw);
      document.title = state.study.title;
      els.studyTitle.textContent = state.study.title;
      els.studyInstructions.textContent = state.study.instructions;
      showOnly(els.introPanel);
    } catch (error) {
      els.errorMessage.textContent =
        error && error.message
          ? error.message
          : "Something went wrong while loading the study.";
      showOnly(els.errorPanel);
    }
  }

  els.retryBtn.addEventListener("click", loadStudy);

  els.participantForm.addEventListener("submit", (event) => {
    event.preventDefault();
    els.participantError.hidden = true;

    const name = els.participantName.value.trim();
    const email = els.participantEmail.value.trim();

    if (!name || !email) {
      els.participantError.textContent = "Please enter both name and email.";
      els.participantError.hidden = false;
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      els.participantError.textContent = "Please enter a valid email address.";
      els.participantError.hidden = false;
      return;
    }

    state.name = name;
    state.email = email;
    initPlacements();
    buildCategories();
    renderLists();
    showOnly(els.sortPanel);
  });

  els.reviewBtn.addEventListener("click", () => {
    if (!allSorted()) return;
    renderReview();
    showOnly(els.reviewPanel);
  });

  els.backToSortBtn.addEventListener("click", () => {
    showOnly(els.sortPanel);
    renderLists();
  });

  els.submitBtn.addEventListener("click", async () => {
    els.submitError.hidden = true;
    els.submitBtn.disabled = true;
    els.submitBtn.textContent = "Submitting…";

    try {
      const result = await apiSubmit(buildSubmissionPayload());
      els.successMessage.textContent = result.demo
        ? `Thanks, ${state.name}. Demo mode only — connect Apps Script in config.js to save to Google Sheets.`
        : `Thanks, ${state.name}. Your card sort was saved to the response sheet.`;
      showOnly(els.successPanel);
      els.progressLabel.hidden = true;
    } catch (error) {
      els.submitError.textContent =
        error && error.message
          ? error.message
          : "Could not save your response. Please try again.";
      els.submitError.hidden = false;
      els.submitBtn.disabled = false;
      els.submitBtn.textContent = "Submit results";
    }
  });

  els.pickerCancel.addEventListener("click", closePicker);
  els.pickerOverlay.addEventListener("click", (event) => {
    if (event.target === els.pickerOverlay) closePicker();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.pickerOverlay.hidden) closePicker();
  });

  loadStudy();
})();
