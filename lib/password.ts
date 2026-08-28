export const STRONG_PASSWORD_MESSAGE =
  'Use at least 12 characters with uppercase, lowercase, a number and a symbol.';

export function isStrongPassword(
  value: unknown,
) {
  const password =
    String(value || '');

  return (
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
