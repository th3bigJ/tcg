import type { CollectionConfig } from "payload";

import { isAdminUser, isPayloadAdminUser } from "../lib/access";

export const AccountTransactions: CollectionConfig = {
  slug: "account-transactions",
  admin: {
    useAsTitle: "description",
    group: "Storefront",
    description: "Customer purchase and sale transactions for P&L tracking.",
    defaultColumns: ["customer", "direction", "description", "productType", "quantity", "unitPrice", "transactionDate"],
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
      name: "customer",
      type: "relationship",
      relationTo: "customers",
      required: true,
      index: true,
      label: "Customer",
      admin: {
        description: "The customer this transaction belongs to.",
      },
    },
    {
      name: "direction",
      type: "select",
      required: true,
      label: "Direction",
      options: [
        { label: "Purchase", value: "purchase" },
        { label: "Sale", value: "sale" },
      ],
      admin: {
        description: "Whether this is a purchase (money out) or sale (money in).",
      },
    },
    {
      name: "productType",
      type: "relationship",
      relationTo: "product-types",
      required: true,
      label: "Product type",
      admin: {
        description: "The type of product (Single Card, Booster Pack, ETB, etc.).",
        appearance: "select",
        sortOptions: "name",
      },
    },
    {
      name: "description",
      type: "text",
      required: true,
      label: "Description",
      admin: {
        description: "Card name or product description.",
      },
    },
    {
      name: "masterCard",
      type: "relationship",
      relationTo: "master-card-list",
      required: false,
      label: "Card (optional)",
      admin: {
        description: "Link to a specific card in the catalog, if applicable.",
      },
    },
    {
      name: "quantity",
      type: "number",
      required: true,
      defaultValue: 1,
      min: 1,
      label: "Quantity",
      admin: {
        description: "Number of units.",
      },
    },
    {
      name: "unitPrice",
      type: "number",
      required: true,
      defaultValue: 0,
      min: 0,
      label: "Unit price (£)",
      admin: {
        description: "Price per unit in GBP. Total = unit price × quantity.",
      },
    },
    {
      name: "transactionDate",
      type: "date",
      required: true,
      label: "Date",
      admin: {
        description: "Date of the transaction.",
        date: {
          pickerAppearance: "dayOnly",
          displayFormat: "dd/MM/yyyy",
        },
      },
    },
    {
      name: "notes",
      type: "textarea",
      label: "Notes",
      admin: {
        description: "Optional notes about this transaction.",
      },
    },
  ],
};
