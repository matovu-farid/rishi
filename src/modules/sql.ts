import { embed, EmbedParam, Metadata, saveVectors, Vector } from "@/generated";
import { Book, BookInsertable, db, PageDataInsertable } from "./kynsley";
import { sql } from "kysely";

await db.schema
  .createTable("chunk_data")
  .ifNotExists()
  .addColumn("id", "integer", (cb) => cb.primaryKey())
  .addColumn("bookId", "integer")
  .addColumn("pageNumber", "integer")
  .addColumn("data", "text")
  .addColumn("created_at", "timestamp", (col) =>
    col.defaultTo(sql`CURRENT_TIMESTAMP`)
  )
  .addColumn("updated_at", "timestamp", (col) =>
    col.defaultTo(sql`CURRENT_TIMESTAMP`)
  )
  .execute();

await db.schema
  .createTable("page_data")
  .ifNotExists()
  .addColumn("id", "integer", (col) => col.primaryKey())
  .addColumn("bookId", "integer")
  .addColumn("pageNumber", "integer")
  .addColumn("saved_data", "boolean")
  .addColumn("created_at", "timestamp", (col) =>
    col.defaultTo(sql`CURRENT_TIMESTAMP`)
  )
  .addColumn("updated_at", "timestamp", (col) =>
    col.defaultTo(sql`CURRENT_TIMESTAMP`)
  )
  // .addUniqueConstraint("pageNumber_bookId", ["pageNumber", "bookId"])
  // .addForeignKeyConstraint("page_bookId_fkey", ["bookId"], "books", ["id"])
  .execute();

await db.schema
  .createTable("books")
  .ifNotExists()
  .addColumn("id", "integer", (col) => col.primaryKey())
  .addColumn("kind", "text")
  .addColumn("cover", "blob")
  .addColumn("title", "text")
  .addColumn("author", "text")
  .addColumn("publisher", "text")
  .addColumn("filepath", "text")
  .addColumn("location", "text")
  .addColumn("cover_kind", "text")
  .addColumn("version", "integer")
  .addColumn("created_at", "timestamp", (col) =>
    col.defaultTo(sql`CURRENT_TIMESTAMP`)
  )
  .addColumn("updated_at", "timestamp", (col) =>
    col.defaultTo(sql`CURRENT_TIMESTAMP`)
  )
  // unique filepath
  .addUniqueConstraint("filepath", ["filepath"])
  .execute();

async function hasSavedData(pageNumber: number, bookId: number) {
  const result = await db
    .selectFrom("page_data")
    .select("saved_data")
    .where("pageNumber", "=", pageNumber)
    .where("bookId", "=", bookId)
    .executeTakeFirst();

  if (!result) return false;
  return result?.saved_data ?? false;
}

export async function addPage(
  pageNumber: number,
  bookId: number,
  pageId: number
) {
  try {
    const pageExists = await doesPageExist(pageId);
    if (pageExists) {
      return;
    }
    await db
      .insertInto("page_data")
      .values({ pageNumber, bookId, saved_data: true, id: pageId })
      // .onConflict((oc) => oc.constraint("pageNumber_bookId").doNothing())
      .execute();
  } catch (error) {
    console.error(`>>> Error in addPage for page ${pageNumber}:`, error);
    throw error;
  }
}

export async function doesPageExist(pageId: number) {
  const result = await db
    .selectFrom("page_data")
    .where("id", "=", pageId)
    .selectAll()
    .executeTakeFirst();
  return result ? true : false;
}

export async function savePageDataMany(pageData: PageDataInsertable[]) {
  if (pageData.length === 0) return;

  await db
    .insertInto("chunk_data")
    .values(pageData)
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        data: (eb) => eb.ref("excluded.data"),
      })
    )
    .execute();
}

export async function getAllPageDataByBookId(bookId: number) {
  const result = await db
    .selectFrom("chunk_data")
    .selectAll()
    .where("bookId", "=", bookId)
    .orderBy("pageNumber", "asc")
    .execute();

  return result;
}

export async function saveBook(book: BookInsertable): Promise<Book> {
  const result = await db
    .insertInto("books")
    .values({
      author: book.author || "",
      publisher: book.publisher || "",
      filepath: book.filepath,
      cover: book.cover,
      version: book.version,
      location: book.location,
      kind: book.kind,
      title: book.title || "",
      cover_kind: book.cover_kind || "",
    })
    .onConflict((oc) => oc.column("id").doNothing())
    .onConflict((oc) => oc.column("filepath").doNothing())
    .returningAll()
    .execute();

  return result[0];
}

export async function getBook(id: number) {
  const result = await db
    .selectFrom("books")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  // Convert cover string back to number array if it's a string
  if (result?.cover && typeof result.cover === "string") {
    result.cover = JSON.parse(result.cover);
  }
  return result;
}

export async function getBooks() {
  const result = await db.selectFrom("books").selectAll().execute();
  result.forEach((book) => {
    if (book.cover && typeof book.cover === "string") {
      book.cover = JSON.parse(book.cover);
    }
  });
  return result;
}

export async function deleteBook(id: number) {
  await db.deleteFrom("books").where("id", "=", id).execute();
}

export async function updateBookCover(id: number, cover: number[]) {
  await db.updateTable("books").set({ cover }).where("id", "=", id).execute();
}

export async function createPage(
  pageNumber: number,
  bookId: number,
  pageData: PageDataInsertable[]
) {
  try {
    const pageId = pageNumber * 1000000 + bookId * 10000;
    if (await hasSavedData(pageNumber, bookId)) {
      console.log(`>>> Page ${pageNumber} already has saved data, skipping`);
      return;
    }
    if (pageData.length === 0) {
      console.log(`>>> pageData is empty for page ${pageNumber}`);
      return;
    }

    const embedParams: EmbedParam[] = pageData.map((item) => {
      const metadata: Metadata = {
        id: item.id,
        pageNumber: pageNumber,
        bookId,
      };
      return {
        text: item.data,
        metadata,
      };
    });

    // Save page data first, then embed
    // This ensures data is in the database even if embedding fails
    await savePageDataMany(pageData);

    const embedResults = await embed({ embedparams: embedParams });

    const vectorObjects = embedResults.map((result) => {
      return {
        id: result.metadata.id,
        vector: result.embedding,
        text: result.text,
        metadata: result.metadata,
      };
    });
    const vectors: Vector[] = vectorObjects.map((vector) => ({
      id: vector.id,
      vector: vector.vector,
    }));

    await saveVectors({
      name: `${bookId}-vectordb`,
      dim: vectorObjects[0].vector.length,
      vectors,
    });

    await addPage(pageNumber, bookId, pageId);
  } catch (error) {
    console.error(`>>> Error in createPage for page ${pageNumber}:`, error);
    throw error;
  }
}
export async function updateBookLocation(bookId: number, location: string) {
  // await updateBook({ id: bookId, location: location }, store);
  await db
    .updateTable("books")
    .set({ location })
    .where("id", "=", bookId)
    .execute();
}
