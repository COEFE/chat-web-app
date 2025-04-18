# Chat Interface UI/UX TODOs

## Contextual Clarity

- [x] Display active document name(s) in the header (e.g., "Chat with [Doc Name]").
- [x] Indicate if multiple documents are active in the header.
- [x] Display the active Excel sheet name when applicable.

## Message Readability & Formatting

- [x] Implement Markdown rendering for message content (`react-markdown`).
- [x] Enhance visual differentiation between user and assistant messages (e.g., slightly different background/border).
- [x] Add optional timestamps to messages (e.g., on hover or below bubble).

## Loading & Error States

- [ ] Add a "typing" indicator when the AI is processing (`isLoading`).
- [ ] Display user-friendly error messages within the chat UI or via Toasts.

## Input Area Enhancements

- [x] Replace `<Input>` with `<Textarea>` for multi-line input.
- [x] Consider Shift+Enter for newline vs. Enter for submit in Textarea.
- [ ] Replace "Send" text button with an icon button (e.g., Paper Plane) + aria-label.

## Initial State / Empty Chat

- [ ] Show a placeholder message in an empty chat (e.g., "Ask me anything about [Document Name]").

## Responsiveness

- [ ] Test and refine chat interface layout on smaller screens (mobile/tablet).
- [ ] Apply responsive Tailwind modifiers (`sm:`, `md:`) as needed for fonts, padding, etc.

## Backend/API Integration

- [ ] Refactor Excel update handling: Use structured API response (e.g., `excelUpdated: true`) instead of string markers.
