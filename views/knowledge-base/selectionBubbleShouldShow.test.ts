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
  it('shows for CellSelection so multi-cell merge/format is available', () => {
    const sel = Object.create(CellSelection.prototype) as CellSelection;
    vi.spyOn(sel, 'isColSelection').mockReturnValue(false);
    vi.spyOn(sel, 'isRowSelection').mockReturnValue(false);
    expect(shouldShowKnowledgeSelectionBubbleMenu(mockEditor(sel), { hasFocus: () => true })).toBe(true);
  });

  it('shows for column CellSelection', () => {
    const sel = Object.create(CellSelection.prototype) as CellSelection;
    vi.spyOn(sel, 'isColSelection').mockReturnValue(true);
    vi.spyOn(sel, 'isRowSelection').mockReturnValue(false);
    expect(shouldShowKnowledgeSelectionBubbleMenu(mockEditor(sel), { hasFocus: () => true })).toBe(true);
  });

  it('shows for non-empty text selection', () => {
    expect(
      shouldShowKnowledgeSelectionBubbleMenu(
        mockEditor({ empty: false }),
        { hasFocus: () => true },
      ),
    ).toBe(true);
  });

  it('hides when editor unfocused', () => {
    expect(
      shouldShowKnowledgeSelectionBubbleMenu(
        mockEditor({ empty: false }),
        { hasFocus: () => false },
      ),
    ).toBe(false);
  });
});
