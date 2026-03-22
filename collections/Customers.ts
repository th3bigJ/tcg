import type { CollectionConfig } from "payload";

import { isAdminUser, isPayloadAdminUser } from "../lib/access";

/**
 * Storefront customer profile — identity and sessions live in Supabase Auth.
 * This row is keyed by `supabaseUserId` and is created/updated from the Next.js app
 * using the Local API with `overrideAccess` after verifying the Supabase user.
 */
export const Customers: CollectionConfig = {
  slug: "customers",
  admin: {
    useAsTitle: "email",
    group: "Storefront",
    description:
      "Customer profiles linked to Supabase Auth (supabaseUserId). Not a Payload auth collection.",
  },
  access: {
    admin: ({ req }) => isPayloadAdminUser(req),
    create: isAdminUser,
    read: isAdminUser,
    update: isAdminUser,
    delete: isAdminUser,
  },
  timestamps: true,
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Profile",
          fields: [
            {
              name: "supabaseUserId",
              type: "text",
              required: true,
              unique: true,
              label: "Supabase user ID",
              admin: {
                description: "Matches `auth.users.id` from Supabase (UUID).",
                readOnly: true,
              },
            },
            {
              name: "email",
              type: "email",
              required: true,
              label: "Email",
              admin: {
                description: "Copied from Supabase Auth for admin search and display.",
              },
            },
            {
              name: "firstName",
              type: "text",
              required: true,
              label: "First name",
              admin: {
                description: "Customer’s given name (from signup metadata or profile).",
              },
            },
            {
              name: "lastName",
              type: "text",
              required: true,
              label: "Last name",
              admin: {
                description: "Customer’s family name.",
              },
            },
          ],
        },
      ],
    },
  ],
};
