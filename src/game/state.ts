import { LEVEL_SECONDS, TOTAL_LEVELS } from './levels';

export interface GameState {
  /** 1-based 当前关卡 */
  level: number;
  score: number;
  timeLeft: number;
}

type Listener = (state: Readonly<GameState>) => void;

/** 单一状态源：关卡 / 分数 / 倒计时 */
export class GameStore {
  readonly totalLevels = TOTAL_LEVELS;
  readonly levelSeconds = LEVEL_SECONDS;

  private state: GameState = { level: 1, score: 0, timeLeft: LEVEL_SECONDS };
  private listeners = new Set<Listener>();
  private timerId: ReturnType<typeof setInterval> | null = null;

  /** 倒计时归零时触发（由 quiz 层注入） */
  onTimeout: (() => void) | null = null;

  get snapshot(): Readonly<GameState> {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private patch(next: Partial<GameState>): void {
    this.state = { ...this.state, ...next };
    for (const fn of this.listeners) fn(this.state);
  }

  goToLevel(level: number): void {
    this.patch({ level, timeLeft: this.levelSeconds });
    this.restartTimer();
  }

  addScore(points: number): void {
    this.patch({ score: this.state.score + points });
  }

  stopTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  restartTimer(): void {
    this.stopTimer();
    this.timerId = setInterval(() => {
      const timeLeft = this.state.timeLeft - 1;
      this.patch({ timeLeft });
      if (timeLeft <= 0) {
        this.stopTimer();
        this.onTimeout?.();
      }
    }, 1000);
  }
}
