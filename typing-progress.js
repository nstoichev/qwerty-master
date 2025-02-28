class TypingProgress {
  constructor() {
    this.storageKey = "typing_stats";
    this.initializeStorage();
  }

  initializeStorage() {
    if (!localStorage.getItem(this.storageKey)) {
      const initialData = {
        lastSession: null,
        history: [],
        paragraphStats: {},
        overallStats: {
          totalAttempts: 0,
          bestWPM: 0,
          averageWPM: 0,
          bestAccuracy: 0,
          averageAccuracy: 0,
          bestScore: 0,
        },
      };
      localStorage.setItem(this.storageKey, JSON.stringify(initialData));
    }
  }

  saveResult(result) {
    const data = this.getProgress();
    const {
      paragraphId,
      wpm,
      accuracy,
      score,
      timestamp = Date.now(),
    } = result;

    // Add to history
    data.history.push({
      paragraphId,
      wpm,
      accuracy,
      score,
      timestamp,
    });

    // Update paragraph-specific stats
    if (!data.paragraphStats[paragraphId]) {
      data.paragraphStats[paragraphId] = {
        attempts: 0,
        bestWPM: 0,
        bestAccuracy: 0,
        bestScore: 0,
      };
    }
    const paragraphStat = data.paragraphStats[paragraphId];
    paragraphStat.attempts++;
    paragraphStat.bestWPM = Math.max(paragraphStat.bestWPM, wpm);
    paragraphStat.bestAccuracy = Math.max(paragraphStat.bestAccuracy, accuracy);
    paragraphStat.bestScore = Math.max(paragraphStat.bestScore, score);

    // Update overall stats
    data.overallStats.totalAttempts++;
    data.overallStats.bestWPM = Math.max(data.overallStats.bestWPM, wpm);
    data.overallStats.bestAccuracy = Math.max(
      data.overallStats.bestAccuracy,
      accuracy
    );
    data.overallStats.bestScore = Math.max(data.overallStats.bestScore, score);

    // Calculate averages
    data.overallStats.averageWPM = this.calculateAverage(data.history, "wpm");
    data.overallStats.averageAccuracy = this.calculateAverage(
      data.history,
      "accuracy"
    );

    data.lastSession = timestamp;
    localStorage.setItem(this.storageKey, JSON.stringify(data));
  }

  calculateAverage(history, field) {
    if (!history.length) return 0;
    const sum = history.reduce((acc, curr) => acc + curr[field], 0);
    return Math.round((sum / history.length) * 100) / 100;
  }

  getProgress() {
    return JSON.parse(localStorage.getItem(this.storageKey));
  }

  getRecentHistory(limit = 10) {
    const data = this.getProgress();
    return data.history
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  getParagraphStats(paragraphId) {
    const data = this.getProgress();
    return data.paragraphStats[paragraphId] || null;
  }

  clearProgress() {
    localStorage.removeItem(this.storageKey);
    this.initializeStorage();
  }
}

export { TypingProgress };
