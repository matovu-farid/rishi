import { BookData, embed, saveVectors } from "@/generated";
import { db } from "./kynsley";
import { sql } from "kysely";

// const db = await Database.load("sqlite:rishi.db");

// create table for page data

// await db.execute(
//   `CREATE TABLE IF NOT EXISTS page_data (
//         id TEXT PRIMARY KEY,
//         bookId TEXT,
//         pageNumber INT,
//         data TEXT,
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     )`
// );

await db.schema
  .createTable("page_data")
  .ifNotExists()
  .addColumn("id", "text", (col) => col.primaryKey())
  .addColumn("bookId", "text")
  .addColumn("pageNumber", "integer")
  .addColumn("data", "text")
  .addColumn("created_at", "timestamp", (col) =>
    col.defaultTo(sql`CURRENT_TIMESTAMP`)
  )
  .addColumn("updated_at", "timestamp", (col) =>
    col.defaultTo(sql`CURRENT_TIMESTAMP`)
  )
  .execute();
//.addUniqueConstraint("pageNumber_bookId", ["pageNumber", "bookId"]).execute();

// await db.execute(
//   `CREATE TABLE IF NOT EXISTS page(
//         id TEXT PRIMARY KEY,
//         bookId TEXT,
//         pageNumber INT,
//         saved_data BOOLEAN DEFAULT FALSE,
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         UNIQUE(pageNumber, bookId)
//         FOREIGN KEY (bookId) REFERENCES books(id)
//     )`
// );

await db.schema
  .createTable("page")
  .ifNotExists()
  .addColumn("id", "text", (col) => col.primaryKey())
  .addColumn("bookId", "text")
  .addColumn("pageNumber", "integer")
  .addColumn("saved_data", "boolean", (col) => col.defaultTo(false))
  .addColumn("created_at", "timestamp", (col) =>
    col.defaultTo(sql`CURRENT_TIMESTAMP`)
  )
  .addColumn("updated_at", "timestamp", (col) =>
    col.defaultTo(sql`CURRENT_TIMESTAMP`)
  )
  .addUniqueConstraint("pageNumber_bookId", ["pageNumber", "bookId"])
  .addForeignKeyConstraint("page_bookId_fkey", ["bookId"], "books", ["id"])
  .execute();

// create books table
// await db.execute(
//   `CREATE TABLE IF NOT EXISTS books (
//       id TEXT PRIMARY KEY,
//       name TEXT,
//       author TEXT,
//       publisher TEXT,
//       filepath TEXT,
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//       UNIQUE(filepath)
//   )`
// );

await db.schema
  .createTable("books")
  .ifNotExists()
  .addColumn("id", "text", (col) => col.primaryKey())
  .addColumn("name", "text")
  .addColumn("author", "text")
  .addColumn("publisher", "text")
  .addColumn("filepath", "text")
  .addColumn("created_at", "timestamp", (col) =>
    col.defaultTo(sql`CURRENT_TIMESTAMP`)
  )
  .addColumn("updated_at", "timestamp", (col) =>
    col.defaultTo(sql`CURRENT_TIMESTAMP`)
  )
  .addUniqueConstraint("filepath", ["filepath"])
  .execute();

// const pageSchema = z.object({
//   id: z.string(),
//   pageNumber: z.number(),
//   bookId: z.string(),
//   saved_data: z.boolean(),
//   created_at: z.string(),
//   updated_at: z.string(),
// });

async function hasSavedData(pageNumber: number, bookId: string) {
  // const result = await db.select(
  //   "SELECT * FROM page_data WHERE pageNumber = $1 AND bookId = $2",
  //   [pageNumber, bookId]
  // );
  const result = await db
    .selectFrom("page")
    .select("saved_data")
    .where("pageNumber", "=", pageNumber)
    .where("bookId", "=", bookId)
    .executeTakeFirst();

  if (!result) return false;
  return result?.saved_data ?? false;
}

export async function setSavedData(pageNumber: number, bookId: string) {
  // await db.execute(
  //   "UPDATE page_data SET saved_data = TRUE WHERE pageNumber = $1 AND bookId = $2",
  //   [pageNumber, bookId]
  // );
  await db
    .updateTable("page")
    .set({ saved_data: true })
    .where("pageNumber", "=", pageNumber)
    .where("bookId", "=", bookId)
    .execute();
}

export type PageData = {
  id: string;
  bookId: string;
  pageNumber: number;
  data: string;
};

export async function savePageDataMany(pageData: PageData[]) {
  if (pageData.length === 0) return;

  // Build placeholders like:
  // ($1,$2,$3,$4),($5,$6,$7,$8), ...
  // const placeholders: string[] = [];
  // const values: unknown[] = [];

  // pageData.forEach(({ id, bookId, pageNumber, data }, rowIndex) => {
  //   const base = rowIndex * 4;
  //   placeholders.push(
  //     `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`
  //   );

  //   values.push(id, bookId, pageNumber, data);
  // });

  // const sql = `
  //   INSERT INTO page_data (
  //     id,
  //     bookId,
  //     pageNumber,
  //     data
  //   ) VALUES ${placeholders.join(", ")}
  //   ON CONFLICT (id) DO NOTHING
  // `;

  // await db.execute(sql, values);

  await db.insertInto("page_data").values(pageData).execute();
}

export async function getAllPageDataByBookId(bookId: string) {
  // const result = await db.select(
  //   "SELECT * FROM page_data WHERE bookId = $1 ORDER BY pageNumber ASC",
  //   [bookId]
  // );
  const result = await db
    .selectFrom("page_data")
    .selectAll()
    .where("bookId", "=", bookId)
    .orderBy("pageNumber", "asc")
    .execute();

  return result;
}

export async function saveBook(book: BookData) {
  // await db.execute(
  //   `INSERT INTO books (
  //       id,
  //       name,
  //       author,
  //       publisher,
  //       filepath)
  //     VALUES ($1, $2, $3, $4, $5)
  //     ON CONFLICT (id) DO NOTHING`,
  //   [book.id, book.title, book.author, book.publisher, book.filepath]
  // );

  await db
    .insertInto("books")
    .values({
      id: book.id,
      name: book.title || "",
      author: book.author || "",
      publisher: book.publisher || "",
      filepath: book.filepath,
    })
    .execute();
  return book.id;
}

export async function createPage(
  pageNumber: number,
  bookId: string,
  pageData: PageData[]
) {
  if (await hasSavedData(pageNumber, bookId)) {
    return;
  }

  const embedParams = pageData.map((item) => {
    return {
      text: item.data,
      metadata: {
        pageNumber: pageNumber.toString(),
        bookId,
      },
    };
  });

  const [embedResults, _] = await Promise.all([
    embed({ embed_params: embedParams }),
    savePageDataMany(pageData),
  ]);

  const vectors = embedResults.map((result) => result.embedding);
  await saveVectors({
    name: bookId,
    dim: vectors[0].length,
    vectors,
  });
  await setSavedData(pageNumber, bookId);
}
