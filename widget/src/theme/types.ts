export interface WidgetTheme {
  background: string;
  foreground: string;
  card: string;
  'card-foreground': string;
  popover: string;
  'popover-foreground': string;
  primary: string;
  'primary-foreground': string;
  secondary: string;
  'secondary-foreground': string;
  muted: string;
  'muted-foreground': string;
  accent: string;
  'accent-foreground': string;
  destructive: string;
  'destructive-foreground': string;
  border: string;
  input: string;
  ring: string;

  radius: string;
  'border-style'?: string;

  'font-sans'?: string;
  'font-mono'?: string;

  'shadow-color'?: string;
  'shadow-opacity'?: string;
  'shadow-blur'?: string;
  'shadow-spread'?: string;
  'shadow-offset-x'?: string;
  'shadow-offset-y'?: string;

  'letter-spacing'?: string;

  'status-pending'?: string;
  'status-received'?: string;
  'status-completed'?: string;
  'status-failed'?: string;
}

export const defaultLightTheme: WidgetTheme = {
  background: '#ffffff',
  foreground: '#0a0a0a',
  card: '#ffffff',
  'card-foreground': '#0a0a0a',
  popover: '#ffffff',
  'popover-foreground': '#0a0a0a',
  primary: '#171717',
  'primary-foreground': '#fafafa',
  secondary: '#f5f5f5',
  'secondary-foreground': '#171717',
  muted: '#f5f5f5',
  'muted-foreground': '#737373',
  accent: '#f5f5f5',
  'accent-foreground': '#171717',
  destructive: '#e7000b',
  'destructive-foreground': '#ffffff',
  border: '#e5e5e5',
  input: '#e5e5e5',
  ring: '#a1a1a1',
  radius: '0.625rem',
  'border-style': 'dotted',
  'status-pending': '#a1a1aa',
  'status-received': '#f59e0b',
  'status-completed': '#10b981',
  'status-failed': '#ef4444',
};

export const defaultDarkTheme: WidgetTheme = {
  background: '#0a0a0a',
  foreground: '#fafafa',
  card: '#171717',
  'card-foreground': '#fafafa',
  popover: '#262626',
  'popover-foreground': '#fafafa',
  primary: '#e5e5e5',
  'primary-foreground': '#171717',
  secondary: '#262626',
  'secondary-foreground': '#fafafa',
  muted: '#262626',
  'muted-foreground': '#a1a1a1',
  accent: '#404040',
  'accent-foreground': '#fafafa',
  destructive: '#ff6467',
  'destructive-foreground': '#fafafa',
  border: '#282828',
  input: '#343434',
  ring: '#737373',
  radius: '0.625rem',
  'border-style': 'dotted',
  'status-pending': '#a1a1aa',
  'status-received': '#fbbf24',
  'status-completed': '#2dd4bf',
  'status-failed': '#fb7185',
};

export function themeToCSS(theme: WidgetTheme): Record<string, string> {
  const vars: Record<string, string> = {
    '--widget-background': theme.background,
    '--widget-foreground': theme.foreground,
    '--widget-card': theme.card,
    '--widget-card-foreground': theme['card-foreground'],
    '--widget-popover': theme.popover,
    '--widget-popover-foreground': theme['popover-foreground'],
    '--widget-primary': theme.primary,
    '--widget-primary-foreground': theme['primary-foreground'],
    '--widget-secondary': theme.secondary,
    '--widget-secondary-foreground': theme['secondary-foreground'],
    '--widget-muted': theme.muted,
    '--widget-muted-foreground': theme['muted-foreground'],
    '--widget-accent': theme.accent,
    '--widget-accent-foreground': theme['accent-foreground'],
    '--widget-destructive': theme.destructive,
    '--widget-destructive-foreground': theme['destructive-foreground'],
    '--widget-border': theme.border,
    '--widget-input': theme.input,
    '--widget-ring': theme.ring,
    '--widget-radius': theme.radius,
    '--widget-border-style': theme['border-style'] || 'dotted',
  };

  vars['--widget-font-sans'] = theme['font-sans'] || 'inherit';
  vars['--widget-font-mono'] = theme['font-mono'] || 'inherit';
  vars['--widget-shadow-color'] = theme['shadow-color'] || 'oklch(0 0 0)';
  vars['--widget-shadow-opacity'] = theme['shadow-opacity'] || '0.1';
  vars['--widget-shadow-blur'] = theme['shadow-blur'] || '3px';
  vars['--widget-shadow-spread'] = theme['shadow-spread'] || '0px';
  vars['--widget-shadow-offset-x'] = theme['shadow-offset-x'] || '0';
  vars['--widget-shadow-offset-y'] = theme['shadow-offset-y'] || '1px';
  vars['--widget-letter-spacing'] = theme['letter-spacing'] || 'normal';

  vars['--widget-status-pending'] = theme['status-pending'] || '#a1a1aa';
  vars['--widget-status-received'] = theme['status-received'] || '#fbbf24';
  vars['--widget-status-completed'] = theme['status-completed'] || '#2dd4bf';
  vars['--widget-status-failed'] = theme['status-failed'] || '#fb7185';

  return vars;
}
