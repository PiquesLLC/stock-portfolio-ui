# App Store Submission Pack

Use this file to fill App Store Connect for the current Nala iOS submission.

## Core App Info

- App Name: `Nala`
- Subtitle: `Portfolio intelligence`
- Bundle ID: `com.nala.portfolio`
- Category: `Finance`
- Secondary Category: `Productivity` (optional)
- Marketing URL: `https://nalaai.com`
- Privacy Policy URL: `https://nalaai.com/privacy`
- Support URL:
  - Recommended if you have a support page: `https://nalaai.com/support`
  - If you do not, use `https://nalaai.com/privacy` temporarily and add support contact in review notes

## Promotional Text

Track your portfolio with cleaner charts, richer stock detail, watchlists, alerts, and AI-powered market context.

## Description

Nala helps you track, analyze, and understand your portfolio in one place.

Monitor your total portfolio value, holdings, watchlists, and stock detail pages with clean interactive charts and rich market context. Nala is built for investors who want more than a brokerage balance screen.

Features include:

- Real-time portfolio tracking with interactive performance charts
- Stock detail pages with earnings, dividends, analyst events, AI event overlays, and watch/follow actions
- Watchlists, price alerts, and milestone notifications
- Portfolio intelligence including concentration, diversification, income, and risk signals
- AI-powered features like portfolio briefings, behavior insights, and stock Q&A
- Brokerage import support and manual portfolio management
- Leaderboards, profiles, and shareable portfolio views

Nala is a portfolio intelligence app. It does not execute trades or provide broker-dealer functionality.

## Keywords

portfolio,stocks,investing,watchlist,market,finance,dividends,earnings,alerts,brokerage

## What’s New In This Version

- Improved mobile portfolio switching from the main Portfolio tab
- Cleaner stock detail layout and action placement
- Better watchlist creation flow
- Reliability fixes across notifications, charts, and stock detail transitions
- Additional end-to-end regression coverage and general stability improvements

## Review Notes

Nala is a portfolio intelligence and tracking app. Users can:

- create an account
- add holdings manually
- import or manage portfolio data
- view charts, stock detail, watchlists, and alerts
- access AI-generated portfolio and stock insights on supported plans

Important notes for review:

- Nala does not execute securities trades
- Plaid is used only for brokerage account linking/import where enabled
- Sign in with Apple is supported
- The app contains subscriptions for premium features

If App Review needs a test account, use the credentials below or replace them with your live review account before submission.

## App Review Test Account

Replace these with a real review-safe account before submission:

- Email: `REPLACE_ME_REVIEW_EMAIL`
- Password: `REPLACE_ME_REVIEW_PASSWORD`
- MFA / verification notes: `If email verification or MFA is enabled for the review account, provide the exact bypass or code delivery instructions here.`

## Privacy / Data Use Summary

Based on the current codebase, be prepared to declare data in App Privacy that may include:

- Contact Info
  - Email Address
- User Content
  - Portfolio / holdings data entered by the user
- Identifiers
  - User ID / account identifiers
- Usage Data
  - Product interaction data
- Diagnostics
  - Crash / error data if your production stack collects it

Third-party services visible in the codebase:

- Plaid for brokerage linking
- Polygon, Finnhub, Alpha Vantage for market data
- Perplexity for AI features
- Resend for email delivery
- Stripe for billing/subscriptions

Confirm the final App Privacy answers against your production configuration before submitting.

## Export Compliance

The app uses standard HTTPS/TLS and encrypted authentication/storage flows. If App Store Connect asks whether the app uses encryption, the answer will typically be `Yes`, followed by the standard exemption path for built-in or exempt encryption. Use the same answer set you used for the upload if Xcode already validated it.

## Screenshots Checklist

You still need to upload screenshots in App Store Connect for the device classes you support.

Recommended screenshot set:

- Portfolio overview
- Stock detail page
- Watchlists
- Alerts / notifications
- AI / insights page
- Settings or portfolio intelligence

## Subscription Checklist

The app code references subscription tiers:

- Pro
- Premium
- Elite

Before final submission, confirm in App Store Connect:

- products exist and are in `Ready to Submit` or approved state
- pricing and localization are complete
- review screenshots/details for subscriptions are complete
- the app version is linked to the correct in-app purchases/subscriptions if required

## Release Checklist

1. Attach the processed build to the App Store version.
2. Paste the metadata from this file.
3. Upload screenshots.
4. Complete App Privacy answers.
5. Add the review account and notes.
6. Confirm subscription products are ready.
7. Submit for review.
