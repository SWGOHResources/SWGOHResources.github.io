# SWGOHResources.github.io

## Storage and sync notes

The planner currently uses localStorage as the primary fallback and Firestore only when the user is signed in.

### Firestore structure

The active remote shape is:

- users/{uid} for user metadata
- users/{uid}/planner/current for the latest planner snapshot

The app no longer writes the legacy users/{uid}/data path.

### Suggested security rules

A safe rule set is:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

### Conflict and migration behavior

Remote saves use a debounced write path, server timestamps, and a simple last-write-wins guard based on updatedAt values so newer cloud data is not overwritten by an older local edit.

The planner state is normalized and merged with defaults on load, and the saved version is checked so older payloads can be migrated over time.
