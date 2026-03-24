import type { CollectionConfig } from "payload";

import { isAdminUser, isPayloadAdminUser } from "../lib/access";

export const CatalogCardPricing: CollectionConfig = {
  slug: "catalog-card-pricing",
  admin: {
    useAsTitle: "externalId",
    group: "Storefront",
    description:
      "Cached market snapshots: TCGdex raw in externalPricing; Scrydex scrape in externalPrice as { variant: { raw, psa10 } } (GBP). Populated by refresh jobs.",
    defaultColumns: ["externalId", "tcgdex_id", "setCode", "masterCard", "updatedAt"],
  },
  access: {
    admin: ({ req }) => isPayloadAdminUser(req),
    create: isAdminUser,
    read: isAdminUser,
    update: isAdminUser,
    delete: isAdminUser,
  },
  timestamps: true,
  fields: [
    {
      name: "masterCard",
      type: "relationship",
      relationTo: "master-card-list",
      required: true,
      label: "Master card",
      admin: {
        description: "Catalog row this price snapshot belongs to.",
      },
    },
    {
      name: "externalId",
      type: "text",
      required: true,
      unique: true,
      label: "TCGdex external ID",
      admin: {
        description: 'Matches Master Card List "External ID" (e.g. me2pt5-271).',
      },
    },
    {
      name: "tcgdex_id",
      type: "text",
      label: "TCGdex ID",
      admin: {
        description:
          "Canonical TCGdex card id on this snapshot (e.g. base1-55), aligned with Master Card List `tcgdex_id`.",
      },
    },
    {
      name: "setCode",
      type: "text",
      required: true,
      label: "Set code",
      admin: {
        description: "Denormalized set `code` (e.g. me2pt5) for scoped refresh queries.",
      },
    },
    {
      name: "externalPricing",
      type: "json",
      label: "External pricing (raw)",
      admin: {
        description:
          "Raw TCGdex-style pricing payload from the API before column extraction (TCGPlayer/Cardmarket blocks).",
      },
    },
    {
      name: "externalPrice",
      type: "json",
      label: "External scrape (GBP)",
      admin: {
        description:
          "Scrape snapshot (GBP): `{ holofoil: { raw, psa10 }, normal: { raw, psa10 } }` — `raw` ≈ NM/list, `psa10` graded. Legacy flat `{ Holofoil: 12.3 }` still read by the storefront.",
      },
    },
  ],
};
