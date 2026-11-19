const FLASH_A = 'animate-flash-a';
const FLASH_B = 'animate-flash-b';

// Both classes run the same keyframes under different names, so switching
// between them restarts the animation without forcing a reflow.
export function flash(element: HTMLElement): void {
  const isA = element.classList.contains(FLASH_A);
  element.classList.toggle(FLASH_A, !isA);
  element.classList.toggle(FLASH_B, isA);
}
