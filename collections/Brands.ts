import type { CollectionConfig } from "payload";

export const Brands: CollectionConfig = {
  slug: "brands",
  admin: {
    useAsTitle: "name",
  },
  access: {
    admin: ({ req }) => Boolean(req.user),
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  timestamps: true,
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
      name: "logoUrl",
      type: "text",
      label: "Logo URL",
      admin: {
        description: "URL of the brand logo image.",
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
    {
      name: "notes",
      type: "textarea",
      label: "Admin notes",
      admin: {
        description: "Internal notes for your team.",
      },
    },
  ],
};

