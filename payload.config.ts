import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import path from "path";
import { fileURLToPath } from "url";

import { Users } from "./collections/Users";

import { Brands } from "./collections/Brands";
import { ItemConditions } from "./collections/ItemConditions";
import { ProductCategories } from "./collections/ProductCategories";
import { ProductTypes } from "./collections/ProductTypes";
import { Sets } from "./collections/Sets";
import { MasterCardList } from "./collections/MasterCardList";
import { SetLogoMedia } from "./collections/SetLogoMedia";
import { SetSymbolMedia } from "./collections/SetSymbolMedia";

import { SiteSettings } from "./globals/SiteSettings";

export default buildConfig({
  // When running seed scripts with `tsx`, Payload's type auto-generation
  // triggers its CLI bin which loads env files via `@next/env` in a way that
  // can crash in this execution context.
  typescript: {
    autoGenerate: false,
  },
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(path.dirname(fileURLToPath(import.meta.url))),
    },
  },
  collections: [
    Users,
    SetLogoMedia,
    SetSymbolMedia,
    Brands,
    Sets,
    ProductTypes,
    ProductCategories,
    ItemConditions,
    MasterCardList,
  ],
  globals: [SiteSettings],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || "",
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || "",
    },
  }),
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000",
});

