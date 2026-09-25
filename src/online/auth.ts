import type { Clerk } from '@clerk/clerk-js';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
/** Query flag marking the page load that finishes an OAuth sign-in. */
const CALLBACK = 'sso-callback';

export type Provider = 'google' | 'github';

export interface Account {
  name: string;
  imageUrl: string;
}

/**
 * Clerk sign-in with Google or GitHub, loaded only when a publishable key is configured.
 * Without one (or if Clerk fails to load) the game stays fully playable signed out.
 */
export class Auth {
  private clerk: Clerk | null = null;
  private listeners: Array<(account: Account | null) => void> = [];

  get enabled(): boolean {
    return this.clerk !== null;
  }

  get account(): Account | null {
    const user = this.clerk?.user;
    if (!user) return null;
    return { name: user.username || user.firstName || user.primaryEmailAddress?.emailAddress || 'Survivor', imageUrl: user.imageUrl };
  }

  async load(): Promise<void> {
    if (!PUBLISHABLE_KEY) return;
    try {
      const { Clerk } = await import('@clerk/clerk-js');
      const clerk = new Clerk(PUBLISHABLE_KEY);
      await clerk.load();
      this.clerk = clerk;
      if (new URLSearchParams(location.search).has(CALLBACK)) {
        await clerk.handleRedirectCallback({}, async () => history.replaceState(null, '', '/'));
        history.replaceState(null, '', '/');
      }
      clerk.addListener(() => this.emit());
    } catch (err) {
      console.warn('Accounts unavailable:', err);
      this.clerk = null;
    }
    this.emit();
  }

  onChange(listener: (account: Account | null) => void): void {
    this.listeners.push(listener);
  }

  /** Leaves the page for the provider; Clerk creates the account on first sign-in. */
  async signIn(provider: Provider): Promise<void> {
    const signIn = this.clerk?.client?.signIn;
    if (!signIn) return;
    await signIn.authenticateWithRedirect({
      strategy: `oauth_${provider}`,
      redirectUrl: `${location.origin}/?${CALLBACK}`,
      redirectUrlComplete: `${location.origin}/`,
    });
  }

  async signOut(): Promise<void> {
    await this.clerk?.signOut();
  }

  /** A short-lived session JWT for the API, or null when signed out. */
  async token(): Promise<string | null> {
    return (await this.clerk?.session?.getToken()) ?? null;
  }

  private emit(): void {
    const account = this.account;
    for (const listener of this.listeners) listener(account);
  }
}
