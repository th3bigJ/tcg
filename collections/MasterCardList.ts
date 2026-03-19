import type { CollectionConfig } from "payload";

export const MasterCardList: CollectionConfig = {
  slug: "master-card-list",
  admin: {
    useAsTitle: "fullDisplayName",
    listSearchableFields: ["cardName", "cardNumber", "fullDisplayName"],
    defaultColumns: ["fullDisplayName", "set", "rarity", "cardNumber"],
  },
  access: {
    admin: ({ req }) => Boolean(req.user),
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  timestamps: true,
  fields: [
    {
      name: "brand",
      type: "relationship",
      relationTo: "brands",
      hasMany: false,
      required: true,
      label: "Brand",
      admin: {
        description: "The Pokémon brand this card belongs to.",
        appearance: "select",
        sortOptions: "name",
      },
    },
    {
      name: "set",
      type: "relationship",
      relationTo: "sets",
      hasMany: false,
      required: true,
      label: "Set",
      admin: {
        description: "The card set this card belongs to.",
        appearance: "select",
        sortOptions: "name",
      },
    },
    {
      name: "cardName",
      type: "text",
      required: true,
      label: "Card name",
      admin: {
        description: "The card’s name (e.g. Charizard ex).",
      },
    },
    {
      name: "cardNumber",
      type: "text",
      required: true,
      label: "Card number",
      admin: {
        description: 'The set number (e.g. "001/198").',
      },
    },
    {
      name: "fullDisplayName",
      type: "text",
      label: "Full display name",
      admin: {
        description:
          "Combined display text: card name + card number + set name.",
      },
    },
    {
      name: "category",
      type: "text",
      label: "Category",
      admin: {
        description: "Card category (e.g. Pokemon, Trainer, Energy).",
      },
    },
    {
      name: "localId",
      type: "text",
      label: "Local ID",
      admin: {
        description: "Set-local card index (e.g. 136).",
      },
    },
    {
      name: "rarity",
      type: "text",
      label: "Rarity",
      admin: {
        description: "Rarity label (e.g. Double Rare).",
      },
    },
    {
      name: "supertype",
      type: "text",
      label: "Supertype",
      admin: {
        description: "The card’s supertype (e.g. Pokémon, Trainer, Energy).",
      },
    },
    {
      name: "subtypes",
      type: "json",
      label: "Subtypes",
      admin: {
        description: "Card subtypes (array of strings).",
      },
    },
    {
      name: "stage",
      type: "text",
      label: "Stage",
      admin: {
        description: "Evolution stage (e.g. Basic, Stage1).",
      },
    },
    {
      name: "hp",
      type: "number",
      label: "HP",
      admin: {
        description: "Hit points (HP).",
      },
    },
    {
      name: "elementTypes",
      type: "json",
      label: "Element types",
      admin: {
        description: "Energy types associated with the card (array of strings).",
      },
    },
    {
      name: "evolveFrom",
      type: "text",
      label: "Evolves from",
      admin: {
        description: "Name of the previous stage Pokémon.",
      },
    },
    {
      name: "description",
      type: "textarea",
      label: "Description",
      admin: {
        description: "Flavor text (Pokémon) or general card description.",
      },
    },
    {
      name: "effect",
      type: "textarea",
      label: "Effect",
      admin: {
        description: "Card effect text (Trainer and Energy cards).",
      },
    },
    {
      name: "trainerType",
      type: "text",
      label: "Trainer type",
      admin: {
        description: "Type of Trainer card (e.g. Item, Supporter).",
      },
    },
    {
      name: "energyType",
      type: "text",
      label: "Energy type",
      admin: {
        description: "Basic or Special (Energy cards only).",
      },
    },
    {
      name: "dexId",
      type: "json",
      label: "Dex ID(s)",
      admin: {
        description: "National Pokédex ID(s) for Pokémon cards. Array of { value: number }.",
      },
    },
    {
      name: "level",
      type: "text",
      label: "Level",
      admin: {
        description: "Pokémon level (e.g. X for LV.X cards).",
      },
    },
    {
      name: "suffix",
      type: "text",
      label: "Suffix",
      admin: {
        description: "Additional card identifiers for Pokémon.",
      },
    },
    {
      name: "item",
      type: "group",
      label: "Held item",
      admin: {
        description: "Pokémon held item (name and effect).",
      },
      fields: [
        {
          name: "name",
          type: "text",
          label: "Item name",
        },
        {
          name: "effect",
          type: "textarea",
          label: "Item effect",
        },
      ],
    },
    {
      name: "artist",
      type: "text",
      label: "Artist",
      admin: {
        description: "Card artist name.",
      },
    },
    {
      name: "externalId",
      type: "text",
      label: "External ID",
      admin: {
        description:
          "Unique ID from TCGdex (used for deduplication during seeding).",
      },
    },
    {
      name: "variants",
      type: "group",
      label: "Variants",
      admin: {
        description: "Print variants available for this card.",
      },
      fields: [
        {
          name: "firstEdition",
          type: "checkbox",
          label: "First Edition",
          defaultValue: false,
        },
        {
          name: "holo",
          type: "checkbox",
          label: "Holo",
          defaultValue: false,
        },
        {
          name: "normal",
          type: "checkbox",
          label: "Normal",
          defaultValue: false,
        },
        {
          name: "reverse",
          type: "checkbox",
          label: "Reverse",
          defaultValue: false,
        },
        {
          name: "wPromo",
          type: "checkbox",
          label: "W Promo",
          defaultValue: false,
        },
      ],
    },
    {
      name: "attacks",
      type: "json",
      label: "Attacks",
      admin: {
        description: "Card attack moves. Array of { cost: string[], name, effect?, damage? }.",
      },
    },
    {
      name: "weaknesses",
      type: "json",
      label: "Weaknesses",
      admin: {
        description: "Type weaknesses and multiplier. Array of { type, value? }.",
      },
    },
    {
      name: "retreat",
      type: "number",
      label: "Retreat cost",
      admin: {
        description: "Energy cost to retreat.",
      },
    },
    {
      name: "regulationMark",
      type: "text",
      label: "Regulation mark",
      admin: {
        description: "Regulation mark (e.g. D, E).",
      },
    },
    {
      name: "legal",
      type: "group",
      label: "Legal",
      admin: {
        description: "Tournament legality.",
      },
      fields: [
        {
          name: "standard",
          type: "checkbox",
          label: "Standard",
          defaultValue: false,
        },
        {
          name: "expanded",
          type: "checkbox",
          label: "Expanded",
          defaultValue: false,
        },
      ],
    },
    {
      name: "boosters",
      type: "json",
      label: "Boosters",
      admin: {
        description: "Booster packs containing this card (null if in all).",
      },
    },
    {
      name: "pricing",
      type: "json",
      label: "Pricing",
      admin: {
        description: "Market pricing information when available.",
      },
    },
    {
      name: "updated",
      type: "date",
      label: "Last updated (API)",
      admin: {
        description: "When card data was last updated from the API (ISO8601).",
      },
    },
    {
      name: "imageHighUrl",
      type: "text",
      label: "Card image URL (high)",
      admin: {
        description: "Local URL for high-res image (600×825, webp), e.g. /media/cards/high/{setCode}/{localId}.webp",
      },
    },
    {
      name: "imageLowUrl",
      type: "text",
      label: "Card image URL (low)",
      admin: {
        description: "Local URL for low-res image (245×337, webp), e.g. /media/cards/low/{setCode}/{localId}.webp",
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      label: "Active",
      admin: {
        description: "When disabled, this card will be hidden from listings.",
      },
    },
    {
      name: "notes",
      type: "textarea",
      label: "Notes",
      admin: {
        description: "Optional admin notes for this card.",
      },
    },
  ],
};

