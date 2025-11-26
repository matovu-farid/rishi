import { appDataDir } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";
import { ColumnType, Generated, Insertable, Kysely, Selectable } from "kysely";
import { TauriSqliteDialect } from "kysely-dialect-tauri";

interface DB {
  page: {
    id: Generated<number>;
    pageNumber: number;
    bookId: number;
    saved_data: boolean; // default false
    created_at: ColumnType<Date, string | undefined, never>;
    updated_at: ColumnType<Date, string | undefined, never>;
  };
  page_data: {
    id: number;
    pageNumber: number;
    bookId: number;
    data: string;
    created_at: ColumnType<Date, string | undefined, never>;
    updated_at: ColumnType<Date, string | undefined, never>;
  };

  books: {
    id: Generated<number>;
    kind: string;
    cover: number[];
    title: string;
    author: string;
    publisher: string;
    filepath: string;
    location: string;
    cover_kind: string;
    version: number;
    created_at: ColumnType<Date, string | undefined, never>;
    updated_at: ColumnType<Date, string | undefined, never>;
  };
}

export const db = new Kysely<DB>({
  dialect: new TauriSqliteDialect({
    database: async (prefix) => {
      const path = `${prefix}${await appDataDir()}/rishi.db`;
      console.log(`>>> db path`, path);
      return Database.load(path);
    },
  }),
});

export type PageData = DB["page_data"];
export type PageDataInsertable = Insertable<PageData>;
export type Page = DB["page"];
export type Book = Selectable<DB["books"]>;
export type BookInsertable = Insertable<DB["books"]>;
