/**
 * Tailwind CSS plugin for accessibility enhancements
 * Adds utilities for ensuring proper color contrast and other a11y features
 */

const plugin = require('tailwindcss/plugin');

module.exports = plugin(function({ addUtilities, theme, variants }) {
  // Add utilities for accessible focus states
  const accessibilityUtilities = {
    // Enhanced focus styles that work for both mouse and keyboard navigation
    '.focus-visible': {
      'outline': '2px solid currentColor',
      'outline-offset': '2px',
    },
    
    // High contrast focus indicator
    '.focus-visible-high-contrast': {
      'outline': '3px solid currentColor',
      'outline-offset': '2px',
    },
    
    // Visually hidden but accessible to screen readers
    '.sr-only': {
      'position': 'absolute',
      'width': '1px',
      'height': '1px',
      'padding': '0',
      'margin': '-1px',
      'overflow': 'hidden',
      'clip': 'rect(0, 0, 0, 0)',
      'white-space': 'nowrap',
      'border-width': '0',
    },
    
    // Make an element visually hidden but reveal it when it receives focus
    '.sr-only-focusable': {
      'position': 'absolute',
      'width': '1px',
      'height': '1px',
      'padding': '0',
      'margin': '-1px',
      'overflow': 'hidden',
      'clip': 'rect(0, 0, 0, 0)',
      'white-space': 'nowrap',
      'border-width': '0',
      '&:focus, &:active': {
        'position': 'static',
        'width': 'auto',
        'height': 'auto',
        'padding': '0',
        'margin': '0',
        'overflow': 'visible',
        'clip': 'auto',
        'white-space': 'normal',
      },
    },
    
    // High contrast text for better readability
    '.text-high-contrast': {
      'color': theme('colors.gray.900', '#111827'),
      'font-weight': '500',
    },
    
    // Ensure sufficient contrast for interactive elements
    '.interactive-high-contrast': {
      'color': theme('colors.gray.900', '#111827'),
      'background-color': theme('colors.white', '#ffffff'),
      'border': `1px solid ${theme('colors.gray.300', '#d1d5db')}`,
      '&:hover': {
        'background-color': theme('colors.gray.100', '#f3f4f6'),
      },
      '&:focus': {
        'outline': `2px solid ${theme('colors.blue.500', '#3b82f6')}`,
        'outline-offset': '2px',
      },
    },
    
    // Contrast classes for visual feedback
    '.contrast-aa': {
      // Visual indicator that this element meets WCAG AA standards
    },
    
    '.contrast-aaa': {
      // Visual indicator that this element meets WCAG AAA standards
    },
    
    '.contrast-fail': {
      // Visual indicator that this element fails WCAG contrast standards
      'box-shadow': `0 0 0 2px ${theme('colors.red.500', '#ef4444')}`,
    },
  };

  addUtilities(accessibilityUtilities, variants('accessibility'));
});
