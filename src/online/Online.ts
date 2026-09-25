import type { RunStats } from '../game/Hud';
import { fetchLeaderboard, finishRun, startRun, type LeaderboardEntry } from './api';
import { Auth, type Account, type Provider } from './auth';

const PROVIDERS: Array<{ id: Provider; label: string }> = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Accounts and the leaderboard around the game: sign-in on the menu, and each signed-in run
 * opened with the server when it starts and submitted when it ends. Everything here is optional:
 * when Clerk or the API isn't configured the panels stay hidden and the game plays as before.
 */
export class Online {
  private readonly auth = new Auth();
  private readonly account = document.getElementById('account') as HTMLElement;
  private readonly boards = [...document.querySelectorAll<HTMLElement>('.leaderboard')];
  private readonly overSave = document.getElementById('over-save') as HTMLElement;
  private run: Promise<string | null> = Promise.resolve(null);

  async init(): Promise<void> {
    this.auth.onChange((account) => this.renderAccount(account));
    await Promise.all([this.auth.load(), this.refreshLeaderboard()]);
  }

  /** Opens a server-side run so the server can time it; fire and forget. */
  runStarted(): void {
    this.overSave.hidden = true;
    this.run = this.auth
      .token()
      .then((token) => (token ? startRun(token) : null))
      .catch((err) => {
        console.warn('Could not start run:', err);
        return null;
      });
  }

  async runEnded(stats: RunStats): Promise<void> {
    const snapshot = { ...stats };
    const runId = await this.run;
    this.run = Promise.resolve(null);
    if (!this.auth.enabled) return;
    if (!runId) {
      this.showSave(this.auth.account ? 'Could not save this run.' : 'Sign in to save your runs and join the leaderboard.', !this.auth.account);
      return;
    }
    this.showSave('Saving…');
    try {
      const token = await this.auth.token();
      if (!token) throw new Error('Signed out');
      const result = await finishRun(token, runId, snapshot);
      const best = `${Math.floor(result.bestDistance)} m`;
      this.showSave(result.newBest ? `New personal best! Rank #${result.rank}` : `Saved. Your best: ${best} · Rank #${result.rank}`);
    } catch (err) {
      console.warn('Could not save run:', err);
      this.showSave('Could not save this run.');
    }
    await this.refreshLeaderboard();
  }

  private showSave(text: string, withSignIn = false): void {
    this.overSave.replaceChildren(el('span', undefined, text));
    if (withSignIn) this.overSave.append(this.signInButtons());
    this.overSave.hidden = false;
  }

  private signInButtons(): HTMLElement {
    const row = el('div', 'signin');
    for (const { id, label } of PROVIDERS) {
      const button = el('button', `signin-${id}`, label);
      button.addEventListener('click', () => {
        button.disabled = true;
        this.auth.signIn(id).catch((err) => {
          console.warn('Sign-in failed:', err);
          button.disabled = false;
        });
      });
      row.append(button);
    }
    return row;
  }

  private renderAccount(account: Account | null): void {
    this.account.hidden = !this.auth.enabled;
    if (!account) {
      this.account.replaceChildren(el('span', 'account-hint', 'Sign in to save your runs'), this.signInButtons());
      return;
    }
    const avatar = el('img', 'avatar');
    avatar.src = account.imageUrl;
    avatar.alt = '';
    const signOut = el('button', 'signout', 'Sign out');
    signOut.addEventListener('click', () => void this.auth.signOut());
    this.account.replaceChildren(avatar, el('span', 'account-name', account.name), signOut);
  }

  private async refreshLeaderboard(): Promise<void> {
    let entries: LeaderboardEntry[];
    try {
      entries = await fetchLeaderboard();
    } catch {
      return; // No API here: leave the boards hidden.
    }
    for (const board of this.boards) this.renderBoard(board, entries, Number(board.dataset.limit) || entries.length);
  }

  private renderBoard(board: HTMLElement, entries: LeaderboardEntry[], limit: number): void {
    const list = el('ol');
    for (const entry of entries.slice(0, limit)) {
      const row = el('li');
      row.append(
        el('span', 'name', entry.name),
        el('span', 'score', `${Math.floor(entry.distance)} m`),
        el('span', 'kills', `☠ ${entry.kills}`),
      );
      list.append(row);
    }
    if (!entries.length) list.append(el('li', 'empty', 'No runs yet. Be the first.'));
    board.replaceChildren(el('h2', undefined, 'Leaderboard'), list);
    board.hidden = false;
  }
}
