# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/1509186e-f40c-45bd-936e-eb663446f1fd

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/1509186e-f40c-45bd-936e-eb663446f1fd) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

## Backend configuration

By default the app talks to a local SQLite database exposed through a lightweight Node API.

1. Start the API: `npm run server` (or `npm run server:watch` for automatic restarts when files or `.env` change). It listens on `http://localhost:4000` by default.
2. In another terminal, run the UI: `npm run dev`.

To point the UI at a different API origin, set `VITE_SQLITE_API_URL` in `.env`.

If you want to use Supabase (and regain AI chat), set `VITE_USE_SUPABASE=true` instead and skip the local server.

Each sheet is materialized as its own SQLite table (`sheet_<sheet_id>`). Column names track the spreadsheet headers, so SQL (and the AI agent) can reference meaningful column identifiers like `revenue` instead of generic column numbers.

- Columns can be removed from the UI, which maps to dropping the corresponding column from the sheet table. (This capability is only available while using the local SQLite backend.)
- To enable the local Gemini-powered assistant, add `GEMINI_API_KEY=<your key>` to `.env` and restart `npm run server`. The UI will call the local API, which proxies requests to Gemini Flash.

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/1509186e-f40c-45bd-936e-eb663446f1fd) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
