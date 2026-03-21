import type { CollectionConfig } from "payload";
import { allowRead, isAdmin } from "../lib/access";

export const Pokemon: CollectionConfig = {
  slug: "pokemon",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "nationalDexNumber", "form", "primaryTyping", "pokemonMedia"],
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
      type: "tabs",
      tabs: [
        {
          label: "Pokemon details",
          fields: [
            {
              name: "name",
              type: "text",
              required: true,
              label: "Pokemon name",
              admin: {
                description: "Pokemon name from the CSV row (e.g. bulbasaur, venusaur-mega).",
              },
            },
            {
              name: "nationalDexNumber",
              type: "number",
              required: true,
              label: "National Dex number",
              admin: {
                description: "National Dex ID used to match this row to Pokemon media.",
              },
            },
            {
              name: "form",
              type: "text",
              required: true,
              label: "Form",
              admin: {
                description: "Pokemon form label from CSV (e.g. Base, Mega, Alolan).",
              },
            },
            {
              name: "generation",
              type: "text",
              required: true,
              label: "Generation",
              admin: {
                description: "Generation string from CSV (e.g. generation-i).",
              },
            },
            {
              name: "legendaryStatus",
              type: "checkbox",
              required: true,
              label: "Legendary status",
              admin: {
                description: "True if this Pokemon form is marked legendary in source data.",
              },
            },
            {
              name: "altFormFlag",
              type: "checkbox",
              required: true,
              label: "Alt form flag",
              admin: {
                description: "True if this row is an alternate form.",
              },
            },
          ],
        },
        {
          label: "Typing and stats",
          fields: [
            {
              name: "primaryTyping",
              type: "text",
              required: true,
              label: "Primary typing",
              admin: {
                description: "Primary Pokemon type.",
              },
            },
            {
              name: "secondaryTyping",
              type: "text",
              label: "Secondary typing",
              admin: {
                description: "Secondary Pokemon type if present.",
              },
            },
            {
              name: "secondaryTypingFlag",
              type: "checkbox",
              required: true,
              label: "Has secondary typing",
              admin: {
                description: "True when secondary typing is present in source data.",
              },
            },
            {
              name: "baseStatTotal",
              type: "number",
              label: "Base stat total",
              admin: {
                description: "Sum of base stats.",
              },
            },
            {
              name: "health",
              type: "number",
              label: "Health",
            },
            {
              name: "attack",
              type: "number",
              label: "Attack",
            },
            {
              name: "defense",
              type: "number",
              label: "Defense",
            },
            {
              name: "specialAttack",
              type: "number",
              label: "Special attack",
            },
            {
              name: "specialDefense",
              type: "number",
              label: "Special defense",
            },
            {
              name: "speed",
              type: "number",
              label: "Speed",
            },
          ],
        },
        {
          label: "Meta and measurements",
          fields: [
            {
              name: "evolutionStage",
              type: "number",
              label: "Evolution stage",
            },
            {
              name: "numberOfEvolution",
              type: "number",
              label: "Number of evolutions",
            },
            {
              name: "colorId",
              type: "text",
              label: "Color ID",
            },
            {
              name: "catchRate",
              type: "number",
              label: "Catch rate",
            },
            {
              name: "heightDm",
              type: "number",
              label: "Height (dm)",
            },
            {
              name: "weightHg",
              type: "number",
              label: "Weight (hg)",
            },
            {
              name: "heightIn",
              type: "number",
              label: "Height (in)",
            },
            {
              name: "weightLbs",
              type: "number",
              label: "Weight (lbs)",
            },
          ],
        },
        {
          label: "Image",
          fields: [
            {
              name: "pokemonMedia",
              type: "relationship",
              relationTo: "pokemon-media",
              hasMany: false,
              label: "Pokemon media",
              admin: {
                description: "Linked image from Pokemon Medias collection (matched by Dex ID).",
              },
            },
            {
              name: "imageFilename",
              type: "text",
              required: true,
              label: "Image filename",
              admin: {
                description: "Stored source filename for this Pokemon image object in R2.",
              },
            },
            {
              name: "imagePath",
              type: "text",
              required: true,
              label: "Image path",
              admin: {
                description: "Object path within the Pokemon R2 bucket.",
              },
            },
            {
              name: "imageUrl",
              type: "text",
              required: true,
              label: "Image URL",
              admin: {
                description: "Fully resolved URL used by frontend clients.",
              },
            },
          ],
        },
      ],
    },
  ],
};
