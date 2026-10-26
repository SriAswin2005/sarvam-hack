# Saha · Sarvam personal assistant

A small personal assistant for Telugu and English speakers. Speak or type to plan your day, capture notes, create tasks with deadlines, and draft emails. Built for the Sarvam hackathon using plain JavaScript, Node.js, and the Sarvam SDK.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
```

Copy `.env.example` to `.env` and set `SARVAM_API_KEY` to your own key. Then:

```sh
npm start
```

Open **http://localhost:3000**. The server binds to this computer only.

## First API call

Use a recording shorter than 30 seconds:

```sh
npm run first-call -- path/to/audio.wav
```

The script reads the key from the environment and calls Sarvam's `/speech-to-text` endpoint through `client.speechToText.transcribe`, with `saaras:v4`. It prints the transcript.

Verified local output from a short synthesized English recording:

```text
Remind me to submit my college assignment tomorrow at five p.m.
```

## Try the demo

1. Open **Inbox → Try sample inbox**. These emails are fictional and explicitly labeled.
2. Click **Make a plan from these emails**. Sarvam creates tasks from the email context.
3. In **My day**, click **Speak**, talk in Telugu or English, and click **Stop**. Review the transcript, then send it.
4. Try: `రేపు సాయంత్రం ఐదు గంటలకు అసైన్మెంట్ సమర్పించాలని గుర్తు చేయి.`
5. Try: `Note that my project meeting is in room 204.`
6. Try: `Draft an email to professor@example.com asking for one extra day to submit my assignment.`
7. Open **Email drafts**, edit the generated text, then **Open in Gmail** to review and send from Gmail.

Voice recordings stop at 28 seconds. Automatic language detection, Telugu, and English are selectable. Tasks, notes, drafts, inbox data, and conversation history persist locally. Notes can be edited and deleted. Tasks can be completed and removed. Optional browser reminders run while the app is open.

## Connect Gmail and college Gmail

Google sign-in is implemented but needs your own Google OAuth application credentials. No email passwords are used.

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Gmail API** in APIs & Services → Library.
3. Configure **Google Auth Platform** → Branding and Audience. For an External app in testing, add your personal and college Google addresses as test users.
4. In Data Access, add `https://www.googleapis.com/auth/gmail.readonly`.
5. Create an OAuth client ID with type **Web application**.
6. Add this exact authorized redirect URI:

   ```text
   http://localhost:3000/auth/google/callback
   ```

7. Set the following in your local `.env`:

   ```dotenv
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   BASE_URL=http://localhost:3000
   ```

8. Restart `npm start`. Open **Connections & settings → Connect a Google account**. Connect your personal account, then repeat for your college account.
9. Open **Inbox → Sync inboxes**. This fetches the newest 10 inbox emails per account from the last 14 days. Click **Make a plan** when ready.

Your college administrator may restrict third-party OAuth applications. HTML-only emails use Gmail's preview text. Attachments, calendar events, and background inbox monitoring are outside this prototype's scope. The Gmail integration requires end-to-end verification after OAuth credentials are supplied.

## How it works

- **Speech:** Sarvam Saaras v4, `/speech-to-text`.
- **Assistant:** Sarvam 105B, chat completions with JSON output for task, note, and draft actions.
- **Backend:** Node's built-in HTTP server; credentials never reach the browser.
- **Frontend:** HTML, CSS, browser MediaRecorder, and plain JavaScript.
- **Storage:** ignored `.data/` directory. Disconnect removes the account's locally stored tokens and emails; revoke Google access separately in your Google Account if needed.
- **Dependencies:** only `sarvamai` and its transitive dependencies. No frontend build step. Optional Google Fonts fall back to system fonts.

## Prototype boundaries

This is a single-user local demo. Email drafts open in Gmail for user review and sending. Notifications require permission, work only while this page is open, and are checked every 15 seconds near the deadline. No background scheduler runs after closing the app.

Emails, notes, tasks, and the recent conversation are sent to Sarvam when you submit a chat request. Google refresh tokens are stored locally in plaintext in `.data/accounts.json`. Use a trusted computer; deploying a hosted version requires user authentication, encryption of stored tokens, and per-user storage.

`.env`, `.data/`, and `node_modules/` are excluded from Git. Never commit keys or Google tokens.

## References

- [Sarvam quickstart](https://docs.sarvam.ai/api/getting-started/quickstart)
- [Saaras speech models](https://docs.sarvam.ai/api/getting-started/models/saaras)
- [Sarvam chat API](https://docs.sarvam.ai/api/api-guides-tutorials/chat-completion/overview)
- [Gmail API](https://developers.google.com/workspace/gmail/api/guides)
