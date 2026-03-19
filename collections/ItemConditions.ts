import type { CollectionConfig } from "payload";
import { allowRead, isAdmin } from "../lib/access";

export const ItemConditions: CollectionConfig = {
  slug: "item-conditions",
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
      label: "Condition name",
      admin: {
        description: "Examples: Near Mint, Lightly Played, Heavily Played.",
      },
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      label: "Condition slug",
      admin: {
        description: "Unique identifier used for lookups.",
      },
    },
    {
      name: "description",
      type: "textarea",
      label: "Description",
      admin: {
        description: "Optional description explaining how you grade this condition.",
      },
    },
    {
      name: "sortOrder",
      type: "number",
      label: "Display order",
      admin: {
        description: "Lower numbers appear first in admin lists.",
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      label: "Active",
      admin: {
        description: "When disabled, this condition will not be used for new inventory records.",
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

