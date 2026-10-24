# Portfolio Dashboard

Private visitor-analytics dashboard for the portfolio:
https://pasindu-promodh.github.io/portfolio-dashboard/

React + TypeScript + MUI, built with Vite and deployed to GitHub Pages by
`.github/workflows/deploy.yml` on every push to `main`.

Access is enforced by the Firestore rules in the `portfolio2` repo
(`firestore.rules`). Any Google account can sign in, but only the owner
account can read or delete data.

## Development

```sh
cp .env.example .env   # same Firebase web config as portfolio2
npm install
npm run dev
npm run lint && npm run build
```
