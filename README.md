# Clickers Reading Room

A responsive, multi-book reading website for original fiction by Yung Dharick, designed for readers arriving from Pinterest and other social platforms.

## Reader experience

- A growing catalogue driven by `books.js`; adding a valid book automatically adds it to the library.
- Search across titles, genres, labels, descriptions, and authors.
- Genre filters generated from the actual catalogue (no hard-coded genre limit).
- Responsive desktop, tablet, and mobile book layouts.
- In-browser chapter reader with chapter picker, adjustable text size, light/dark reading themes, and keyboard navigation.
- Local reading progress saved on the reader's device.
- Plain-text book downloads and shareable book links.
- A dedicated shareable landing page for every book at `/stories/<book-id>/`, with book-specific Open Graph and Pinterest preview metadata, a cover, synopsis, and a direct reading link.
- Automated checks for the catalogue, chapters, and reader script.

## Add another book

Add a new object to `window.READING_ROOM_BOOKS` in `books.js`. Give it a unique `id`, `title`, `genre`, `label`, `description`, `author`, optional `cover` path, and a non-empty `chapters` array. Each chapter needs a `title` and a non-empty `paragraphs` array. Genre filters and book landing pages are generated from this catalogue; no extra homepage card needs to be written by hand.

Keep `index.html`, `books.js`, and the `assets` folder together. Cover images should be added under `assets/` and referenced with a relative path such as `assets/my-cover.jpg`.

## Deploy

1. Open **Actions → Publish reading website** in the GitHub repository.
2. Choose **Run workflow**.
3. Wait for generation, validation, and deployment to finish.
4. Open the published Pages URL. Every catalogue entry should have a corresponding `/stories/<book-id>/` landing page.

## Important publishing note

This is a static GitHub Pages website. The manuscript text in `books.js` is publicly accessible to visitors who inspect the repository or website assets. Static pages cannot keep manuscript source private; do not publish text you are not ready to make publicly readable.
