import { embed, EmbedParam, Metadata, saveVectors } from "@/generated";
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
  .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
  .addColumn("bookId", "integer")
  .addColumn("pageNumber", "integer")
  .addColumn("saved_data", "boolean", (col) => col.defaultTo(false))
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
  // first check is page exists
  const pageExists = await doesPageExist(pageNumber, bookId);
  if (!pageExists) return false;
  const result = await db
    .selectFrom("page_data")
    .select("saved_data")
    .where("pageNumber", "=", pageNumber)
    .where("bookId", "=", bookId)
    .executeTakeFirst();

  if (!result) return false;
  return result?.saved_data ?? false;
}

export async function addPage(pageNumber: number, bookId: number) {
  try {
    console.log(`>>> Adding page`);
    const pageExists = await doesPageExist(pageNumber, bookId);
    if (pageExists) {
      return;
    }
    console.log(`>>> Inserting page data`);
    await db
      .insertInto("page_data")
      .values({ pageNumber, bookId, saved_data: false })
      // .onConflict((oc) => oc.constraint("pageNumber_bookId").doNothing())
      .execute();
  } catch (error) {
    console.log(`>>> Errror inserting page data`);
    console.error(`>>> Error in addPage for page ${pageNumber}:`, error);
    throw error;
  }
}

export async function doesPageExist(pageNumber: number, bookId: number) {
  const result = await db
    .selectFrom("page_data")
    .where("pageNumber", "=", pageNumber)
    .where("bookId", "=", bookId)
    .selectAll()
    .executeTakeFirst();
  return result ? true : false;
}

export async function setSavedData(pageNumber: number, bookId: number) {
  await db
    .updateTable("page_data")
    .set({ saved_data: true })
    .where("pageNumber", "=", pageNumber)
    .where("bookId", "=", bookId)
    .execute();
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

    await Promise.all([
      saveVectorData(embedParams, bookId),
      savePageDataMany(pageData),
      addPage(pageNumber, bookId),
    ]);

    await setSavedData(pageNumber, bookId);

    console.log(`>>> Successfully saved page ${pageNumber}`);
  } catch (error) {
    console.error(`>>> Error in createPage for page ${pageNumber}:`, error);
    throw error;
  }
}
export async function saveVectorData(
  embedParams: EmbedParam[],
  bookId: number
) {
  const embedResults = await embed({ embedparams: embedParams });
  const vectors = embedResults
    .map((result) => ({
      id: result.metadata.id,
      vector: result.embedding,
      text: result.text,
      metadata: result.metadata,
    }))
    .map((vector) => ({
      id: vector.id,
      vector: vector.vector,
    }));
  await saveVectors({
    name: `${bookId}-vectordb`,
    dim: vectors[0].vector.length,
    vectors,
  });
}
export async function updateBookLocation(bookId: number, location: string) {
  // await updateBook({ id: bookId, location: location }, store);
  await db
    .updateTable("books")
    .set({ location })
    .where("id", "=", bookId)
    .execute();
}
