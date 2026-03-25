import type { CollectionConfig } from "payload";
import { allowRead, isAdmin } from "../lib/access";
import { getRelationshipID, syncBrandFromSetHook } from "../lib/masterCardList";

export const MasterCardList: CollectionConfig = {
  slug: "master-card-list",
  admin: {
    useAsTitle: "fullDisplayName",
    listSearchableFields: ["cardName", "cardNumber", "fullDisplayName"],
    defaultColumns: ["fullDisplayName", "set", "rarity", "cardNumber"],
  },
  access: {
    admin: isAdmin,
    read: allowRead,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [syncBrandFromSetHook],
  },
  timestamps: true,
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Core",
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
              index: true,
              label: "Set",
              filterOptions: ({ siblingData }) => {
                if (siblingData && typeof siblingData === "object") {
                  const brandID = getRelationshipID(
                    (siblingData as Record<string, unknown>).brand,
                  );
                  if (brandID) {
                    return {
                      brand: {
                        equals: brandID,
                      },
                    };
                  }
                }

                return true;
              },
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
              name: "externalId",
              type: "text",
              label: "External ID",
              admin: {
                description:
                  "Unique ID from TCGdex (used for deduplication during seeding).",
              },
            },
            {
              name: "tcgdex_id",
              type: "text",
              label: "TCGdex ID",
              admin: {
                description:
                  "Canonical TCGdex card id (e.g. base1-55) once resolved via the API. See “No pricing” if the card exists but has no TCGPlayer/Cardmarket data.",
              },
            },
            {
              name: "no_pricing",
              type: "checkbox",
              defaultValue: false,
              label: "No pricing on TCGdex",
              admin: {
                description:
                  "True when tcgdex_id resolves to a real card but TCGdex returns no TCGPlayer/Cardmarket pricing. False when pricing exists, or when tcgdex_id is empty.",
              },
            },
            {
              name: "artist",
              type: "text",
              index: true,
              label: "Artist",
              admin: {
                description: "Card artist name.",
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
          ],
        },
        {
          label: "Classification",
          fields: [
            {
              name: "category",
              type: "text",
              index: true,
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
              index: true,
              label: "Rarity",
              admin: {
                description: "Rarity label (e.g. Double Rare).",
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
              name: "regulationMark",
              type: "text",
              label: "Regulation mark",
              admin: {
                description: "Regulation mark (e.g. D, E).",
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
              name: "dexId",
              type: "json",
              label: "Dex ID(s)",
              admin: {
                description: "National Pokédex ID(s) for Pokémon cards. Array of { value: number }.",
              },
            },
          ],
        },
        {
          label: "Images",
          fields: [
            {
              name: "imageHigh",
              type: "upload",
              relationTo: "card-media",
              label: "Card image (high)",
              admin: {
                description: "High-resolution card image (linked from Card Media).",
              },
            },
            {
              name: "imageLow",
              type: "upload",
              relationTo: "card-media",
              index: true,
              label: "Card image (low)",
              admin: {
                description: "Low-resolution card image (linked from Card Media).",
              },
            },
          ],
        },
      ],
    },
  ],
};

