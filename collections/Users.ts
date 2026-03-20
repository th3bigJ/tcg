import type { CollectionConfig } from "payload";
import { isAdmin } from "../lib/access";

export const Users: CollectionConfig = {
  slug: "users",
  admin: {
    useAsTitle: "name",
  },
  auth: true,
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Profile",
          fields: [
            {
              name: "name",
              type: "text",
              required: true,
            },
            // `email` is added by default when `auth: true` is enabled.
          ],
        },
      ],
    },
  ],
  access: {
    admin: isAdmin,
    create: isAdmin,
    delete: isAdmin,
    read: isAdmin,
    update: isAdmin,
  },
};

