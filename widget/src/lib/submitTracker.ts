interface SubmittedQuote {
  quoteId: string;
  submittedAt: number;
  createdAt: number;
}

const STORAGE_KEY = 'vt_submitted_quotes';
const QUOTE_EXPIRATION_MS = 30 * 1000;

const getSubmittedQuotes = (): SubmittedQuote[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveSubmittedQuotes = (quotes: SubmittedQuote[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
  } catch { /* ignore */ }
};

export const isQuoteFresh = (createdAt: string | number, expirationMs = QUOTE_EXPIRATION_MS): boolean => {
  const now = Date.now();
  // Accept unix seconds, unix ms, numeric strings, or ISO date strings.
  const asNumber = typeof createdAt === 'string' ? Number(createdAt) : createdAt;
  const createdMs = Number.isFinite(asNumber)
    ? asNumber > 9999999999
      ? asNumber
      : asNumber * 1000
    : new Date(createdAt as string).getTime();
  return now < createdMs + expirationMs;
};

export const isOrderAlreadySubmitted = (quoteId: string): boolean => {
  return getSubmittedQuotes().some((q) => q.quoteId === quoteId);
};

export const canSubmitOrder = (
  quoteId: string,
  createdAt: string | number,
  expirationMs?: number,
): { canSubmit: boolean; reason?: string } => {
  if (isOrderAlreadySubmitted(quoteId)) {
    return { canSubmit: false, reason: 'Order already submitted' };
  }
  if (!isQuoteFresh(createdAt, expirationMs)) {
    return { canSubmit: false, reason: 'Quote has expired' };
  }
  return { canSubmit: true };
};

export const markOrderAsSubmitted = (quoteId: string, createdAt: string | number): void => {
  const createdMs =
    typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt;
  const submitted = getSubmittedQuotes();
  submitted.push({ quoteId, submittedAt: Date.now(), createdAt: createdMs });
  saveSubmittedQuotes(submitted);
};

export const cleanupOldSubmissions = (): void => {
  const submitted = getSubmittedQuotes();
  const now = Date.now();
  const CLEANUP_THRESHOLD = 5 * 60 * 1000;
  const cleaned = submitted.filter((q) => now - q.submittedAt < CLEANUP_THRESHOLD);
  if (cleaned.length !== submitted.length) saveSubmittedQuotes(cleaned);
};

export const clearAllSubmissions = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* SSR / restricted storage */ }
};
