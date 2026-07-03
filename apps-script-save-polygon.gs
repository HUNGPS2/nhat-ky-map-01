/**
 * GOOGLE APPS SCRIPT — Backend nhận dữ liệu lô đất từ measure-area-module.js
 * Deploy: Extensions > Apps Script > Deploy > New deployment > Web app
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Copy URL /exec sau khi deploy vào sheetWebhookUrl ở file JS.
 *
 * Sheet cần có các cột theo đúng thứ tự (dòng 1 là header):
 * name | area_m2 | area_ha | area_cong | perimeter_m | geojson | created_at
 */

const SHEET_NAME = 'LoDat'; // đổi theo tên sheet của bạn

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(['name', 'area_m2', 'area_ha', 'area_cong', 'perimeter_m', 'geojson', 'created_at']);
    }
    sheet.appendRow([
      data.name,
      data.area_m2,
      data.area_ha,
      data.area_cong,
      data.perimeter_m,
      data.geojson,
      data.created_at
    ]);
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Dùng để load lại các lô đất đã lưu lên bản đồ (gọi bằng fetch GET từ JS)
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);

  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  const rows = values.map((row) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = row[i]));
    return obj;
  });
  return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(ContentService.MimeType.JSON);
}
