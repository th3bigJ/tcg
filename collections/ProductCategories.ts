import type { CollectionConfig } from "payload";
import { allowRead, isAdmin } from "../lib/access";

export const ProductCategories: CollectionConfig = {
  slug: "product-categories",
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
          label: "Category details",
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
          ],
        },
      ],
    },
  ],
};

