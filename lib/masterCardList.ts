import type { CollectionBeforeValidateHook } from "payload";

type RelationshipID = number | string;

export const getRelationshipID = (value: unknown): RelationshipID | undefined => {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    const idValue = record.id;
    if (typeof idValue === "number" || typeof idValue === "string") {
      return idValue;
    }

    const nestedValue = record.value;
    if (typeof nestedValue === "number" || typeof nestedValue === "string") {
      return nestedValue;
    }
  }

  return undefined;
};

export const syncBrandFromSetHook: CollectionBeforeValidateHook = async ({
  data,
  req,
}) => {
  if (!data || typeof data !== "object") {
    return data;
  }

  const mutableData = data as Record<string, unknown>;
  const setID = getRelationshipID(mutableData.set);
  if (!setID) {
    return mutableData;
  }

  const setDoc = await req.payload.findByID({
    collection: "sets",
    id: setID,
    depth: 0,
    overrideAccess: true,
    select: {
      brand: true,
    },
  });

  if (!setDoc || typeof setDoc !== "object") {
    return mutableData;
  }

  const setRecord = setDoc as Record<string, unknown>;
  const brandID = getRelationshipID(setRecord.brand);
  if (brandID) {
    mutableData.brand = brandID;
  }

  return mutableData;
};
