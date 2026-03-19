import type { CollectionConfig } from "payload";
import { allowRead, isAdmin } from "../lib/access";

export const ProductTypes: CollectionConfig = {
  slug: "product-types",
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
      name: "name",
      type: "text",
      required: true,
      unique: true,
      label: "Product type name",
      admin: {
        description: "Examples: Single Card, Sealed Booster Pack, Sealed Box.",
      },
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      label: "Product type slug",
      admin: {
        description: "Unique identifier used for lookups.",
      },
    },
    {
      name: "description",
      type: "textarea",
      label: "Description",
      admin: {
        description: "Optional description for admins and future UI.",
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      label: "Active",
      admin: {
        description: "When disabled, this type will not be selectable for new items.",
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

