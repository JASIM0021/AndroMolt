/**
 * Cost Tracker - Monitor OpenAI API Usage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export class CostTracker {
  private readonly GPT4O_INPUT_COST = 2.5 / 1_000_000; // $2.50 per 1M tokens
  private readonly GPT4O_OUTPUT_COST = 10.0 / 1_000_000; // $10 per 1M tokens
  private readonly STORAGE_PREFIX = '@andromolt/cost';

  /**
   * Add usage and calculate cost
   */
  async addUsage(inputTokens: number, outputTokens: number): Promise<void> {
    const cost =
      inputTokens * this.GPT4O_INPUT_COST +
      outputTokens * this.GPT4O_OUTPUT_COST;

    const monthKey = this.getCurrentMonthKey();

    const currentStr = await AsyncStorage.getItem(
      `${this.STORAGE_PREFIX}/${monthKey}`
    );
    const current = currentStr ? parseFloat(currentStr) : 0;
    const newTotal = current + cost;

    await AsyncStorage.setItem(
      `${this.STORAGE_PREFIX}/${monthKey}`,
      newTotal.toString()
    );

    // Store individual transaction
    await this.logTransaction({
      timestamp: Date.now(),
      inputTokens,
      outputTokens,
      cost,
    });

    // Alert if approaching budget
    if (newTotal > 400) {
      // 80% of $500 budget
      this.emitWarning({ current: newTotal, limit: 500 });
    }
  }

  /**
   * Get current month's cost
   */
  async getCurrentMonthCost(): Promise<number> {
    const monthKey = this.getCurrentMonthKey();
    const cost = await AsyncStorage.getItem(
      `${this.STORAGE_PREFIX}/${monthKey}`
    );
    return cost ? parseFloat(cost) : 0;
  }

  /**
   * Get cost history
   */
  async getCostHistory(): Promise<{ month: string; cost: number }[]> {
    const keys = await AsyncStorage.getAllKeys();
    const costKeys = keys.filter((k) => k.startsWith(this.STORAGE_PREFIX));

    const history = await Promise.all(
      costKeys.map(async (key) => {
        const value = await AsyncStorage.getItem(key);
        return {
          month: key.split('/')[1],
          cost: value ? parseFloat(value) : 0,
        };
      })
    );

    return history.sort((a, b) => b.month.localeCompare(a.month));
  }

  /**
   * Reset monthly cost (for testing)
   */
  async resetMonth(): Promise<void> {
    const monthKey = this.getCurrentMonthKey();
    await AsyncStorage.removeItem(`${this.STORAGE_PREFIX}/${monthKey}`);
  }

  private getCurrentMonthKey(): string {
    return new Date().toISOString().slice(0, 7); // YYYY-MM
  }

  private async logTransaction(transaction: {
    timestamp: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }): Promise<void> {
    const key = `${this.STORAGE_PREFIX}/transactions`;
    const existingStr = await AsyncStorage.getItem(key);
    const existing = existingStr ? JSON.parse(existingStr) : [];

    // Keep only last 100 transactions
    const updated = [...existing, transaction].slice(-100);

    await AsyncStorage.setItem(key, JSON.stringify(updated));
  }

  private emitWarning(data: { current: number; limit: number }): void {
    // In a real implementation, use EventEmitter or notification system
    console.warn(
      `⚠️ Cost Warning: $${data.current.toFixed(2)} / $${data.limit.toFixed(2)}`
    );
  }
}
