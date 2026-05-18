// Pastel palette shared with styles.css — used by Recharts components
// since they can't read CSS variables.

export const palette = {
  noCvd:     '#9DD9BB',
  cvd:       '#EE9695',
  primary:   '#9FC1E8',
  secondary: '#C3BCE5',
  accent:    '#F4B58D',
  mint:      '#B5E8D5',
  rose:      '#F8C8C8',
  cream:     '#FCEFD9',

  text:      '#2A2A3A',
  text2:     '#5A5A70',
  text3:     '#8B8B9E',

  grid:      'rgba(123, 110, 175, 0.12)',
} as const;

export const chartSeq = [
  palette.primary,
  palette.accent,
  palette.secondary,
  palette.noCvd,
  palette.cvd,
  palette.cream,
] as const;
