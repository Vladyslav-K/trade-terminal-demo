// An element whose text is written directly from a hot store listener. text
// is the last written value; it starts empty, so the first write always lands.
export interface TextCell {
  element: HTMLElement;
  text: string;
}

export function createTextCell(element: HTMLElement): TextCell {
  return { element, text: '' };
}

// Returns true when the text changed.
export function writeTextCell(cell: TextCell, text: string): boolean {
  if (cell.text === text) {
    return false;
  }
  cell.element.textContent = text;
  cell.text = text;
  return true;
}
