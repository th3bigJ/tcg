import type { CollectionConfig } from "payload";
import path from "path";
import { allowRead, isAdmin } from "../lib/access";

export const CardMedia: CollectionConfig = {
  slug: "card-media",
  admin: {
    useAsTitle: "alt",
    group: "Images",
  },
  access: {
    read: allowRead,
    admin: isAdmin,
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
          label: "Media details",
          fields: [
            {
              name: "alt",
              type: "text",
              required: true,
              label: "Alt text",
              admin: {
                description: "Used as accessible text for card images.",
              },
            },
            {
              name: "quality",
              type: "select",
              label: "Image quality",
              required: true,
              options: [
                { label: "Low", value: "low" },
                { label: "High", value: "high" },
              ],
              admin: {
                description: "Whether this asset is the low-res or high-res card image.",
              },
            },
            {
              name: "setCode",
              type: "text",
              label: "Set code",
              admin: {
                description: "TCGdex set code segment used in file paths (e.g. base1, swsh4).",
              },
            },
            {
              name: "cardLocalId",
              type: "text",
              label: "Card local ID",
              admin: {
                description: "Set-local card index (often zero-padded, e.g. 001).",
              },
            },
          ],
        },
      ],
    },
  ],
  upload: {
    staticDir: path.resolve(process.cwd(), "public/media/cards"),
  },
};
