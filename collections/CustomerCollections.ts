import type { CollectionConfig } from "payload";

import { isAdminUser, isPayloadAdminUser } from "../lib/access";

const PRINTING_OPTIONS = [
  { label: "Standard", value: "Standard" },
  { label: "Reverse Holo", value: "Reverse Holo" },
  { label: "Holo", value: "Holo" },
  { label: "First Edition", value: "First Edition" },
  { label: "Shadowless", value: "Shadowless" },
  { label: "Other", value: "other" },
] as const;

const LANGUAGE_OPTIONS = [
  { label: "English", value: "English" },
  { label: "Japanese", value: "Japanese" },
  { label: "Korean", value: "Korean" },
  { label: "Chinese", value: "Chinese" },
  { label: "German", value: "German" },
  { label: "French", value: "French" },
  { label: "Italian", value: "Italian" },
  { label: "Spanish", value: "Spanish" },
  { label: "Portuguese", value: "Portuguese" },
] as const;

const GRADING_COMPANY_OPTIONS = [
  { label: "None", value: "none" },
  { label: "PSA", value: "PSA" },
  { label: "BGS", value: "BGS" },
  { label: "CGC", value: "CGC" },
  { label: "SGC", value: "SGC" },
  { label: "ACE", value: "ACE" },
  { label: "Other", value: "Other" },
] as const;

export const CustomerCollections: CollectionConfig = {
  slug: "customer-collections",
  admin: {
    useAsTitle: "id",
    group: "Storefront",
    description: "Cards a customer owns (condition, quantity, printing).",
    defaultColumns: ["customer", "masterCard", "condition", "quantity", "addedAt"],
  },
  access: {
    admin: ({ req }) => isPayloadAdminUser(req),
    /**
     * Storefront creates/reads rows via Next.js Route Handlers + Local API (`overrideAccess: true`)
     * after resolving the Payload customer id from Supabase Auth.
     */
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
          label: "Card",
          fields: [
            {
              name: "customer",
              type: "relationship",
              relationTo: "customers",
              required: true,
              label: "Customer",
              admin: {
                description: "Owner of this collection entry.",
              },
            },
            {
              name: "masterCard",
              type: "relationship",
              relationTo: "master-card-list",
              required: true,
              label: "Card",
              admin: {
                description: "Catalog card this entry refers to.",
              },
            },
            {
              name: "condition",
              type: "relationship",
              relationTo: "item-conditions",
              label: "Condition",
              admin: {
                description: "Physical condition of this copy.",
              },
            },
            {
              name: "printing",
              type: "select",
              label: "Printing",
              defaultValue: "Standard",
              options: [...PRINTING_OPTIONS],
              admin: {
                description: "Variant / finish of the card.",
              },
            },
            {
              name: "language",
              type: "select",
              label: "Language",
              defaultValue: "English",
              options: [...LANGUAGE_OPTIONS],
              admin: {
                description: "Card language.",
              },
            },
            {
              name: "quantity",
              type: "number",
              label: "Quantity",
              defaultValue: 1,
              min: 1,
              admin: {
                description: "How many copies in this condition / printing.",
              },
            },
          ],
        },
        {
          label: "Grading & notes",
          fields: [
            {
              name: "gradingCompany",
              type: "select",
              label: "Grading company",
              defaultValue: "none",
              options: [...GRADING_COMPANY_OPTIONS],
              admin: {
                description: "Third-party grader, if any.",
              },
            },
            {
              name: "gradeValue",
              type: "text",
              label: "Grade",
              admin: {
                description: "e.g. 9, 9.5, 10",
              },
            },
            {
              name: "notes",
              type: "textarea",
              label: "Notes",
              admin: {
                description: "Optional notes about this copy.",
              },
            },
            {
              name: "addedAt",
              type: "date",
              label: "Added",
              admin: {
                description: "When this entry was created.",
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
