/**
 * Simple key-based authentication system
 * Users must provide a valid base64-encoded key to access the app
 */

/**
 * Validate if a provided key is valid
 * @param userKey - The base64 key provided by the user
 * @returns true if valid, false otherwise
 */
export function validateAccessKey(userKey: string): boolean {
  if (!userKey || userKey.trim() === '') {
    return false;
  }

  // Get the valid key from environment variable
  const validKey = process.env.NEXT_PUBLIC_ACCESS_KEY;

  if (!validKey) {
    console.error('NEXT_PUBLIC_ACCESS_KEY not configured');
    return false;
  }

  // Simple comparison (you can make this more sophisticated)
  return userKey.trim() === validKey.trim();
}

/**
 * Client-side storage for the access key
 */
export const AccessKeyStorage = {
  KEY: 'app_access_key',

  save(key: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.KEY, key);
    }
  },

  get(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(this.KEY);
    }
    return null;
  },

  clear(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.KEY);
    }
  },
};

/**
 * Generate a random base64 access key (for creating new keys)
 * Run this in Node.js to generate keys for your users
 */
export function generateAccessKey(): string {
  // This is just for reference - you'd run this server-side to create keys
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...randomBytes));
}
