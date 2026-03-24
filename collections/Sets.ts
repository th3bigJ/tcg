import type { CollectionConfig } from "payload";
import { allowRead, isAdmin } from "../lib/access";
import { slugify } from "../lib/slugs";

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
  hooks: {
    beforeValidate: [
      async ({ data, operation, req, originalDoc }) => {
        if (!data || typeof data !== "object") return data;

        const mutableData = data as Record<string, unknown>;
        const name = typeof mutableData.name === "string" ? mutableData.name.trim() : "";

        // Keep slug based on set name so admin edits stay consistent.
        if (!name) return mutableData;

        const baseSlug = slugify(name);
        if (!baseSlug) return mutableData;

        let candidate = baseSlug;
        let suffix = 2;

        while (true) {
          const existing = await req.payload.find({
            collection: "sets",
            where: {
              slug: {
                equals: candidate,
              },
            },
            limit: 1,
            depth: 0,
            select: { id: true },
            overrideAccess: true,
          });

          if (existing.totalDocs === 0) break;

          const foundId = existing.docs[0]?.id;
          const currentId =
            operation === "update"
              ? (originalDoc as { id?: number | string } | undefined)?.id
              : undefined;

          if (currentId != null && foundId != null && String(foundId) === String(currentId)) {
            break;
          }

          candidate = `${baseSlug}-${suffix}`;
          suffix++;
        }

        mutableData.slug = candidate;
        return mutableData;
      },
    ],
  },
  timestamps: true,
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Set details",
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
              label: "Legacy set code",
              admin: {
                description:
                  'Legacy/internal set code kept for backward compatibility (example: "swsh3" or "base1"). Prefer tcgdexId for API lookups.',
              },
            },
            {
              name: "tcgdexId",
              type: "text",
              unique: true,
              label: "TCGdex canonical id",
              admin: {
                description:
                  'Canonical TCGdex set id used for direct API lookups (example: "me02.5").',
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
              name: "isActive",
              type: "checkbox",
              defaultValue: true,
              label: "Active",
              admin: {
                description: "When disabled, this set will not be used for new items.",
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
              name: "serieName",
              type: "relationship",
              relationTo: "series",
              hasMany: false,
              label: "Series name",
              admin: {
                description: "Linked series record (created from unique series names).",
                appearance: "select",
                sortOptions: "name",
              },
            },
          ],
        },
        {
          label: "Images",
          fields: [
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
          ],
        },
        {
          label: "Linked records",
          fields: [
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
        },
      ],
    },
  ],
};

