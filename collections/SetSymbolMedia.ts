import type { CollectionConfig } from "payload";
import path from "path";
import { allowRead, isAdmin } from "../lib/access";

export const SetSymbolMedia: CollectionConfig = {
  slug: "set-symbol-media",
  admin: {
    useAsTitle: "alt",
    group: "Images",
  },
  access: {
    // Symbols are intended to be publicly readable so the frontend can render them.
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
                description: "Used as accessible text for set symbol images.",
              },
            },
          ],
        },
      ],
    },
  ],
  upload: {
    // Required folder layout for set assets
    staticDir: path.resolve(process.cwd(), "public/media/sets/symbol"),
  },
};

