/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { CellSelection } from '@tiptap/pm/tables';
import { shouldShowKnowledgeSelectionBubbleMenu } from './selectionBubbleShouldShow';

function mockEditor(selection: object) {
  return {
    isActive: () => false,
    state: { selection },
  } as never;
}

describe('shouldShowKnowledgeSelectionBubbleMenu', () => {
  it('hides for CellSelection', () => {
    const sel = Object.create(CellSelection.prototype) as CellSelection;
    vi.spyOn(sel, 'isColSelection').mockReturnValue(true);
    vi.spyOn(sel, 'isRowSelection').mockReturnValue(false);
    expect(shouldShowKnowledgeSelectionBubbleMenu(mockEditor(sel), { hasFocus: () => true })).toBe(false);
  });

  it('shows for non-empty text selection', () => {
    expect(
      shouldShowKnowledgeSelectionBubbleMenu(
        mockEditor({ empty: false }),
        { hasFocus: () => true },
      ),
    ).toBe(true);
  });
});
