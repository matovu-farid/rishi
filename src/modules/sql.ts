import Database from "@tauri-apps/plugin-sql";

const db = await Database.load("sqlite:rishi.db");
// create table for page data
await db.execute(
  "CREATE TABLE IF NOT EXISTS page_data (id TEXT PRIMARY KEY, bookId TEXT, data TEXT)"
);

export async function getPageData(id: string) {
  const result = await db.select("SELECT * FROM page_data WHERE id = ?", [id]);
  return result;
}

export async function setPageData(id: string, data: string) {
  await db.execute("INSERT INTO page_data (id, data) VALUES (?, ?)", [
    id,
    data,
  ]);
}
