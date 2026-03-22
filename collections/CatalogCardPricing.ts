import type { CollectionConfig } from "payload";

import { isAdminUser, isPayloadAdminUser } from "../lib/access";

export const CatalogCardPricing: CollectionConfig = {
  slug: "catalog-card-pricing",
  admin: {
    useAsTitle: "externalId",
    group: "Storefront",
    description:
      "Cached TCGdex market data in GBP per catalog card. Populated by refresh jobs; storefront reads via Local API.",
    defaultColumns: ["externalId", "setCode", "masterCard", "updatedAt"],
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
      name: "setCode",
      type: "text",
      required: true,
      label: "Set code",
      admin: {
        description: "Denormalized set `code` (e.g. me2pt5) for scoped refresh queries.",
      },
    },
    {
      name: "pricingGbp",
      type: "json",
      required: true,
      label: "Pricing (GBP)",
      admin: {
        description:
          "Object: { tcgplayer, cardmarket, currency: \"GBP\" } — same shape as the storefront card-prices API after conversion.",
      },
    },
  ],
};
