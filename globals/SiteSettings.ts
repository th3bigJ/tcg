import type { GlobalConfig } from "payload";

export const SiteSettings: GlobalConfig = {
  slug: "site-settings",
  access: {
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: "storeName",
      type: "text",
      defaultValue: "TCG",
      label: "Store name",
      admin: {
        description: "Name displayed in the site header.",
      },
    },
    {
      name: "storeTagline",
      type: "text",
      label: "Store tagline",
      admin: {
        description: "Short description shown near the store name.",
      },
    },
    {
      name: "logoUrl",
      type: "text",
      label: "Store logo URL",
      admin: {
        description: "URL of the logo displayed on the website.",
      },
    },
    {
      name: "contactEmail",
      type: "email",
      label: "Contact email",
      admin: {
        description: "Email address used for store contact.",
      },
    },
    {
      name: "contactPhone",
      type: "text",
      label: "Contact phone",
      admin: {
        description: "Phone number displayed to customers (optional).",
      },
    },
    {
      name: "businessName",
      type: "text",
      label: "Business name",
      admin: {
        description: "Legal or trading name for the business.",
      },
    },
    {
      name: "businessAddress",
      type: "group",
      label: "Business address",
      admin: {
        description: "Address used for returns and legal information.",
      },
      fields: [
        {
          name: "addressLine1",
          type: "text",
          required: true,
          label: "Address line 1",
          admin: {
            description: "Street address (required).",
          },
        },
        {
          name: "addressLine2",
          type: "text",
          label: "Address line 2",
          admin: {
            description: "Optional second address line.",
          },
        },
        {
          name: "city",
          type: "text",
          required: true,
          label: "City",
          admin: {
            description: "City / town (required).",
          },
        },
        {
          name: "county",
          type: "text",
          label: "County",
          admin: {
            description: "County or region (optional).",
          },
        },
        {
          name: "postcode",
          type: "text",
          required: true,
          label: "Postcode",
          admin: {
            description: "Postal code (required).",
          },
        },
        {
          name: "country",
          type: "text",
          defaultValue: "United Kingdom",
          label: "Country",
          admin: {
            description: "Country name (defaults to United Kingdom).",
          },
        },
      ],
    },
    {
      name: "currency",
      type: "text",
      defaultValue: "GBP",
      label: "Currency",
      admin: {
        description: "Default currency used for prices and checkout.",
      },
    },
    {
      name: "socialLinks",
      type: "array",
      label: "Social links",
      admin: {
        description: "Add links to your social profiles.",
      },
      fields: [
        {
          name: "platform",
          type: "select",
          options: [
            "instagram",
            "facebook",
            "twitter",
            "tiktok",
            "youtube",
            "other",
          ],
          label: "Platform",
          admin: {
            description: "The social platform this link belongs to.",
          },
        },
        {
          name: "url",
          type: "text",
          label: "URL",
          admin: {
            description: "Full URL to your profile/page.",
          },
        },
      ],
    },
    {
      name: "freeShippingThreshold",
      type: "number",
      label: "Free shipping threshold",
      admin: {
        description: "Order value (in GBP) above which shipping is free.",
      },
    },
    {
      name: "defaultShippingPrice",
      type: "number",
      label: "Default shipping price",
      admin: {
        description: "Default shipping cost (in GBP).",
      },
    },
    {
      name: "returnsPolicySummary",
      type: "textarea",
      label: "Returns policy summary",
      admin: {
        description: "Short summary shown on the website.",
      },
    },
    {
      name: "announcementBarText",
      type: "text",
      label: "Announcement bar text",
      admin: {
        description: "Text shown in the announcement bar (optional).",
      },
    },
    {
      name: "homepageTitle",
      type: "text",
      label: "Homepage title",
      admin: {
        description: "Title displayed on the homepage.",
      },
    },
    {
      name: "homepageIntro",
      type: "richText",
      label: "Homepage introduction",
      admin: {
        description: "Intro content shown on the homepage (rich text).",
      },
    },
    {
      name: "notes",
      type: "textarea",
      label: "Admin notes",
      admin: {
        description: "Internal notes for your team.",
      },
    },
  ],
};

