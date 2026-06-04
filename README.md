# Peopoll

A cross-platform poll app for web, iOS, and Android that lets people vote, comment, and review historic public vote trends on current topics.

## Vision

- Real-time polling around politics, sports, entertainment, food, fashion, and culture.
- Commenting + engagement on each poll.
- Vote trend history charts to surface shifts over time.
- Cloud backend for user data, vote counts, and analytics.

## Recommended stack

- Frontend: Expo + React Native for iOS/Android/web from a single codebase.
- Backend: Firebase Auth + Firestore + Cloud Functions for fast MVP.
- Analytics: Firebase Analytics, Sentry optional.
- Hosting: Vercel for web, Expo builds for App Store / Play Store.

## Monetization ideas

- Ad-supported feed with native banners/interstitials.
- Premium subscription to remove ads and unlock advanced analytics.
- Promoted polls or featured topics for publishers/brands.
- In-app purchases for poll themes, profile upgrades, or sticker packs.
- Data insights API / anonymous trend reports for media partners.

## Starter files

- `App.js` — app shell + navigation.
- `package.json` — Expo + Firebase dependencies.
- `app.json` — Expo configuration.
- `src/firebase/firebaseConfig.js` — placeholder for Firebase keys.
- `src/screens/HomeScreen.js` — home feed stub.
- `src/screens/PollDetailScreen.js` — detail view stub.
- `src/navigation/AppNavigator.js` — navigation setup.
- `TODO.md` — build task list.

## Next steps

1. Configure Firebase project and add credentials to `src/firebase/firebaseConfig.js`.
2. Implement authentication flow and Firestore data models.
3. Build poll creation, voting, and comment screens.
4. Add trend chart visualization and historic vote snapshots.
5. Enable web hosting and mobile build pipelines.
