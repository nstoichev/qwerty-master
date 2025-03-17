import { TypingProgress } from "./typing-progress.js";

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

    // Add properties for per-word WPM tracking
    this.currentWordStartTime = null;
    this.currentWordCharCount = 0;

    // Load all data
    this.loadData();

    // Add progress tracker
    this.progress = new TypingProgress();
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
          // Update history modal when it's opened
          if (targetId === "history") {
            this.updateHistoryModal();
          }
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

    // Check for shared results in URL
    this.checkForSharedResults();

    // Add clear history button handler
    const clearHistoryButton = this.querySelector("[data-clear-history]");
    if (clearHistoryButton) {
      clearHistoryButton.addEventListener("click", (event) => {
        event.preventDefault();

        this.handleClearHistory();
      });
    }

    // Add restart button handler
    const restartButtons = this.querySelectorAll("[data-restart]");
    if (restartButtons) {
      restartButtons.forEach((restartButton) => {
        restartButton.addEventListener("click", () => {
          this.handleRestart();
        });
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
        // Split line into words (keeping all characters)
        const words = line.split(/(?<=\s)/);
        
        words.forEach(word => {
          // Create word container
          const wordContainer = document.createElement("span");
          wordContainer.classList.add("word");
          
          // Create spans for each character in the word
          word.split("").forEach((char) => {
            const span = document.createElement("span");
            span.textContent = char;
            const keyCode = this.keyCodeMap[char.toLowerCase()] || "Unknown";
            span.setAttribute("data-code", keyCode);
            wordContainer.appendChild(span);
          });
          
          this.previewArea.appendChild(wordContainer);
        });

        if (lineIndex < allLines.length - 1) {
          this.insertNewLine();
        }
      });

      this.formatTextWithLineBreaks(this.previewArea);

      setTimeout(() => {
        this.updateCurrentElementStyle(0);
      }, 20);
    }
  }

  insertNewLine() {
    const wordContainer = document.createElement("span");
    wordContainer.classList.add("word");
    
    const enter = document.createElement("span");
    enter.textContent = "↵";
    enter.setAttribute("data-code", "Enter");
    
    wordContainer.appendChild(enter);
    this.previewArea.appendChild(wordContainer);
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

    // Find the first untyped character within any word
    let expectedChar = this.previewArea.querySelector(".word span:not(.typed)");

    this.keyboard.querySelectorAll(".expected").forEach((expected) => {
      expected.classList.remove("expected");
    });

    if (!expectedChar) return;

    // Rest of the highlighting logic remains the same
    const expectedKey = this.keyboard.querySelector(
      `[data-code="${expectedChar.dataset.code}"]`
    );
    if (!expectedKey) return;
    expectedKey.classList.add("expected");

    // Add expected class to Shift key if character is uppercase
    const char = expectedChar.textContent;
    const isUpperCase = char === char.toUpperCase() && char !== char.toLowerCase();
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
    const currentWord = expectedChar.closest('.word');
    const characters = Array.from(currentWord.querySelectorAll('span:not(.typed)'));

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
        // Initialize the first word's start time
        this.currentWordStartTime = Date.now();
      }
    }

    if (event.key === "Shift") return;

    event.preventDefault();

    this.keyboard.querySelectorAll(".highlight").forEach((highlight) => {
      highlight.classList.remove("highlight");
    });

    // Update: Find the first untyped character within any word
    const expectedChar = this.previewArea.querySelector(".word span:not(.typed)");

    if (!expectedChar) {
      return;
    }

    const expectedCharText = expectedChar.textContent;

    // Add typed class to the character span
    expectedChar.classList.add("typed");

    // Increment the character count for the current word
    this.currentWordCharCount++;

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

    // Check if we just completed a word (space or enter key)
    const isWordComplete = event.code === "Space" || event.code === "Enter";
    if (isWordComplete) {
      this.updateWordWPM();
      // Reset for next word
      this.currentWordStartTime = Date.now();
      this.currentWordCharCount = 0;
    }

    // Update: Count all characters, not just words
    const allLettersCount = this.previewArea.querySelectorAll(".word span").length;
    const typedLettersCount = this.previewArea.querySelectorAll(".word span.typed").length;
    const isSoundsEnabled = this.soundsEnabled();

    this.highlightWord();

    this.scrollToCurrentElement();

    if (isSoundsEnabled) {
      this.playKeySound(event.code, isCorrect);
    }

    if (allLettersCount === typedLettersCount) {
        const current = this.previewArea.querySelector(".current");
        if (current) {
            current.classList.remove("current");
            
            // Add this: Calculate WPM for the last word before ending
            this.updateWordWPM();
        }

        // Update: Get all character spans for the end calculation
        const allletters = this.previewArea.querySelectorAll(".word span");
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
    // Update: Find the current character within any word
    const current = this.previewArea.querySelector(".word span.current");
    if (current) {
        current.classList.add("error");
    }
  }

  highlightCurernt() {
    // Remove current class from all characters
    this.previewArea.querySelectorAll(".current").forEach((current) => {
        current.classList.remove("current");
    });

    // Find the first untyped character within any word
    const nextChar = this.previewArea.querySelector(".word span:not(.typed)");
    if (nextChar) {
        nextChar.classList.add("current");
    }
  }

  end(letters) {
    let errors = 0;

    // Count errors in character spans
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

    // Reset WPM display
    this.updateCurrentElementStyle(0);

    // Calculate final score
    const finalScore = this.calculateFinalScore(wpm, accuracyPercentage);

    // Only save progress if tracking is enabled
    if (this.isTrackingEnabled()) {
        this.progress.saveResult({
            paragraphId: this.getCurrentParagraphId(),
            wpm,
            accuracy: accuracyPercentage,
            score: finalScore,
        });
    }

    this.displayScore(finalScore, wpm, accuracyPercentage);

    // Reset WPM display
    this.updateCurrentElementStyle(0);
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

    // Generate shareable URL
    const shareableUrl = this.generateShareableUrl(
      finalScore,
      wpm,
      accuracyPercentage
    );

    // Add share button and URL to modal
    const shareContainer = this.modal.querySelector("[data-share-container]");
    if (shareContainer) {
      shareContainer.innerHTML = `
        <input type="hidden" readonly value="${shareableUrl}" class="share-url" />
        <button class="button button--share" onclick="navigator.clipboard.writeText('${shareableUrl}')">
          Share result ➦
        </button>
      `;
    }

    this.modal.classList.remove("hidden");
    this.startTime = null;

    if (this.soundsEnabled()) {
      this.playSpeedSound(finalScore);
    }

    // Add new method to update history modal
    this.updateHistoryModal();

    // Reset WPM display
    this.updateCurrentElementStyle(0);
  }

  generateShareableUrl(score, wpm, accuracy) {
    const baseUrl = window.location.origin + window.location.pathname;

    // Combine values and add a timestamp to make each share unique
    const timestamp = Date.now();
    const values = `${score}|${wpm}|${accuracy.toFixed(2)}|${timestamp}`;

    // Simple encoding: Convert to base64 and add a basic checksum
    const encoded = btoa(values); // Convert to base64
    const checksum = this.calculateChecksum(values);

    return `${baseUrl}#${encoded}.${checksum}`;
  }

  calculateChecksum(str) {
    // Simple checksum function
    return Array.from(str)
      .reduce((sum, char) => sum + char.charCodeAt(0), 0)
      .toString(16);
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
    
    // Reset WPM display
    this.updateCurrentElementStyle(0);

    // Reset word-specific tracking
    this.currentWordStartTime = null;
    this.currentWordCharCount = 0;

    setTimeout(() => {
      this.previewArea.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }, 10);
  }

  fetchParagraphs() {
    return fetch("advanced_paragraphs.json")
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
    } else if (source === "ai") {
      this.contentFromAI();
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

  checkForSharedResults() {
    if (window.location.hash) {
      const [encoded, checksum] = window.location.hash.slice(1).split(".");

      try {
        // Verify checksum
        const decoded = atob(encoded);
        if (checksum !== this.calculateChecksum(decoded)) {
          console.error("Invalid shared result");
          return;
        }

        // Parse the values
        const [score, wpm, accuracy] = decoded.split("|");

        // Display shared results
        this.displaySharedResults(
          parseInt(score),
          parseInt(wpm),
          parseFloat(accuracy)
        );
      } catch (e) {
        console.error("Invalid shared result format");
      }
    }
  }

  displaySharedResults(score, wpm, accuracy) {
    // Show the modal with shared results
    this.displayScore(score, wpm, accuracy);

    // Add a "shared result" indicator
    const sharedBadge = document.createElement("div");
    sharedBadge.className = "shared-badge";
    sharedBadge.textContent = "Shared Result";
    this.modal.querySelector("[data-score]").parentNode.prepend(sharedBadge);
  }

  // Add method to get current paragraph ID
  getCurrentParagraphId() {
    // If using JSON paragraphs, return the current paragraph's ID
    // If using random text, you could generate a hash of the text
    // For now, returning timestamp as a simple solution
    return Date.now();
  }

  // Add new method to update history modal
  updateHistoryModal() {
    const progressContainer = this.querySelector("[data-progress-container]");
    if (!progressContainer) return;

    const stats = this.progress.getProgress().overallStats;

    if (stats.totalAttempts === 0) {
      progressContainer.innerHTML = `
            <div class="progress-empty">
                <p>You haven't completed any typing tests yet.</p>
                <p>Complete a test to see your progress history!</p>
            </div>
        `;
      return;
    }

    progressContainer.innerHTML = `
        <div class="progress-stats">
            <h3>Your Progress History</h3>
            <p>Best WPM: ${stats.bestWPM}</p>
            <p>Average WPM: ${stats.averageWPM}</p>
            <p>Best Accuracy: ${stats.bestAccuracy.toFixed(2)}%</p>
            <p>Total Attempts: ${stats.totalAttempts}</p>
        </div>
    `;
  }

  // Add this method to the QwertyKeyboard class
  isTrackingEnabled() {
    return this.querySelector("#track-history").checked;
  }

  // Add this method to handle history clearing
  handleClearHistory() {
    const confirmModal = this.querySelector("[data-modal-confirm]");
    if (!confirmModal) return;

    // Show the confirm modal
    confirmModal.classList.remove("hidden");

    // Get the buttons
    const yesButton = confirmModal.querySelector(".button--danger");
    const noButton = confirmModal.querySelector(".button:not(.button--danger)");

    // Handle Yes button click
    const handleYes = () => {
      this.progress.clearProgress();
      this.updateHistoryModal();
      confirmModal.classList.add("hidden");
      // Remove event listeners
      yesButton.removeEventListener("click", handleYes);
      noButton.removeEventListener("click", handleNo);
    };

    // Handle No button click
    const handleNo = () => {
      confirmModal.classList.add("hidden");
      // Remove event listeners
      yesButton.removeEventListener("click", handleYes);
      noButton.removeEventListener("click", handleNo);
    };

    // Add event listeners
    yesButton.addEventListener("click", handleYes);
    noButton.addEventListener("click", handleNo);
  }

  // Add this method to the QwertyKeyboard class
  handleRestart() {
    // Get the current text
    const currentText = this.querySelector("[data-preview]").textContent;

    // Reset the preview container
    const previewContainer = this.querySelector("[data-preview]");
    previewContainer.innerHTML = "";

    // Reset typing state
    this.currentIndex = 0;
    this.startTime = null;
    this.errors = 0;

    // Reset WPM display
    this.updateCurrentElementStyle(0);

    // Initialize the preview with the same text
    this.initializePreview({
      value: currentText,
    });

    // Hide the modal
    this.modal.classList.add("hidden");

    // Focus the preview container
    previewContainer.focus();

    // Highlight the first character
    this.highlightCurernt();

    // Reset word-specific tracking
    this.currentWordStartTime = null;
    this.currentWordCharCount = 0;
  }

  async contentFromAI() {
    try {
      // Get the textarea element where we'll put the generated text
      const textArea = this.querySelector('[data-random-text]');
      
      // Show some loading state in the textarea
      textArea.value = "Generating text...";
            
      const response = await fetch(
        "http://localhost:3000/generate-text",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          }
        }
      );
      
      const data = await response.json();
          
      if (data.error) {
        console.error('Server error:', data.error, data.details);
        textArea.value = `Error: ${data.error}`;
        throw new Error(data.error);
      }
      
      if (Array.isArray(data) && data[0]?.generated_text) {
        let text = data[0].generated_text;
        
        // Ensure proper formatting
        text = text.charAt(0).toUpperCase() + text.slice(1);
        if (!text.match(/[.!?]$/)) {
          text += '.';
        }
        
        // Update the textarea with the generated text
        textArea.value = text;
        
        // Initialize the preview with the new text
        this.initializePreview(textArea);
        this.highlightWord();
        
        return text;
      } else {
        console.error('Unexpected response format:', data);
        textArea.value = "Unable to generate text. Please try again.";
        return "Unable to generate text. Please try again.";
      }
    } catch (error) {
      console.error("Detailed error in contentFromAI:", error);
      const textArea = this.querySelector('[data-random-text]');
      textArea.value = `Error: ${error.message}`;
      return `Error generating text: ${error.message}`;y
    }
  }

  // Add new method for calculating per-word WPM
  updateWordWPM() {
    if (!this.currentWordStartTime) return;

    const elapsedTimeInMinutes = (Date.now() - this.currentWordStartTime) / (1000 * 60);
    
    if (elapsedTimeInMinutes > 0) {
        // Calculate WPM for just this word
        const wordWPM = Math.round((this.currentWordCharCount / 5) / elapsedTimeInMinutes);
        
        // Ensure WPM is reasonable (between 0 and 250)
        const finalWPM = Math.min(Math.max(wordWPM, 0), 250);
        
        // Update the display
        // Find the current or last typed word
        const currentChar = this.previewArea.querySelector('.current');
        const currentWord = currentChar 
            ? currentChar.closest('.word')
            : this.previewArea.querySelector('.word:last-child');
            
        if (currentWord) {
            this.updateCurrentElementStyle(finalWPM, currentWord);
        }
    }
  }

  // Add this new method to handle current element styling
  updateCurrentElementStyle(wpm = 0, specificWord = null) {
    // Create or update the style element for dynamic pseudo-element content
    let styleElement = document.getElementById('dynamic-current-style');
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'dynamic-current-style';
      document.head.appendChild(styleElement);
    }
    
    // Get the word to update (either specific word or current word)
    const wordToUpdate = specificWord || this.previewArea.querySelector('.current')?.closest('.word');
    if (!wordToUpdate) return;

    // Remove any existing speed classes
    wordToUpdate.classList.remove('speed-medium', 'speed-great', 'speed-excellent', 'speed-perfect', 'speed-master', 'speed-god');

    // Add a data attribute to store the WPM for this word
    if (wpm > 0) {
        // Only set WPM if it's a real value (not the initial 0)
        wordToUpdate.setAttribute('data-wpm', wpm);
        
        // Add appropriate speed class based on WPM
        if (wpm >= 100) {
            wordToUpdate.classList.add('speed-god');
        } else if (wpm >= 90) {
            wordToUpdate.classList.add('speed-master');
        } else if (wpm >= 70) {
            wordToUpdate.classList.add('speed-perfect');
        } else if (wpm >= 60) {
            wordToUpdate.classList.add('speed-excellent');
        } else if (wpm >= 50) {
            wordToUpdate.classList.add('speed-great');
        } else if (wpm >= 40) {
            wordToUpdate.classList.add('speed-medium');
        }
    }

    // Generate CSS rules for word WPM display
    const cssRules = `
      .textarea-preview .word[data-wpm]:before {
        content: attr(data-wpm) " wpm" ${wpm >= 90 ? '" ★"' : ''};
      }

      .textarea-preview .word.speed-master[data-wpm]:before,
      .textarea-preview .word.speed-god[data-wpm]:before {
        content: attr(data-wpm) " wpm ★";
      }
    `;

    styleElement.textContent = cssRules;
  }
}

// Define the custom element
customElements.define("qwerty-keyboard", QwertyKeyboard);
