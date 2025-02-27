class QwertyKeyboard extends HTMLElement {
  constructor() {
    super();
    this.closeButtons = this.querySelectorAll("[data-close]");
    this.textAreaRandom = this.querySelector("[data-random-text]");
    this.textAreaDefault = this.querySelector("[data-default-text]");
    this.textAreaCustom = this.querySelector("[data-custom-text]");

    this.previewArea = this.querySelector("[data-preview]");
    this.keyboard = this.querySelector("[data-keyboard]");

    this.initButtons = this.querySelectorAll("[data-init]");

    this.modal = this.querySelector("[data-modal]");
    this.accuracy = this.querySelector("[data-accuracy]");
    this.speed = this.querySelector("[data-speed]");
    this.FormSettings = this.querySelector("[data-settings]");
    this.settings = this.FormSettings.querySelectorAll("input");
    this.startTime = null;

    // Initialize sound objects
    this.keyboardSounds = {};
    this.speedSounds = {};

    // Initialize other properties
    this.keyCodeMap = {};
    this.wordsArray = [];

    // Add new property to store last used text
    this.lastUsedText = "";

    // Load all data
    this.loadData();
  }

  async loadData() {
    try {
      // Load all data in parallel
      const [
        keycodeResponse,
        wordsResponse,
        speedSoundsResponse,
        keyboardSoundsResponse,
      ] = await Promise.all([
        fetch("./keycode-map.json"),
        fetch("./words.json"),
        fetch("./speed-sounds.json"),
        fetch("./keyboard-sounds.json"),
      ]);

      // Check if all responses are ok
      if (
        !keycodeResponse.ok ||
        !wordsResponse.ok ||
        !speedSoundsResponse.ok ||
        !keyboardSoundsResponse.ok
      ) {
        throw new Error("Failed to load one or more data files");
      }

      // Parse all responses
      const speedSoundsData = await speedSoundsResponse.json();
      const keyboardSoundsData = await keyboardSoundsResponse.json();
      [this.keyCodeMap, this.wordsArray] = await Promise.all([
        keycodeResponse.json(),
        wordsResponse.json(),
      ]);

      // Initialize Audio objects for keyboard sounds
      for (const [type, path] of Object.entries(keyboardSoundsData)) {
        this.keyboardSounds[type] = new Audio(path);
      }

      // Initialize Audio objects for each speed category
      for (const [category, paths] of Object.entries(speedSoundsData)) {
        this.speedSounds[category] = paths.map((path) => new Audio(path));
      }

      // Initialize typing after all data is loaded
      this.initializeTyping(this.textAreaDefault);
      // Insert content after all data is loaded
      this.insertContent();
    } catch (error) {
      console.error("Error loading data:", error);
    }
  }

  connectedCallback() {
    this.keyboard.classList.toggle("hidden", !this.keyboardEnabled());

    // Add click handler for buttons with data-target attribute
    this.querySelectorAll("[data-target]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const targetId = button.getAttribute("data-target");
        const targetModal = this.querySelector(`#${targetId}`);
        if (targetModal) {
          targetModal.classList.remove("hidden");
        }
      });
    });

    // Update init button handler
    this.initButtons.forEach((initButton) => {
      initButton.addEventListener("click", (event) => {
        event.preventDefault();

        const source = this.querySelector(
          `[${initButton.getAttribute("data-source")}]`
        );

        this.initializeTyping(source);
      });
    });

    this.textAreaCustom.addEventListener("click", (event) => {
      this.previewArea.classList.remove("active");
    });

    this.settings.forEach((input) => {
      input.addEventListener("change", () => {
        this.keyboard.classList.toggle("hidden", !this.keyboardEnabled());
      });
    });

    this.querySelectorAll("form input[name='source']").forEach((input) => {
      input.addEventListener("change", () => {
        this.insertContent();
      });
    });

    this.closeButtons.forEach((closeButton) => {
      closeButton.addEventListener("click", () => {
        this.closeModals();
      });
    });

    document.addEventListener("keydown", this.handleKeydown.bind(this));

    // Add handler for "Try again (with the same text)" button
    const sameTextButton = this.querySelector("[data-same]");
    if (sameTextButton) {
      sameTextButton.addEventListener("click", (event) => {
        event.preventDefault();

        // Create temporary textarea with last used text
        const tempTextArea = document.createElement("textarea");
        tempTextArea.value = this.lastUsedText;

        this.initializeTyping(tempTextArea);
      });
    }
  }

  initializePreview(textarea) {
    const currentTextArea = textarea;

    if (currentTextArea && this.previewArea) {
      this.previewArea.innerHTML = "";
      const text = currentTextArea.value;
      const lines = text.split("\n");

      const minIndent = Math.min(
        ...lines
          .filter((line) => line.trim().length > 0)
          .map((line) => line.match(/^ */)[0].length)
      );

      const normalizedLines = lines.map((line) => line.slice(minIndent));

      normalizedLines.forEach((line, lineIndex, allLines) => {
        line.split("").forEach((char) => {
          const span = document.createElement("span");
          span.textContent = char;
          const keyCode = this.keyCodeMap[char.toLowerCase()] || "Unknown";
          span.setAttribute("data-code", keyCode);
          this.previewArea.appendChild(span);
        });

        if (lineIndex < allLines.length - 1) {
          this.insertNewLine();
        }
      });

      this.formatTextWithLineBreaks(this.previewArea);
    }
  }

  insertNewLine() {
    const enter = document.createElement("span");
    enter.textContent = "↵";
    enter.setAttribute("data-code", "Enter");
    this.previewArea.appendChild(enter);
    this.previewArea.appendChild(document.createElement("br"));
  }

  // highlight All word keys
  highlightWord() {
    if (!this.previewArea || !this.keyboard) return;

    // Clear existing highlights
    this.keyboard
      .querySelectorAll('[class*="highlight"], [class*="order-"]')
      .forEach((key) => {
        key.className = key.className
          .replace(/\bhighlight(--\d+)?\b|\border-\d+\b/g, "")
          .trim();
      });

    // Find the first untyped character
    let expectedChar = this.previewArea.querySelector("span:not(.typed)");

    this.keyboard.querySelectorAll(".expected").forEach((expected) => {
      expected.classList.remove("expected");
    });

    if (!expectedChar) return;

    const expectedKey = this.keyboard.querySelector(
      `[data-code="${expectedChar.dataset.code}"]`
    );
    if (!expectedKey) return;
    expectedKey.classList.add("expected");

    // Add expected class to Shift key if character is uppercase
    const char = expectedChar.textContent;
    const isUpperCase =
      char === char.toUpperCase() && char !== char.toLowerCase();
    const requiresShift = /[~!@#$%^&*()_+{}|:"<>?]/.test(char);

    if (isUpperCase || requiresShift) {
      const shiftKey = /[QWERTASDFGZXCV!@#$%]/.test(char.toUpperCase())
        ? this.keyboard.querySelector('[data-code="ShiftRight"]')
        : this.keyboard.querySelector('[data-code="ShiftLeft"]');

      if (shiftKey) {
        shiftKey.classList.add("expected");
      }
    }

    // Collect all characters until the next space
    const characters = [];
    while (expectedChar && expectedChar.getAttribute("data-code") !== "Space") {
      characters.push(expectedChar);
      expectedChar = expectedChar.nextElementSibling;
    }

    // Highlight all characters in the word and add order classes
    this.addOrderClasses(characters);

    this.highlightCurernt();
  }

  addOrderClasses(characters) {
    const keyUsage = new Map();

    characters.forEach((charElement, index) => {
      const char = charElement.textContent;
      const keyCode = charElement.getAttribute("data-code");
      const keyElement = this.keyboard.querySelector(
        `[data-code="${keyCode}"]`
      );
      if (!keyElement) return;

      keyElement.classList.add("highlight");
      keyElement.classList.add(`highlight--${index}`);

      // Track order of key usage
      if (!keyUsage.has(keyCode)) {
        keyUsage.set(keyCode, []);
      }
      keyUsage.get(keyCode).push(index + 1);

      const isUpperCase =
        char === char.toUpperCase() && char !== char.toLowerCase();
      const requiresShift = /[~!@#$%^&*()_+{}|:"<>?]/.test(char);

      if (isUpperCase || requiresShift) {
        const shiftKey = /[QWERTASDFGZXCV!@#$%]/.test(char.toUpperCase())
          ? this.keyboard.querySelector('[data-code="ShiftRight"]')
          : this.keyboard.querySelector('[data-code="ShiftLeft"]');

        if (shiftKey) {
          shiftKey.classList.add("highlight");
        }
      }
    });

    // Add order classes to each key
    keyUsage.forEach((orders, keyCode) => {
      const keyElement = this.keyboard.querySelector(
        `[data-code="${keyCode}"]`
      );
      if (keyElement) {
        orders.forEach((order) => keyElement.classList.add(`order-${order}`));
      }
    });
  }

  handleKeydown(event) {
    if (!Object.values(this.keyCodeMap).includes(event.code)) return;
    if (!this.previewArea.classList.contains("active")) return;

    if (!this.startTime) {
      const timeIsTheSame = this.startTime === Date.now();

      if (!timeIsTheSame) {
        this.startTime = Date.now();
      }
    }

    if (event.key === "Shift") return;

    event.preventDefault();

    this.keyboard.querySelectorAll(".highlight").forEach((highlight) => {
      highlight.classList.remove("highlight");
    });

    const expectedChar = this.previewArea.querySelector("span:not(.typed)");

    if (!expectedChar) {
      return;
    }

    const expectedCharText = expectedChar.textContent;

    expectedChar.classList.add("typed");

    let isCorrect = true;

    if (event.key != expectedCharText) {
      isCorrect = false;
    }

    if (expectedCharText === "↵" && event.key === "Enter") {
      isCorrect = true;
    }

    if (!isCorrect) {
      this.displayError();
    }

    const allLettersCount = this.previewArea.querySelectorAll("span").length;
    const typedLettersCount =
      this.previewArea.querySelectorAll("span.typed").length;
    const isSoundsEnabled = this.soundsEnabled();

    this.highlightWord();

    this.scrollToCurrentElement();

    if (isSoundsEnabled) {
      this.playKeySound(event.code, isCorrect);
    }

    if (allLettersCount === typedLettersCount) {
      this.previewArea.querySelector(".current").classList.remove("current");

      const allletters = this.previewArea.querySelectorAll("span");
      this.end(allletters);
    }
  }

  scrollToCurrentElement() {
    const parent = this.previewArea;
    const current = parent.querySelector(".current");
    const scrollOffset = 50;

    if (!parent || !current) return;

    const parentRect = parent.getBoundingClientRect();
    const currentRect = current.getBoundingClientRect();

    if (
      currentRect.top - scrollOffset < parentRect.top ||
      currentRect.bottom + scrollOffset > parentRect.bottom
    ) {
      const targetScroll =
        parent.scrollTop + currentRect.top - parentRect.top - scrollOffset - 60;
      parent.scrollTo({
        top: targetScroll,
        behavior: "smooth",
      });
    }

    const observer = new MutationObserver(() => {
      const updatedRect = current.getBoundingClientRect();

      if (
        updatedRect.top - scrollOffset < parentRect.top ||
        updatedRect.bottom + scrollOffset > parentRect.bottom
      ) {
        const targetScroll =
          parent.scrollTop + updatedRect.top - parentRect.top - scrollOffset;
        parent.scrollTo({
          top: targetScroll,
          behavior: "smooth",
        });
      }
    });

    observer.observe(parent, { childList: true, subtree: true });
  }

  displayError() {
    this.previewArea.querySelector(".current").classList.add("error");
  }

  highlightCurernt() {
    this.previewArea.querySelectorAll(".current").forEach((current) => {
      current.classList.remove("current");
    });

    this.previewArea.querySelector("span:not(.typed)").classList.add("current");
  }

  end(letters) {
    let errors = 0;

    letters.forEach((letter) => {
      if (letter.classList.contains("error")) {
        errors++;
      }
    });

    const successRate = letters.length - errors;

    // Get accuracy percentage
    const accuracyPercentage = this.calculatePercentage(
      successRate,
      letters.length
    );

    // Get WPM
    const wpm = this.calculateWPM(letters.length, this.startTime, Date.now());

    // Calculate final score
    const finalScore = this.calculateFinalScore(wpm, accuracyPercentage);

    this.displayScore(finalScore, wpm, accuracyPercentage);
  }

  calculatePercentage(x, total) {
    if (total === 0) {
      throw new Error("Total cannot be zero.");
    }

    return (x / total) * 100;
  }

  calculateWPM(textLength, startTime, endTime) {
    if (!startTime || !endTime) return;

    const elapsedTimeInMinutes = (endTime - startTime) / (1000 * 60); // Convert milliseconds to minutes

    // Standard WPM calculation: (characters / 5) / minutes
    // 5 characters is considered one word
    const grossWPM = Math.round(textLength / 5 / elapsedTimeInMinutes);

    // Ensure the result is reasonable (prevent extreme values)
    const finalWPM = Math.min(Math.max(grossWPM, 0), 250); // Cap between 0 and 250 WPM

    return finalWPM;
  }

  displayScore(finalScore, wpm, accuracyPercentage) {
    this.modal.querySelector("[data-score]").textContent = finalScore;
    this.modal.querySelector("[data-speed]").textContent = `${wpm} WPM`;
    this.modal.querySelector(
      "[data-accuracy]"
    ).textContent = `${accuracyPercentage.toFixed(2)}%`;

    this.modal.classList.remove("hidden");
    this.startTime = null;

    if (this.soundsEnabled()) {
      this.playSpeedSound(finalScore);
    }
  }

  playSpeedSound(wpm) {
    let soundArray;
    if (wpm < 100) {
      soundArray = this.speedSounds.speed20;
    }

    // if (wpm < 20) {
    //   soundArray = this.speedSounds.speed20;
    // } else if (wpm < 30) {
    //   soundArray = this.speedSounds.speed20;
    // } else if (wpm < 40) {
    //   soundArray = this.speedSounds.speed30;
    // } else if (wpm > 40 && wpm < 60) {
    //   soundArray = this.speedSounds.speed60;
    // } else if (wpm > 100) {
    //   soundArray = this.speedSounds.speed100;
    // }

    if (soundArray && soundArray.length > 0) {
      const randomSound =
        soundArray[Math.floor(Math.random() * soundArray.length)];
      randomSound.play().catch((err) => {
        console.error("Error playing sound:", err);
      });
    }
  }

  initializeTyping(textAreaElement) {
    // Store the text content before initializing
    this.lastUsedText = textAreaElement.value;

    this.insertContent();
    this.initializePreview(textAreaElement);
    this.highlightWord();
    this.previewArea.classList.add("active");
    this.closeModals();
    this.startTime = null;

    setTimeout(() => {
      this.previewArea.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }, 10);
  }

  fetchParagraphs() {
    return fetch("paragraps.json")
      .then((response) => response.json())
      .then((paragraphs) => {
        return paragraphs;
      })
      .catch((error) => {
        console.error("Error fetching paragraphs:", error);
        return [];
      });
  }

  insertContent() {
    const source = this.getSource();

    if (source === "array") {
      this.contentFormArray();
    } else if (source === "json") {
      this.contentFromJson();
    } else if (source === "ninja") {
      this.contentFromNinja();
    } else if (source === "wikipedia") {
      this.contentFromWikipedia();
    }
    // Paragraphs from json files
    // this.contentFromJson();

    // Quotes from Ninja API
    // this.contentFromNinja();

    // Quotes from Wikipedia API
    // this.contentFromWikipedia();
  }

  getSource() {
    return this.querySelector("form input[name='source']:checked").value;
  }

  contentFormArray() {
    if (!this.wordsArray || this.wordsArray.length === 0) return;

    const maxChars = 150;
    const wordLimit = 2;
    const wordCount = {};
    let paragraph = "";

    while (true) {
      const randomIndex = Math.floor(Math.random() * this.wordsArray.length);
      const word = this.wordsArray[randomIndex];

      wordCount[word] = (wordCount[word] || 0) + 1;

      if (wordCount[word] > wordLimit) {
        wordCount[word]--;
        continue;
      }

      const tempParagraph = paragraph ? `${paragraph} ${word}` : word;

      if (tempParagraph.length > maxChars) break;

      paragraph = tempParagraph;
    }

    if (this.textAreaRandom) {
      this.textAreaRandom.value = paragraph;
    }

    return paragraph;
  }

  async contentFromJson() {
    try {
      const paragraphs = await this.fetchParagraphs();
      if (paragraphs.length === 0) return null;

      const randomIndex = Math.floor(Math.random() * paragraphs.length);
      const selectedParagraph = paragraphs[randomIndex].text;

      if (this.textAreaRandom) {
        this.textAreaRandom.value = selectedParagraph;
      }

      return selectedParagraph;
    } catch (error) {
      console.error("Error in contentFromJson:", error);
      return null;
    }
  }

  async contentFromNinja() {
    const url = `https://api.api-ninjas.com/v1/quotes`;

    try {
      const response = await fetch(url, {
        headers: { "X-Api-Key": "f6B2Gy5HYShGhsKzvsMlyw==f3Qb4CqANCGNDqUe" },
      });
      const data = await response.json();
      const quote = data[0].quote + "\n- " + data[0].author;

      if (this.textAreaRandom) {
        this.textAreaRandom.value = quote;
      }

      return quote;
    } catch (error) {
      console.error("Error:", error);
      return null;
    }
  }

  async contentFromWikipedia() {
    try {
      const response = await fetch(
        "https://en.wikipedia.org/api/rest_v1/page/random/summary"
      );
      const data = await response.json();

      if (this.isValidText(data.extract)) {
        this.textAreaRandom.value = data.extract;
      } else {
        // If text is invalid, try again
        return this.contentFromWikipedia();
      }
    } catch (error) {
      console.error("Error fetching Wikipedia data:", error);
    }
  }

  isValidText(text) {
    // Regular expression to match only standard keyboard characters
    const validChars = /^[a-zA-Z0-9\s.,!?'"()\-_+=\[\]{}\\|;:<>@#$%^&*~/`\n]+$/;
    return validChars.test(text);
  }

  playKeySound(keyCode, isCorrect) {
    if (isCorrect) {
      if (keyCode === "Space") {
        this.keyboardSounds.space.currentTime = 0;
        this.keyboardSounds.space.play().catch((err) => {
          console.error("Error playing sound:", err);
        });
      } else {
        this.keyboardSounds.key.currentTime = 0;
        this.keyboardSounds.key.play().catch((err) => {
          console.error("Error playing sound:", err);
        });
      }
    } else {
      this.keyboardSounds.error.currentTime = 0;
      this.keyboardSounds.error.play().catch((err) => {
        console.error("Error playing sound:", err);
      });
    }
  }

  formatTextWithLineBreaks(container, maxLineLength = 46) {
    if (!container) return;

    // Convert spans and br elements into an array
    const nodes = Array.from(container.childNodes);
    let currentLineLength = 0;
    let lastSpaceSpan = null;

    nodes.forEach((node, index) => {
      // Reset line length when encountering a BR
      if (node.nodeName === "BR") {
        currentLineLength = 0;
        lastSpaceSpan = null;
        return;
      }

      if (node.nodeName !== "SPAN") return;

      const text = node.textContent;
      currentLineLength += text.length;

      // Track the last space for potential line breaks
      if (text === " ") {
        lastSpaceSpan = node;
      }

      // Check if we need to add a line break
      if (currentLineLength > maxLineLength && lastSpaceSpan) {
        // Only add BR if there isn't already one after the last space
        const nextNode = lastSpaceSpan.nextSibling;
        if (!nextNode || nextNode.nodeName !== "BR") {
          const br = document.createElement("br");
          lastSpaceSpan.parentNode.insertBefore(br, lastSpaceSpan.nextSibling);
        }

        // Reset counting from the character after the last space
        currentLineLength = nodes
          .slice(nodes.indexOf(lastSpaceSpan) + 1, index + 1)
          .reduce((sum, n) => sum + (n.textContent?.length || 0), 0);

        lastSpaceSpan = null;
      }
    });
  }

  soundsEnabled() {
    return this.querySelector("form #sounds").checked;
  }

  keyboardEnabled() {
    return this.querySelector("form #keyboard").checked;
  }

  calculateFinalScore(wpm, accuracyPercentage) {
    // Normalize WPM to max 60 points (assuming 70 WPM is the target)
    const wpmScore = Math.min((wpm / 70) * 60, 60);

    // Accuracy worth 40 points
    const accuracyScore = (accuracyPercentage / 100) * 40;

    // Combine scores and round to nearest integer
    return Math.round(wpmScore + accuracyScore);
  }

  closeModals() {
    // Close all modals by adding 'hidden' class
    this.querySelectorAll(".modal").forEach((modal) => {
      modal.classList.add("hidden");
    });
  }
}

// Define the custom element
customElements.define("qwerty-keyboard", QwertyKeyboard);
