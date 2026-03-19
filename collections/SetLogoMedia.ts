import type { CollectionConfig } from "payload";
import path from "path";
import { allowRead, isAdmin } from "../lib/access";

export const SetLogoMedia: CollectionConfig = {
  slug: "set-logo-media",
  admin: {
    useAsTitle: "alt",
  },
  access: {
    // Logos are intended to be publicly readable so the frontend can render them.
    read: allowRead,
    admin: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  timestamps: true,
  fields: [
    {
      name: "alt",
      type: "text",
      required: true,
      label: "Alt text",
      admin: {
        description: "Used as accessible text for set logo images.",
      },
    },
  ],
  upload: {
    // Required folder layout for set assets
    staticDir: path.resolve(process.cwd(), "public/media/sets/logo"),
  },
};

