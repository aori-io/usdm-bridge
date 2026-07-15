export const chainKeys = {
  all: ['chains'] as const,
  list: () => [...chainKeys.all, 'list'] as const,
};
