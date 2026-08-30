export function usesMockTransport(): boolean {
  if (process.env.EMAIL_TRANSPORT === 'gmail') return false;
  return process.env.EMAIL_TRANSPORT === 'mock' || process.env.NODE_ENV !== 'production';
}
