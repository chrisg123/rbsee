/**
 * Example secret provider interface.
 *
 * Copy this file to:
 * ~/.config/rbsee/secret-provider.mjs
 *
 * Then implement the functions using your preferred secret store.
 * (KeePassXC, Secret Service, pass, Vault, etc).
 *
 * THIS FILE IS NOT USED DIRECTLY BY THE APPLICATION
 */

export async function getUsername() {
  throw new Error('getUsername(): not implemented')
}

export async function getPassword() {
  throw new Error('getPassword(): not implemented')
}

/**
 * @param {string} question - The exact 2FA challenge question
 * @returns {Promise<string>} answer
 */
export async function get2faAnswer(question) {
  throw new Error('getUsername(): not implemented')
}
