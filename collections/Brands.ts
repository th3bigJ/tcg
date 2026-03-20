import type { CollectionConfig } from "payload";
import { allowRead, isAdmin } from "../lib/access";

export const Brands: CollectionConfig = {
  slug: "brands",
  admin: {
    useAsTitle: "name",
  },
  access: {
    admin: isAdmin,
    read: allowRead,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  timestamps: true,
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Brand details",
          fields: [
            {
              name: "name",
              type: "text",
              required: true,
              unique: true,
              label: "Brand name",
              admin: {
                description: "The display name for this Pokémon brand (e.g. Pokémon TCG).",
              },
            },
            {
              name: "slug",
              type: "text",
              required: true,
              unique: true,
              label: "Brand slug",
              admin: {
                description: "A unique URL-friendly identifier for the brand.",
              },
            },
            {
              name: "description",
              type: "textarea",
              label: "Description",
              admin: {
                description: "Optional notes about this brand.",
              },
            },
            {
              name: "isActive",
              type: "checkbox",
              defaultValue: true,
              label: "Active",
              admin: {
                description: "When disabled, this brand will not be used for new products.",
              },
            },
          ],
        },
        {
          label: "Images",
          fields: [
            {
              name: "logoUrl",
              type: "text",
              label: "Logo URL",
              admin: {
                description: "URL of the brand logo image.",
              },
            },
          ],
        },
        {
          label: "Linked records",
          fields: [
            // Virtual join: show Sets that reference this Brand (via Sets.brand)
            {
              name: "linkedSets",
              type: "join",
              label: "Sets using this brand",
              collection: "sets",
              on: "brand",
              admin: {
                description: "Sets that use this brand (linked via each Set’s Brand field).",
                defaultColumns: ["name", "code", "releaseDate"],
              },
            },
            // Virtual join: show Master Card List entries that reference this Brand (via MasterCardList.brand)
            {
              name: "linkedMasterCards",
              type: "join",
              label: "Master cards using this brand",
              collection: "master-card-list",
              on: "brand",
              admin: {
                description: "Master card list entries that use this brand (linked via each card’s Brand field).",
                defaultColumns: ["fullDisplayName", "set", "rarity", "cardNumber"],
              },
            },
          ],
        },
      ],
    },
  ],
};

