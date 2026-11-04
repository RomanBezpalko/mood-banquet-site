import base from './playwright.config.mjs';

export default {
  ...base,
  grep: /@visual/,
  grepInvert: undefined,
  reporter: [['list'], ['html', { outputFolder: 'qa-report/visual-html', open: 'never' }]],
  outputDir: 'qa-report/visual-results'
};
