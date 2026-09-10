# Card Sorting Study

A shareable UX card-sorting form. Cards and categories load from a Google Sheet in your Gmail account. Participant name, email, and sort results are written back to the same spreadsheet.

## What participants see

1. Study title + instructions (from the sheet)
2. Name and email fields
3. Drag-and-drop (or tap-to-assign) sorting into predefined categories
4. Review screen, then submit → saved to the **Responses** tab

## Setup (one-time)

### 1. Create the Google Sheet

In your personal Google account, create a spreadsheet with these tabs:

#### `Study`

| A | B |
| --- | --- |
| Title | Navigation IA Card Sort |
| Instructions | Please sort each item into the category that best matches how you think about it. |
| ShuffleCards | TRUE |

#### `Categories`

| CategoryId | Label | Description |
| --- | --- | --- |
| must-have | Must have | Essential for launch |
| nice | Nice to have | Useful but not critical |
| drop | Not needed | Does not belong |

#### `Cards`

| CardId | Label | Description |
| --- | --- | --- |
| search | Search | Find products quickly |
| cart | Cart | Review items before checkout |
| help | Help chat | Talk to support |

`Responses` is created automatically on the first submission.

### 2. Add the Apps Script backend

1. Open the sheet → **Extensions → Apps Script**
2. Replace any default code with the contents of [`google-apps-script/Code.gs`](google-apps-script/Code.gs)
3. Click **Save**
4. **Authorize first (important)** — don’t deploy until this succeeds:
   - In the toolbar, choose function **`authorizeStudy`**
   - Click **Run**
   - Click **Review permissions** → pick your Google account
   - If you see **“Google hasn’t verified this app”**:
     - Click **Advanced**
     - Click **Go to \<project name\> (unsafe)**
     - Click **Allow**
   - Run again; Execution log should show the study title, category count, and card count
5. **Deploy → New deployment → Web app**
   - Description: `card-sort-api`
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the **Web app URL** (ends with `/exec`)

If you still get *“This project requires access to your Google Account…”*, you denied access or closed the dialog early — run `authorizeStudy` again and complete **Allow**. Make sure you’re signed into the same Gmail that owns the spreadsheet.

### 3. Point the form at your script

Edit [`config.js`](config.js):

```js
window.CARD_SORT_CONFIG = {
  scriptUrl: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
};
```

### 4. Share the form

- **Local preview:** open `index.html` in a browser, or run a simple static server
- **GitHub Pages:** enable Pages on this repo (Settings → Pages → Deploy from branch → `/` root). Share the Pages URL with participants.

After you change Apps Script code, create a **New deployment** (or a new version on the existing deployment) so the live `/exec` URL picks up changes.

## Updating the study

Edit the Google Sheet tabs. Participants always load the latest cards/categories — no HTML redeploy needed unless you change the web app URL.

## Privacy note

Responses land in your personal Google Sheet. Share the form URL only with intended participants.
