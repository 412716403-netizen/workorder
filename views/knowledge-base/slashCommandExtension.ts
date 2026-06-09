import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import SlashCommandMenu, {
  buildSlashCommands,
  type SlashCommandItem,
  type SlashCommandMenuRef,
} from './SlashCommandMenu';

export function createSlashCommandExtension(onPickImage?: () => void) {
  const allItems = buildSlashCommands(onPickImage);

  return Extension.create({
    name: 'slashCommand',
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '/',
          startOfLine: false,
          items: ({ query }) =>
            allItems.filter(item =>
              item.title.toLowerCase().includes(query.toLowerCase()),
            ),
          command: ({ editor, range, props }) => {
            (props as SlashCommandItem).command({ editor, range });
          },
          render: () => {
            let component: ReactRenderer<SlashCommandMenuRef> | null = null;
            let popup: HTMLDivElement | null = null;

            const positionPopup = (rect: DOMRect | null) => {
              if (!popup || !rect) return;
              popup.style.position = 'fixed';
              popup.style.left = `${rect.left}px`;
              popup.style.top = `${rect.bottom + 6}px`;
            };

            return {
              onStart: props => {
                component = new ReactRenderer(SlashCommandMenu, {
                  props: {
                    items: props.items as SlashCommandItem[],
                    command: (item: SlashCommandItem) => props.command(item),
                  },
                  editor: props.editor,
                });
                popup = document.createElement('div');
                popup.appendChild(component.element);
                document.body.appendChild(popup);
                positionPopup(props.clientRect?.() ?? null);
              },
              onUpdate: props => {
                component?.updateProps({
                  items: props.items as SlashCommandItem[],
                  command: (item: SlashCommandItem) => props.command(item),
                });
                positionPopup(props.clientRect?.() ?? null);
              },
              onKeyDown: props => {
                if (props.event.key === 'Escape') {
                  popup?.remove();
                  component?.destroy();
                  return true;
                }
                return component?.ref?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                popup?.remove();
                component?.destroy();
                popup = null;
                component = null;
              },
            };
          },
        }),
      ];
    },
  });
}
