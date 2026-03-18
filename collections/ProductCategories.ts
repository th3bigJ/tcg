import type { CollectionConfig } from "payload";

export const ProductCategories: CollectionConfig = {
  slug: "product-categories",
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
      label: "Category name",
      admin: {
        description: "Examples: Scarlet & Violet, Sword & Shield, Vintage.",
      },
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      label: "Category slug",
      admin: {
        description: "Unique identifier used for lookups.",
      },
    },
    {
      name: "parentCategory",
      type: "relationship",
      relationTo: "product-categories",
      label: "Parent category",
      admin: {
        description: "Optional self-referential parent for category trees.",
      },
    },
    {
      name: "description",
      type: "textarea",
      label: "Description",
      admin: {
        description: "Optional description for the category.",
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      label: "Active",
      admin: {
        description: "When disabled, this category will not be used for new items.",
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

