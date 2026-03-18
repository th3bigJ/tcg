import type { CollectionConfig } from "payload";
import path from "path";

export const SetSymbolMedia: CollectionConfig = {
  slug: "set-symbol-media",
  admin: {
    useAsTitle: "alt",
  },
  access: {
    // Symbols are intended to be publicly readable so the frontend can render them.
    read: () => true,
    admin: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  timestamps: true,
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
  upload: {
    // Required folder layout for set assets
    staticDir: path.resolve(process.cwd(), "public/media/sets/symbol"),
  },
};

