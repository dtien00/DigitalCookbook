// Registry of Auth visual styles. Add a new style by:
//   1. Creating a new file in this directory that accepts the `useAuthForm`
//      return value as a `form` prop plus optional `onBack`.
//   2. Importing it here and adding an entry to AUTH_STYLES.
//   3. Changing ACTIVE_AUTH_STYLE in src/components/Auth.jsx (or wiring it
//      to an env var / user preference later).
//
// Each style is purely presentational — it never touches Supabase directly.
// All auth state and handlers come from useAuthForm() in the parent so a
// style swap can never diverge in behavior.

import BookCoverComposition from './BookCoverComposition'

export const AUTH_STYLES = {
    'book-cover-composition': BookCoverComposition,
}
