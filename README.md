# Peopoll

A cross-platform polling app for **web, iOS, and Android** built from a single Expo / React Native codebase. People sign in, create polls, vote, comment, follow each other, chat, and watch live vote‑trend charts shift over time.

## Features

- **Polls & voting** — create polls with multiple options, vote in real time, and browse a ranked "For you" feed by category.
- **Trend charts** — every poll records hourly vote snapshots so you can see how opinion moves across 1 day / 3 days / a week / all time.
- **Social graph** — follow people (mutual follows = friends), see friends' newest polls, and 1:1 direct messaging.
- **Groups** — topic communities with members, roles, group chat, and group polls.
- **Verified accounts** — businesses, public figures, news outlets, etc. can request a verified badge (granted by an admin).
- **Phone‑verified voting** — one verified phone number = one voter, to keep polls fair.
- **Light/dark theme**, a side drawer with category filters + Settings, and a contact form for support.

## Tech stack

- **Frontend:** Expo + React Native (`react-native-web` for the web build), React Navigation.
- **Backend:** Firebase — Auth (Google + anonymous + phone), Firestore (data + security rules), and Firebase Hosting for the website.
- **Project id:** `peopoll-8222e`

## Project structure

```
App.js                     App shell, auth gate, providers
app.json                   Expo config (versions, bundle ids, EAS project id)
eas.json                   EAS build/submit profiles
firebase.json              Firestore rules/indexes + Hosting config
firestore.rules            Security rules (source of truth for what clients may write)
public/privacy.html        Standalone privacy‑policy page (served at /privacy.html)
scripts/                   Deploy + database seed scripts
src/
  components/              Reusable UI (PollCard, AppDrawer, ContactForm, …)
  firebase/                Firebase app + config
  navigation/              Stack navigator, drawer context
  screens/                 Home, Groups, Friends, Profile, Settings, Policy, …
  theme/                   Theme context (light/dark)
  utils/                   Data access: polls, social, chat, comments, groups, account
```

## Getting started

```powershell
npm install
npm start            # Expo dev server (press w for web, a/i for Android/iOS)
```

Firebase credentials live in `src/firebase/firebaseConfig.js`.

## Deploying updates

A single script ships to any/all targets (see `scripts/deploy.ps1`).

First‑time setup:

```powershell
npm install -g firebase-tools eas-cli
firebase login
eas login
```

Then:

```powershell
npm run deploy            # web + Firestore rules (fast, default)
npm run deploy:web        # website only (expo export -> Firebase Hosting)
npm run deploy:rules      # Firestore rules + indexes only
npm run deploy:all        # web + rules + mobile store build

# Or call the script directly for more control:
./scripts/deploy.ps1 -Target all -Bump patch -Message "Fix vote sync"
./scripts/deploy.ps1 -Target mobile -Platform android
./scripts/deploy.ps1 -Target all -DryRun     # preview commands, run nothing
```

| Target | What happens |
| ------ | ------------ |
| `web` | `expo export` → `dist/`, copies `privacy.html`, `firebase deploy --only hosting` |
| `rules` | `firebase deploy --only firestore` (rules + indexes) |
| `mobile` | EAS store build (`eas build` / optional `eas submit`), or OTA push with `-Update` |

> **Mobile OTA (`-Update`)** requires `"updates": { "enabled": true }` in `app.json`. It is currently disabled, so mobile updates go through the normal store build/submit flow until you enable EAS Update.

## Privacy policy

The privacy policy exists in **two** places, kept in sync:

- **In‑app screen:** `src/screens/PolicyScreen.js` (reachable from the drawer → "Privacy policy").
- **Public web page:** `public/privacy.html` — a standalone page the app stores can link to.

### Your public privacy‑policy URL

Firebase Hosting serves the `dist/` folder, and the deploy step copies `public/privacy.html` into it, so after a web deploy the policy is live at:

- `https://peopoll-8222e.web.app/privacy.html`
- `https://peopoll-8222e.firebaseapp.com/privacy.html`
- If you connect the custom domain: `https://peopollapp.com/privacy.html`

Use that URL wherever a privacy‑policy link is required (Apple App Store Connect → App Privacy, Google Play Console → Store listing, and the app's own footer).

### How to set it up / change it

1. Edit the content in `public/privacy.html` (and mirror any changes in `src/screens/PolicyScreen.js` so the in‑app copy matches).
2. Deploy the website: `npm run deploy:web` (this exports, copies the file, and publishes it).
3. **Custom domain (optional):** Firebase Console → Hosting → **Add custom domain** → enter `peopollapp.com`, then add the DNS records Firebase gives you at your domain registrar. Once verified, the policy is also reachable at `https://peopollapp.com/privacy.html`.

Support / contact for privacy requests goes to **business@peopollapp.com** (wired into the in‑app contact form).

## Seeding demo data

Admin‑level scripts populate realistic demo content (see `scripts/`):

```powershell
npm run seed:data      # realistic users + polls + one real voter per vote (Firebase Admin SDK)
npm run seed:groups    # demo groups, members, chat, and group polls
npm run seed:trend     # synthetic hourly trend history for existing polls
```

`seed:data` needs a service‑account key at `scripts/serviceAccountKey.json` (Firebase Console → Project settings → Service accounts → Generate new private key) or `GOOGLE_APPLICATION_CREDENTIALS` set to that key. **Do not commit the key.**

## Monetization ideas

- Ad‑supported feed with native banners/interstitials.
- Premium subscription to remove ads and unlock advanced analytics.
- Promoted polls or featured topics for publishers/brands.
- Anonymous trend‑report insights for media partners.
