import type { CollectionConfig } from "payload";
import { allowRead, isAdmin } from "../lib/access";

export const Series: CollectionConfig = {
  slug: "series",
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
          label: "Series details",
          fields: [
            {
              name: "name",
              type: "text",
              required: true,
              unique: true,
              label: "Series name",
              admin: {
                description: "Unique series name from sets (e.g. Base, Sword & Shield).",
              },
            },
            {
              name: "slug",
              type: "text",
              required: true,
              unique: true,
              label: "Series slug",
              admin: {
                description: "URL-safe unique identifier for the series.",
              },
            },
            {
              name: "tcgdexSeriesId",
              type: "text",
              label: "TCGdex series id",
              admin: {
                description: "Optional TCGdex series id from set data (e.g. swsh, sv).",
              },
            },
            {
              name: "isActive",
              type: "checkbox",
              defaultValue: true,
              label: "Active",
              admin: {
                description: "When disabled, this series is hidden from new selections.",
              },
            },
          ],
        },
      ],
    },
  ],
};
