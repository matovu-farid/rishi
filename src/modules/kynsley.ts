import { appDataDir } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";
import { ColumnType, Kysely } from "kysely";
import { TauriSqliteDialect } from "kysely-dialect-tauri";

interface DB {
  page: {
    id: string;
    pageNumber: number;
    bookId: string;
    saved_data: boolean;
    created_at: ColumnType<Date, string | undefined, never>;
    updated_at: ColumnType<Date, string | undefined, never>;
  };
  page_data: {
    id: string;
    pageNumber: number;
    bookId: string;
    data: string;
    created_at: ColumnType<Date, string | undefined, never>;
    updated_at: ColumnType<Date, string | undefined, never>;
  };
  books: {
    id: string;
    name: string;
    author: string;
    publisher: string;
    filepath: string;
    created_at: ColumnType<Date, string | undefined, never>;
    updated_at: ColumnType<Date, string | undefined, never>;
  };
}

export const db = new Kysely<DB>({
  dialect: new TauriSqliteDialect({
    database: async (prefix) =>
      Database.load(`${prefix}${await appDataDir()}rishi.db`),
  }),
});



