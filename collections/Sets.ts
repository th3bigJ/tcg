import type { CollectionConfig } from "payload";
import { allowRead, isAdmin } from "../lib/access";

export const Sets: CollectionConfig = {
  slug: "sets",
  admin: {
    useAsTitle: "name",
  },
  access: {
    admin: isAdmin,
    read: allowRead,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  timestamps: true,
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      label: "Set name",
      admin: {
        description: "Human-friendly name of the Pokémon card set.",
      },
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      label: "Set slug",
      admin: {
        description: "A unique identifier for the set (used for URLs / lookups).",
      },
    },
    {
      name: "code",
      type: "text",
      label: "TCGdex set id",
      admin: {
        description:
          'TCGdex set id used for seeding (example: "swsh3" or "base1").',
      },
    },
    {
      name: "brand",
      type: "relationship",
      relationTo: "brands",
      hasMany: false,
      required: true,
      label: "Brand",
      admin: {
        description: "The Pokémon brand that this set belongs to.",
        appearance: "select",
        sortOptions: "name",
      },
    },
    {
      name: "releaseDate",
      type: "date",
      label: "Release date",
      admin: {
        description: "Optional release date for this set.",
      },
    },
    {
      name: "cardCountTotal",
      type: "number",
      label: "Total card count",
      admin: {
        description: "Total number of cards in the set (TCGdex cardCount.total).",
      },
    },
    {
      name: "cardCountOfficial",
      type: "number",
      label: "Official card count",
      admin: {
        description:
          "Official number of cards in the set (TCGdex cardCount.official).",
      },
    },
    {
      name: "cardCountFirstEd",
      type: "number",
      label: "First edition card count",
      admin: {
        description: "Number of first edition cards (TCGdex cardCount.firstEd).",
      },
    },
    {
      name: "cardCountHolo",
      type: "number",
      label: "Holo card count",
      admin: {
        description: "Number of cards with holo version (TCGdex cardCount.holo).",
      },
    },
    {
      name: "cardCountNormal",
      type: "number",
      label: "Normal card count",
      admin: {
        description:
          "Number of cards with normal version (TCGdex cardCount.normal).",
      },
    },
    {
      name: "cardCountReverse",
      type: "number",
      label: "Reverse card count",
      admin: {
        description:
          "Number of cards with reverse version (TCGdex cardCount.reverse).",
      },
    },
    {
      name: "legalStandard",
      type: "checkbox",
      label: "Legal in Standard",
      admin: {
        description: "Whether the set is playable in Standard tournaments.",
      },
    },
    {
      name: "legalExpanded",
      type: "checkbox",
      label: "Legal in Expanded",
      admin: {
        description: "Whether the set is playable in Expanded tournaments.",
      },
    },
    {
      name: "serieId",
      type: "text",
      label: "Series id",
      admin: {
        description: "TCGdex series id (e.g. swsh, sv).",
      },
    },
    {
      name: "serieName",
      type: "text",
      label: "Series name",
      admin: {
        description: "TCGdex series name (e.g. Sword & Shield).",
      },
    },
    {
      name: "symbolImage",
      type: "upload",
      relationTo: "set-symbol-media",
      label: "Set symbol image",
      admin: {
        description: "Upload an image for the set symbol.",
      },
    },
    {
      name: "setImage",
      type: "upload",
      relationTo: "set-logo-media",
      label: "Set image",
      admin: {
        description: "Upload an image for the set cover.",
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      label: "Active",
      admin: {
        description: "When disabled, this set will not be used for new items.",
      },
    },
    {
      name: "notes",
      type: "textarea",
      label: "Admin notes",
      admin: {
        description: "Internal notes for this set.",
      },
    },
    // Virtual join: show Master Card List entries that reference this Set (via MasterCardList.set)
    {
      name: "linkedMasterCards",
      type: "join",
      label: "Master cards in this set",
      collection: "master-card-list",
      on: "set",
      admin: {
        description: "Master card list entries in this set (linked via each card’s Set field).",
        defaultColumns: ["fullDisplayName", "cardNumber", "rarity"],
      },
    },
  ],
};

