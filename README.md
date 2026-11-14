# Clickers — The Story House

Clickers is the public literary home for original writing by Yung Dharick. The customer-facing experience is an editorial bookshop for discovering books, browsing by genre, viewing individual editions and reading released previews.

## Public experience
- Editorial homepage, author introduction and mood-based discovery.
- Dedicated bookshop with search and genre filtering.
- Individual book pages with cover, synopsis, chapter count, preview and optional external purchase destination.
- Responsive layouts, accessible controls and reduced-motion support.
- Newly published books can load from the existing public author API.
- Reader preview supports chapter navigation.

## Catalogue reset
The old public catalogue has been cleared. `books.js` now starts empty, and the old generated story landing pages and previous public cover asset are being removed. This reset does not delete the Author Studio, author account, private manuscript records, chapter revisions or customer/order data.

## Purchase links
Book detail pages can display an explicit `purchaseUrl` when supplied by a future publishing/catalogue integration. This visual refresh does not create a payment processor or claim that checkout is active.

## Deploy
GitHub Pages is published through `.github/workflows/pages.yml`. The validation workflow checks the public storefront and Worker API security tests.
