import { BookData } from "@/generated";
import Database from "@tauri-apps/plugin-sql";

const db = await Database.load("sqlite:rishi.db");
// create table for page data
await db.execute(
  `CREATE TABLE IF NOT EXISTS page_data (
        id TEXT PRIMARY KEY,
        bookId TEXT,
        pageNumber INT,
        data TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
);

export async function savePageData({
  id,
  bookId,
  data,
  pageNumber,
}: {
  id: string;
  bookId: string;
  data: string;
  pageNumber: number;
}) {
  await db.execute(
    `INSERT INTO page_data (
      id, 
      bookId, 
      pageNumber, 
      data) 
    VALUES ($1, $2, $3, $4)`,
    [id, bookId, pageNumber, data]
  );
}

export async function getAllPageDataByBookId(bookId: string) {
  const result = await db.select(
    "SELECT * FROM page_data WHERE bookId = $1 ORDER BY pageNumber ASC",
    [bookId]
  );
  return result;
}
// create books table
await db.execute(
  `CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY, 
      name TEXT, 
      author TEXT, 
      publisher TEXT, 
      filepath TEXT
  )`
);

export async function saveBook(book: BookData) {
  await db.execute(
    `INSERT INTO books (
        id, 
        name, 
        author, 
        publisher, 
        filepath) 
      VALUES ($1, $2, $3, $4, $5) 
      ON CONFLICT (id) DO NOTHING`,
    [book.id, book.title, book.author, book.publisher, book.filepath]
  );
}
