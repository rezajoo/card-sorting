/**
 * Card Sorting Study — Google Apps Script backend
 *
 * HOW TO INSTALL
 * 1. Create a Google Sheet in your personal Gmail (template below).
 * 2. Extensions → Apps Script
 * 3. Delete any default code and paste this entire file.
 * 4. Save, then Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web app URL into config.js (scriptUrl).
 *
 * SHEET TEMPLATE (create these tabs with exact names)
 *
 * Tab: Study
 *   A          | B
 *   Title      | Navigation IA Card Sort
 *   Instructions | Please sort each item into the category that best matches how you think about it.
 *   ShuffleCards | TRUE
 *
 * Tab: Categories
 *   CategoryId | Label        | Description
 *   must-have  | Must have    | Essential for launch
 *   nice       | Nice to have | Useful but not critical
 *   drop       | Not needed   | Does not belong
 *
 * Tab: Cards
 *   CardId | Label     | Description
 *   search | Search    | Find products quickly
 *   cart   | Cart      | Review items before checkout
 *   help   | Help chat | Talk to support
 *
 * Tab: Responses  (created automatically on first submit if missing)
 *   Timestamp | Name | Email | Study Title | Results JSON | <one column per card label>
 */

var STUDY_SHEET = "Study";
var CATEGORIES_SHEET = "Categories";
var CARDS_SHEET = "Cards";
var RESPONSES_SHEET = "Responses";

/**
 * Run this once from the Apps Script editor to grant permissions.
 * 1. Select authorizeStudy in the function dropdown (next to Run)
 * 2. Click Run
 * 3. Review permissions → Allow
 *    If you see "Google hasn't verified this app":
 *    Advanced → Go to <project name> (unsafe) → Allow
 */
function authorizeStudy() {
  var study = getStudy_();
  Logger.log("Authorized. Loaded study: " + study.title);
  Logger.log(
    "Categories: " +
      study.categories.length +
      ", Cards: " +
      study.cards.length
  );
}

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "getStudy";
    if (action === "getStudy") {
      return json_({ ok: true, study: getStudy_() });
    }
    return json_({ ok: false, error: "Unknown action." });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    var body = JSON.parse(raw);
    var action = body.action || "submit";

    if (action === "submit") {
      saveResponse_(body);
      return json_({ ok: true });
    }

    return json_({ ok: false, error: "Unknown action." });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function getStudy_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var studySheet = ss.getSheetByName(STUDY_SHEET);
  if (!studySheet) {
    throw new Error('Missing "' + STUDY_SHEET + '" sheet.');
  }

  var studyMap = readKeyValueSheet_(studySheet);
  var categories = readTableSheet_(ss.getSheetByName(CATEGORIES_SHEET), [
    "categoryid",
    "label",
    "description",
  ]);
  var cards = readTableSheet_(ss.getSheetByName(CARDS_SHEET), [
    "cardid",
    "label",
    "description",
  ]);

  return {
    title: studyMap.title || "Card Sorting Study",
    instructions:
      studyMap.instructions ||
      "Sort each card into the category that fits best.",
    shuffleCards: studyMap.shufflecards || "TRUE",
    categories: categories.map(function (row) {
      return {
        id: row.categoryid || row.label,
        label: row.label,
        description: row.description || "",
      };
    }),
    cards: cards.map(function (row) {
      return {
        id: row.cardid || row.label,
        label: row.label,
        description: row.description || "",
      };
    }),
  };
}

function saveResponse_(payload) {
  var name = String(payload.name || "").trim();
  var email = String(payload.email || "").trim();
  var studyTitle = String(payload.studyTitle || "").trim();
  var results = payload.results || [];

  if (!name || !email) {
    throw new Error("Name and email are required.");
  }
  if (!results.length) {
    throw new Error("No sort results were provided.");
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RESPONSES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(RESPONSES_SHEET);
  }

  ensureResponseHeader_(sheet, results);

  var header = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function (v) {
      return String(v);
    });

  var row = header.map(function () {
    return "";
  });

  setCell_(row, header, "Timestamp", new Date());
  setCell_(row, header, "Name", name);
  setCell_(row, header, "Email", email);
  setCell_(row, header, "Study Title", studyTitle);
  setCell_(row, header, "Results JSON", JSON.stringify(results));

  results.forEach(function (item) {
    var key = "Card: " + String(item.cardLabel || item.cardId || "");
    setCell_(row, header, key, String(item.categoryLabel || item.categoryId || ""));
  });

  sheet.appendRow(row);
}

function ensureResponseHeader_(sheet, results) {
  var base = ["Timestamp", "Name", "Email", "Study Title", "Results JSON"];
  var cardCols = results.map(function (item) {
    return "Card: " + String(item.cardLabel || item.cardId || "");
  });
  var desired = base.concat(cardCols);

  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, desired.length).setValues([desired]);
    sheet.setFrozenRows(1);
    return;
  }

  var existing = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function (v) {
      return String(v);
    });

  var missing = desired.filter(function (col) {
    return existing.indexOf(col) === -1;
  });

  if (missing.length) {
    sheet
      .getRange(1, existing.length + 1, 1, missing.length)
      .setValues([missing]);
  }
}

function setCell_(row, header, key, value) {
  var index = header.indexOf(key);
  if (index >= 0) {
    row[index] = value;
  }
}

function readKeyValueSheet_(sheet) {
  var values = sheet.getDataRange().getValues();
  var map = {};
  values.forEach(function (row) {
    var key = String(row[0] || "")
      .trim()
      .toLowerCase();
    if (!key) return;
    map[key] = String(row[1] != null ? row[1] : "").trim();
  });
  return map;
}

function readTableSheet_(sheet, requiredHeaders) {
  if (!sheet) {
    throw new Error("Missing required sheet tab.");
  }

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return [];
  }

  var headers = values[0].map(function (h) {
    return String(h || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  });

  requiredHeaders.forEach(function (needed) {
    if (headers.indexOf(needed) === -1 && needed !== "description") {
      // CategoryId/CardId/Label required; description optional
    }
  });

  if (headers.indexOf("label") === -1) {
    throw new Error('Sheet "' + sheet.getName() + '" needs a Label column.');
  }

  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    var empty = true;
    headers.forEach(function (header, idx) {
      if (!header) return;
      var value = row[idx] != null ? String(row[idx]).trim() : "";
      obj[header] = value;
      if (value) empty = false;
    });
    if (!empty && obj.label) {
      rows.push(obj);
    }
  }
  return rows;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
