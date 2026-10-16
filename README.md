# The Reading Room

A responsive, static reading website for Yung Dharick's novels.

## Included

- **The Man Behind the Mask** — 24 chapters
- **Blood & Quiet Things** — 22 chapters
- Search and genre filters
- In-browser chapter reader and chapter picker
- Adjustable text size and light/dark reading themes
- Local reading progress (stored on the reader's device)
- Plain-text downloads and shareable book links
- Existing cover artwork and social-preview metadata for sharing
- Mobile-responsive layout and keyboard support
- Automated validation of the book data and reader JavaScript

## Preview locally

Open `index.html` in a browser. The book data is loaded from `books.js`, so keep both files together.

## Deploy when ready

1. Open **Settings → Pages** for this repository.
2. Select **GitHub Actions** as the build and deployment source.
3. Open **Actions → Publish reading website → Run workflow**.
4. Wait for the deployment to finish, then open the published URL shown by the workflow.

The manuscripts are included in the public repository's `books.js` file. Anyone who can access the deployed site can read or download these editions.
