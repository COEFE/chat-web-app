# Implementation Plan: Mobile Chat Session Resume

This document outlines the mobile‑first approach for persisting and resuming multi‑document chat sessions.

## 1. Data Model & API

```ts
interface ChatSession {
  id: string;
  docIds: [string, string?];    // one or two document IDs
  label: string;                // e.g., "Budget + Specs"
  lastActivity: number;         // UNIX timestamp
}
```

- **Endpoints**
  - `GET /api/chat-sessions` → list recent (limit 5)
  - `POST /api/chat-sessions` → create or update session
  - `DELETE /api/chat-sessions/:id` → remove session

## 2. Persistence & LocalStorage

- On every message send or doc add/remove, `POST /api/chat-sessions` with upsert behavior.
- Store `lastSessionId` in `localStorage` whenever session is created or updated.

## 3. Resume Banner

- In `pages/chat/[session].tsx` (or layout), on mount:
  1. Read `lastSessionId` from `localStorage`.
  2. If user has no session loaded but `lastSessionId` exists, `GET /api/chat-sessions/:id`.
  3. Show fixed banner at top:
     ```jsx
     <div className="fixed top-0 inset-x-0 bg-primary text-white p-2 flex justify-between items-center z-20">
       <span>Resume “{session.label}”?</span>
       <button onClick={() => loadSession(session.id)}>Resume</button>
       <button onClick={() => localStorage.removeItem('lastSessionId')}>×</button>
     </div>
     ```
- Dismiss clears `lastSessionId`.

## 4. Recent Chats Bottom‑Sheet

- In chat header, add a Sheet trigger (bottom side):
  ```jsx
  <Sheet>
    <SheetTrigger>
      <Button variant="ghost"><ClockIcon /></Button>
    </SheetTrigger>
    <SheetContent side="bottom" className="h-1/2">
      <h3>Recent Chats</h3>
      <ul>
        {sessions.map(s => (
          <li key={s.id}>
            <button onClick={() => loadSession(s.id)}>
              {s.label}
              <span className="text-xs text-muted">{formatRelative(s.lastActivity)}</span>
            </button>
          </li>
        ))}
      </ul>
    </SheetContent>
  </Sheet>
  ```
- Sheet is full‑width, swipe‑down to close, touch targets ≥40px.

## 5. UI/UX Details

- **Banner height**: ~50px, fixed at top, content scrolls under.
- **Sheet**: covers bottom 50% of viewport on mobile.
- **Touch targets**: buttons ≥40px.
- **Responsive**: use Tailwind modifiers (`sm:`, `md:`) if needed for larger screens.

## 6. Lifecycle Hooks

- **onMessageSend** or **onDocAdd**:
  1. upsert session via API.
  2. update `localStorage.lastSessionId`.
- **onLoad** of `/chat`:
  1. fetch recent sessions (`GET /api/chat-sessions`).
  2. if no active and `lastSessionId`, show banner.

---

This plan ensures a lightweight, mobile‑friendly way to resume or switch multi‑document chats without cluttering small screens.
