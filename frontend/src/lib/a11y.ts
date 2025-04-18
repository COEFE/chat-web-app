/**
 * Accessibility utilities for ensuring WCAG compliance
 */

/**
 * Calculates the relative luminance of a color
 * Formula from WCAG 2.0: https://www.w3.org/TR/WCAG20-TECHS/G17.html#G17-tests
 * 
 * @param r Red channel (0-255)
 * @param g Green channel (0-255)
 * @param b Blue channel (0-255)
 * @returns Relative luminance value
 */
export function getLuminance(r: number, g: number, b: number): number {
  // Convert RGB to sRGB
  const sR = r / 255;
  const sG = g / 255;
  const sB = b / 255;

  // Calculate luminance
  const R = sR <= 0.03928 ? sR / 12.92 : Math.pow((sR + 0.055) / 1.055, 2.4);
  const G = sG <= 0.03928 ? sG / 12.92 : Math.pow((sG + 0.055) / 1.055, 2.4);
  const B = sB <= 0.03928 ? sB / 12.92 : Math.pow((sB + 0.055) / 1.055, 2.4);

  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Calculates the contrast ratio between two colors
 * Formula from WCAG 2.0: https://www.w3.org/TR/WCAG20-TECHS/G17.html#G17-tests
 * 
 * @param color1 First color in hex format (e.g., "#ffffff")
 * @param color2 Second color in hex format (e.g., "#000000")
 * @returns Contrast ratio (1-21)
 */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getLuminanceFromHex(color1);
  const lum2 = getLuminanceFromHex(color2);
  
  // Calculate contrast ratio
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Gets luminance from a hex color
 * 
 * @param hex Hex color (e.g., "#ffffff")
 * @returns Luminance value
 */
function getLuminanceFromHex(hex: string): number {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Convert hex to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  return getLuminance(r, g, b);
}

/**
 * Checks if a color combination meets WCAG AA contrast requirements
 * 
 * @param foreground Foreground color in hex format
 * @param background Background color in hex format
 * @param isLargeText Whether the text is large (≥18pt or ≥14pt bold)
 * @returns Whether the contrast meets WCAG AA requirements
 */
export function meetsWCAGAA(foreground: string, background: string, isLargeText = false): boolean {
  const ratio = getContrastRatio(foreground, background);
  return isLargeText ? ratio >= 3 : ratio >= 4.5;
}

/**
 * Checks if a color combination meets WCAG AAA contrast requirements
 * 
 * @param foreground Foreground color in hex format
 * @param background Background color in hex format
 * @param isLargeText Whether the text is large (≥18pt or ≥14pt bold)
 * @returns Whether the contrast meets WCAG AAA requirements
 */
export function meetsWCAGAAA(foreground: string, background: string, isLargeText = false): boolean {
  const ratio = getContrastRatio(foreground, background);
  return isLargeText ? ratio >= 4.5 : ratio >= 7;
}

/**
 * Returns a CSS class based on whether the contrast is sufficient
 * 
 * @param foreground Foreground color in hex format
 * @param background Background color in hex format
 * @param isLargeText Whether the text is large (≥18pt or ≥14pt bold)
 * @returns CSS class to apply
 */
export function getContrastClass(foreground: string, background: string, isLargeText = false): string {
  const ratio = getContrastRatio(foreground, background);
  
  if (isLargeText) {
    if (ratio >= 4.5) return 'contrast-aaa'; // AAA for large text
    if (ratio >= 3) return 'contrast-aa';    // AA for large text
    return 'contrast-fail';
  } else {
    if (ratio >= 7) return 'contrast-aaa';   // AAA for normal text
    if (ratio >= 4.5) return 'contrast-aa';  // AA for normal text
    return 'contrast-fail';
  }
}
