import type { CollectionConfig } from "payload";

import { isAdminUser, isPayloadAdminUser } from "../lib/access";

const TARGET_PRINTING_OPTIONS = [
  { label: "Normal", value: "normal" },
  { label: "Holofoil", value: "holofoil" },
  { label: "Reverse Holo", value: "reverseHolofoil" },
  { label: "Staff Stamp", value: "staffStamp" },
  { label: "Standard", value: "Standard" },
  { label: "Holo", value: "Holo" },
  { label: "First Edition", value: "First Edition" },
  { label: "Shadowless", value: "Shadowless" },
  { label: "Other", value: "other" },
] as const;

const PRIORITY_OPTIONS = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
] as const;

export const CustomerWishlists: CollectionConfig = {
  slug: "customer-wishlists",
  admin: {
    useAsTitle: "id",
    group: "Storefront",
    description: "Cards a customer wants to acquire.",
    defaultColumns: ["customer", "masterCard", "priority", "maxPrice", "addedAt"],
  },
  access: {
    admin: ({ req }) => isPayloadAdminUser(req),
    create: isAdminUser,
    read: isAdminUser,
    update: isAdminUser,
    delete: isAdminUser,
  },
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        const next = { ...data };
        if (operation === "create" && next.addedAt === undefined) {
          next.addedAt = new Date().toISOString();
        }
        return next;
      },
    ],
  },
  timestamps: true,
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Wish",
          fields: [
            {
              name: "customer",
              type: "relationship",
              relationTo: "customers",
              required: true,
              label: "Customer",
              admin: {
                description: "Who wants this card.",
              },
            },
            {
              name: "masterCard",
              type: "relationship",
              relationTo: "master-card-list",
              required: true,
              label: "Card",
              admin: {
                description: "Target catalog card.",
              },
            },
            {
              name: "targetCondition",
              type: "relationship",
              relationTo: "item-conditions",
              label: "Target condition",
              admin: {
                description: "Desired condition when purchasing.",
              },
            },
            {
              name: "targetPrinting",
              type: "select",
              label: "Target printing",
              options: [...TARGET_PRINTING_OPTIONS],
              admin: {
                description: "Desired printing / variant.",
              },
            },
            {
              name: "maxPrice",
              type: "number",
              label: "Max price (GBP)",
              admin: {
                description: "Optional — alert if market price drops below this (GBP).",
              },
            },
            {
              name: "priority",
              type: "select",
              label: "Priority",
              defaultValue: "medium",
              options: [...PRIORITY_OPTIONS],
              admin: {
                description: "How urgently the customer wants this card.",
              },
            },
            {
              name: "notes",
              type: "textarea",
              label: "Notes",
              admin: {
                description: "Optional wishlist notes.",
              },
            },
            {
              name: "addedAt",
              type: "date",
              label: "Added",
              admin: {
                description: "When this wish was saved.",
                date: {
                  pickerAppearance: "dayAndTime",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};
