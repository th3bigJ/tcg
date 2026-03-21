import type { CollectionConfig } from "payload";
import path from "path";
import { allowRead, isAdmin } from "../lib/access";

export const PokemonMedia: CollectionConfig = {
  slug: "pokemon-media",
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
                description: "Used as accessible text for Pokemon images.",
              },
            },
            {
              name: "dexId",
              type: "number",
              required: true,
              label: "National Dex ID",
              admin: {
                description: "National Dex number used to match Pokemon CSV rows to image files.",
              },
            },
          ],
        },
      ],
    },
  ],
  upload: {
    staticDir: path.resolve(process.cwd(), "public/media/images"),
  },
};
