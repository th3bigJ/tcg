import { postgresAdapter } from "@payloadcms/db-postgres";
import { s3Storage } from "@payloadcms/storage-s3";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import path from "path";
import { fileURLToPath } from "url";

import { createPayloadLogger } from "./lib/payloadLogger";

import { Users } from "./collections/Users";

import { Brands } from "./collections/Brands";
import { ItemConditions } from "./collections/ItemConditions";
import { ProductCategories } from "./collections/ProductCategories";
import { ProductTypes } from "./collections/ProductTypes";
import { Series } from "./collections/Series";
import { Sets } from "./collections/Sets";
import { MasterCardList } from "./collections/MasterCardList";
import { CardMedia } from "./collections/CardMedia";
import { SetLogoMedia } from "./collections/SetLogoMedia";
import { SetSymbolMedia } from "./collections/SetSymbolMedia";
import { PokemonMedia } from "./collections/PokemonMedia";
import { Pokemon } from "./collections/Pokemon";

import { SiteSettings } from "./globals/SiteSettings";

const resolvedServerURL =
  process.env.SERVER_URL ||
  process.env.NEXT_PUBLIC_SERVER_URL ||
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");

if (process.env.NODE_ENV === "production" && !resolvedServerURL) {
  throw new Error("SERVER_URL (or NEXT_PUBLIC_SERVER_URL) must be set in production.");
}

const hasR2Config =
  Boolean(process.env.R2_BUCKET) &&
  Boolean(process.env.R2_ACCESS_KEY_ID) &&
  Boolean(process.env.R2_SECRET_ACCESS_KEY) &&
  Boolean(process.env.R2_ENDPOINT);

const hasPokemonR2Config =
  Boolean(process.env.R2_POKEMON_BUCKET) &&
  Boolean(process.env.R2_ACCESS_KEY_ID) &&
  Boolean(process.env.R2_SECRET_ACCESS_KEY) &&
  Boolean(process.env.R2_ENDPOINT);

export default buildConfig({
  logger: createPayloadLogger(),
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
    CardMedia,
    SetLogoMedia,
    SetSymbolMedia,
    PokemonMedia,
    Pokemon,
    Brands,
    Series,
    Sets,
    ProductTypes,
    ProductCategories,
    ItemConditions,
    MasterCardList,
  ],
  globals: [SiteSettings],
  editor: lexicalEditor(),
  plugins: [
    ...(hasR2Config
      ? [
          s3Storage({
            bucket: process.env.R2_BUCKET || "",
            collections: {
              "card-media": {
                prefix: "cards",
              },
              "set-logo-media": {
                prefix: "sets/logo",
              },
              "set-symbol-media": {
                prefix: "sets/symbol",
              },
            },
            config: {
              credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
              },
              endpoint: process.env.R2_ENDPOINT,
              forcePathStyle: true,
              region: process.env.R2_REGION || "auto",
            },
          }),
        ]
      : []),
    ...(hasPokemonR2Config
      ? [
          s3Storage({
            bucket: process.env.R2_POKEMON_BUCKET || "",
            collections: {
              "pokemon-media": {
                prefix: "",
              },
            },
            config: {
              credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
              },
              endpoint: process.env.R2_ENDPOINT,
              forcePathStyle: true,
              region: process.env.R2_REGION || "auto",
            },
          }),
        ]
      : []),
  ],
  secret: process.env.PAYLOAD_SECRET || "",
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || "",
    },
  }),
  serverURL: resolvedServerURL,
});

